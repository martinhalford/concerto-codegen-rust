const winston = require("winston");

// Configure logger for this module
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class InkAbiDecoder {
  constructor(api, contract) {
    this.api = api;
    this.contract = contract;
    this.registry = api.registry;
  }

  /**
   * Decode ink! contract events using manual SCALE parsing
   * This solves the Polkadot.js ABI compatibility issue
   */
  decodeContractEvent(eventBytes) {
    try {
      // Convert to Uint8Array if needed
      let eventData;
      let originalInput;

      if (typeof eventBytes.toHex === "function") {
        // Polkadot.js object with toHex method - prefer this over toU8a for consistency
        const hexString = eventBytes.toHex();
        const cleanHex = hexString.startsWith("0x")
          ? hexString.slice(2)
          : hexString;
        eventData = new Uint8Array(
          cleanHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
        );
        originalInput = hexString;
      } else if (typeof eventBytes.toU8a === "function") {
        // Polkadot.js object with toU8a method (fallback)
        eventData = eventBytes.toU8a();
        originalInput = "toU8a-method";
      } else if (typeof eventBytes === "string") {
        // Raw hex string
        const cleanHex = eventBytes.startsWith("0x")
          ? eventBytes.slice(2)
          : eventBytes;
        eventData = new Uint8Array(
          cleanHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
        );
        originalInput = eventBytes;
      } else if (eventBytes instanceof Uint8Array) {
        // Already a byte array
        eventData = eventBytes;
        originalInput = "Uint8Array";
      } else {
        // Fallback - try to convert
        eventData = eventBytes;
        originalInput = typeof eventBytes;
      }

      // Debug log the conversion
      logger.info("Hex to bytes conversion", {
        originalInput: originalInput,
        originalType: typeof eventBytes,
        originalInputLength: originalInput ? originalInput.length : 0,
        convertedLength: eventData.length,
        expectedLength:
          originalInput && originalInput.startsWith("0x")
            ? (originalInput.length - 2) / 2
            : 0,
        firstBytes: Array.from(eventData.slice(0, 8))
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
        lastBytes: Array.from(eventData.slice(-4))
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
        hexCheck: originalInput ? originalInput.slice(2, 18) : "none", // First 8 bytes from hex
      });

      logger.info("Attempting manual ABI decoding", {
        eventLength: eventData.length,
        firstBytes: Array.from(eventData.slice(0, 8)).map(
          (b) => `0x${b.toString(16).padStart(2, "0")}`
        ),
      });

      // Try to identify the event by parsing the first few bytes
      const eventInfo = this.identifyEvent(eventData);
      if (!eventInfo) {
        throw new Error("Could not identify event type");
      }

      logger.info("Event identified", {
        eventType: eventInfo.type,
        eventIndex: eventInfo.index,
        identifier: eventInfo.identifier,
      });

      // Parse based on event type
      switch (eventInfo.type) {
        case "DraftRequested":
          return this.decodeDraftRequestedEvent(eventData, eventInfo);
        case "DraftReady":
          return this.decodeDraftReadyEvent(eventData, eventInfo);
        case "DraftError":
          return this.decodeDraftErrorEvent(eventData, eventInfo);
        case "LateDeliveryAndPenaltyRequestSubmitted":
          return this.decodeLateDeliveryRequestEvent(eventData, eventInfo);
        case "LateDeliveryAndPenaltyResponseGenerated":
          return this.decodeLateDeliveryResponseEvent(eventData, eventInfo);
        default:
          throw new Error(`Unsupported event type: ${eventInfo.type}`);
      }
    } catch (error) {
      logger.error("Manual ABI decoding failed", {
        error: error.message,
        eventLength: eventBytes.length,
      });
      throw error;
    }
  }

  /**
   * Identify event type by analyzing the data structure
   */
  identifyEvent(eventData) {
    // Get available events from ABI
    const events = this.contract.abi.events;

    logger.info("Event identification analysis", {
      eventLength: eventData.length,
      availableEvents: Object.keys(events),
      firstFewBytes: Array.from(eventData.slice(0, 12))
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
    });

    // For DraftRequested events, we expect: AccountId(32) + u64(8) + u64(8) + String(variable)
    // This gives us large events (400+ bytes) with JSON data
    if (eventData.length > 100) {
      logger.info("Identified as DraftRequested event (length > 100)");
      return {
        type: "DraftRequested",
        index: 3,
        identifier:
          "late_delivery_and_penalty::latedeliveryandpenalty::DraftRequested",
        eventDef: events["3"],
      };
    }

    // For shorter events, try to determine type by length and structure
    if (eventData.length === 40) {
      // 40 bytes = AccountId(32) + u64(8) - likely LateDeliveryRequestSubmitted
      logger.info(
        "Identified as LateDeliveryRequestSubmitted event (40 bytes)"
      );
      return {
        type: "LateDeliveryAndPenaltyRequestSubmitted",
        index: 6,
        identifier:
          "late_delivery_and_penalty::latedeliveryandpenalty::LateDeliveryAndPenaltyRequestSubmitted",
        eventDef: events["6"],
      };
    }

    if (eventData.length === 9) {
      // 9 bytes = u64(8) + bool(1) - likely LateDeliveryResponseGenerated
      logger.info(
        "Identified as LateDeliveryResponseGenerated event (9 bytes)"
      );
      return {
        type: "LateDeliveryAndPenaltyResponseGenerated",
        index: 7,
        identifier:
          "late_delivery_and_penalty::latedeliveryandpenalty::LateDeliveryAndPenaltyResponseGenerated",
        eventDef: events["7"],
      };
    }

    logger.warn("Could not identify event type", {
      eventLength: eventData.length,
      supportedLengths: ["> 100 bytes", "40 bytes", "9 bytes"],
    });

    return null;
  }

  /**
   * Decode DraftRequested event
   * Structure: requester (AccountId, indexed) + request_id (u64) + template_data (String) + timestamp (u64)
   */
  decodeDraftRequestedEvent(eventData, eventInfo) {
    let offset = 0;

    // 1. requester (AccountId) - 32 bytes (indexed field included in event data)
    const requesterBytes = eventData.slice(offset, offset + 32);
    const requester = this.registry.createType("AccountId", requesterBytes);
    offset += 32;

    // 2. request_id (u64) - 8 bytes, little endian
    const requestIdBytes = eventData.slice(offset, offset + 8);
    const requestId = this.registry.createType("u64", requestIdBytes);
    offset += 8;

    // 3. template_data (String) - compact length + utf8 data (CORRECTED ORDER)
    const stringDataStart = eventData.slice(offset);
    const { value: templateData, bytesRead } =
      this.decodeScaleString(stringDataStart);
    offset += bytesRead;

    // 4. timestamp (u64) - 8 bytes, little endian (CORRECTED ORDER)
    const timestampBytes = eventData.slice(offset, offset + 8);
    const timestamp = this.registry.createType("u64", timestampBytes);

    logger.info("DraftRequested event decoded successfully", {
      requester: requester.toString(),
      requestId: requestId.toString(),
      timestamp: timestamp.toString(),
      templateDataLength: templateData.length,
    });

    return {
      event: {
        identifier: eventInfo.identifier,
        args: {
          requester: requester.toString(),
          request_id: requestId.toNumber(),
          template_data: templateData,
          timestamp: timestamp.toNumber(),
        },
      },
    };
  }

  /**
   * Decode LateDeliveryAndPenaltyRequestSubmitted event
   * Structure: submitter (AccountId, indexed) + request_id (u64)
   */
  decodeLateDeliveryRequestEvent(eventData, eventInfo) {
    let offset = 0;

    // 1. submitter (AccountId) - 32 bytes (indexed field included in event data)
    const submitterBytes = eventData.slice(offset, offset + 32);
    const submitter = this.registry.createType("AccountId", submitterBytes);
    offset += 32;

    // 2. request_id (u64) - 8 bytes, little endian
    const requestIdBytes = eventData.slice(offset, offset + 8);
    const requestId = this.registry.createType("u64", requestIdBytes);

    logger.info("LateDeliveryRequestSubmitted event decoded", {
      submitter: submitter.toString(),
      requestId: requestId.toString(),
    });

    return {
      event: {
        identifier: eventInfo.identifier,
        args: {
          submitter: submitter.toString(),
          request_id: requestId.toNumber(),
        },
      },
    };
  }

  /**
   * Decode LateDeliveryAndPenaltyResponseGenerated event
   * Structure: request_id (u64, indexed) + success (bool)
   */
  decodeLateDeliveryResponseEvent(eventData, eventInfo) {
    let offset = 0;

    // 1. request_id (u64) - 8 bytes, little endian (indexed field included in event data)
    const requestIdBytes = eventData.slice(offset, offset + 8);
    const requestId = this.registry.createType("u64", requestIdBytes);
    offset += 8;

    // 2. success (bool) - 1 byte
    const successByte = eventData[offset];
    const success = successByte === 1;

    logger.info("LateDeliveryResponseGenerated event decoded", {
      requestId: requestId.toString(),
      success: success,
    });

    return {
      event: {
        identifier: eventInfo.identifier,
        args: {
          request_id: requestId.toNumber(),
          success: success,
        },
      },
    };
  }

  /**
   * Decode DraftReady and DraftError events (similar structure)
   */
  decodeDraftReadyEvent(eventData, eventInfo) {
    // Similar to DraftRequested but with ipfs_hash instead of template_data
    // Implementation would be similar to decodeDraftRequestedEvent
    throw new Error("DraftReady event decoding not yet implemented");
  }

  decodeDraftErrorEvent(eventData, eventInfo) {
    // Similar to DraftRequested but with error_message instead of template_data
    // Implementation would be similar to decodeDraftRequestedEvent
    throw new Error("DraftError event decoding not yet implemented");
  }

  /**
   * Decode SCALE-encoded string
   * Format: compact length + utf8 bytes
   */
  decodeScaleString(data) {
    try {
      // Decode compact length
      const compact = this.registry.createType("Compact<u32>", data);
      const stringLength = compact.toNumber();
      const bytesRead = compact.encodedLength;

      // Extract string data
      const stringBytes = data.slice(bytesRead, bytesRead + stringLength);
      const value = new TextDecoder().decode(stringBytes);

      // Clean up any trailing null bytes or garbage
      const cleanValue = value.replace(/\0+$/, "").trim();

      // For JSON strings, clean up any trailing non-JSON characters
      if (cleanValue.startsWith("{") || cleanValue.startsWith('"')) {
        const lastBraceIndex = cleanValue.lastIndexOf("}");
        if (lastBraceIndex !== -1 && lastBraceIndex < cleanValue.length - 1) {
          return {
            value: cleanValue.substring(0, lastBraceIndex + 1),
            bytesRead: bytesRead + stringLength,
          };
        }
      }

      return {
        value: cleanValue,
        bytesRead: bytesRead + stringLength,
      };
    } catch (error) {
      logger.error("Failed to decode SCALE string", {
        error: error.message,
        dataLength: data.length,
      });
      throw error;
    }
  }

  /**
   * Get event definition by name
   */
  getEventByName(eventName) {
    const events = this.contract.abi.events;
    for (let i = 0; i < 8; i++) {
      const event = events[i.toString()];
      if (event && event.identifier.includes(eventName)) {
        return { ...event, index: i };
      }
    }
    return null;
  }

  /**
   * List all available events
   */
  listEvents() {
    const events = this.contract.abi.events;
    const eventList = [];

    for (let i = 0; i < 8; i++) {
      const event = events[i.toString()];
      if (event) {
        eventList.push({
          index: i,
          identifier: event.identifier,
          args: event.args.map((arg) => ({
            name: arg.name,
            indexed: arg.indexed,
            type: arg.type,
          })),
        });
      }
    }

    return eventList;
  }
}

module.exports = { InkAbiDecoder };
