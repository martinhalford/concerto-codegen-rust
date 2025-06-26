const { ApiPromise, WsProvider } = require("@polkadot/api");
const { ContractPromise } = require("@polkadot/api-contract");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady } = require("@polkadot/util-crypto");
const { TemplateArchiveProcessor } = require("@accordproject/template-engine");
const { Template } = require("@accordproject/cicero-core");
const winston = require("winston");
const express = require("express");
const fs = require("fs");
const path = require("path");
const markdownpdf = require("markdown-pdf");

// Load environment variables
require("dotenv").config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, "../logs/error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "../logs/combined.log"),
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class DraftService {
  constructor() {
    this.api = null;
    this.contract = null;
    this.keyring = null;
    this.serviceAccount = null;
    this.template = null;
    this.templateProcessor = null;
    this.isRunning = false;
    this.documentsDir =
      process.env.DOCUMENTS_OUTPUT_DIR || "./generated-documents";
    this.outputFormat = process.env.OUTPUT_FORMAT || "md"; // 'md' or 'pdf'
    this.failedEvents = []; // Store failed events for debugging and UI display
    this.maxFailedEvents = 50; // Limit stored failed events
  }

  async initialize() {
    try {
      logger.info("Initializing Draft Service...");

      // Wait for crypto libraries to be ready
      await cryptoWaitReady();

      // Initialize Polkadot API
      const wsProvider = new WsProvider(process.env.SUBSTRATE_WS_URL);
      this.api = await ApiPromise.create({ provider: wsProvider });
      logger.info(
        `Connected to Substrate node: ${process.env.SUBSTRATE_WS_URL}`
      );

      // Initialize keyring and service account
      this.keyring = new Keyring({ type: "sr25519" });
      this.serviceAccount = this.keyring.addFromUri(
        process.env.SERVICE_PRIVATE_KEY
      );
      logger.info(
        `Service account initialized: ${this.serviceAccount.address}`
      );

      // Initialize contract
      const contractAbi = this.loadContractAbi();

      // Debug the loaded ABI
      logger.info("Loaded ABI structure:", {
        hasSpec: !!contractAbi.spec,
        hasEvents: !!contractAbi.spec?.events,
        eventsCount: contractAbi.spec?.events?.length || 0,
        eventNames: contractAbi.spec?.events?.map((e) => e.label) || [],
        draftRequestedEvent: contractAbi.spec?.events?.find(
          (e) => e.label === "DraftRequested"
        ),
      });

      this.contract = new ContractPromise(
        this.api,
        contractAbi,
        process.env.CONTRACT_ADDRESS
      );
      logger.info(`Contract initialized: ${process.env.CONTRACT_ADDRESS}`);

      // Initialize local documents directory
      this.initializeDocumentsDirectory();

      // Initialize logs directory
      this.initializeLogsDirectory();

      // Initialize Accord Project template
      await this.initializeTemplate();

      logger.info("Draft Service initialization complete");
    } catch (error) {
      logger.error("Failed to initialize Draft Service:", error);
      throw error;
    }
  }

  loadContractAbi() {
    // Load the actual contract ABI from the deployment
    const contractPath = path.resolve(
      "../inkathon/contracts/late-delivery-and-penalty/deployments/late-delivery-and-penalty.json"
    );
    try {
      const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
      logger.info(`Contract ABI loaded from: ${contractPath}`);
      return contractData;
    } catch (error) {
      logger.error("Failed to load contract ABI:", error);
      throw error;
    }
  }

  initializeDocumentsDirectory() {
    try {
      if (!fs.existsSync(this.documentsDir)) {
        fs.mkdirSync(this.documentsDir, { recursive: true });
      }
      logger.info(`Documents directory initialized: ${this.documentsDir}`);
    } catch (error) {
      logger.error("Failed to initialize documents directory:", error);
      throw error;
    }
  }

  initializeLogsDirectory() {
    try {
      const logsDir = path.join(__dirname, "../logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      logger.info(`Logs directory initialized: ${logsDir}`);
    } catch (error) {
      logger.error("Failed to initialize logs directory:", error);
      throw error;
    }
  }

  async initializeTemplate() {
    const templatePath = path.resolve(process.env.TEMPLATE_ARCHIVE_PATH);

    // Try multiple initialization approaches
    const initMethods = [
      // Method 1: Basic initialization with timeout
      async () => {
        logger.info(
          "Attempting template initialization (method 1: basic with timeout)..."
        );
        return await Promise.race([
          Template.fromDirectory(templatePath),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(new Error("Template initialization timeout after 15s")),
              15000
            )
          ),
        ]);
      },

      // Method 2: Try with offline option
      async () => {
        logger.info(
          "Attempting template initialization (method 2: offline mode)..."
        );
        return await Template.fromDirectory(templatePath, { offline: true });
      },

      // Method 3: Try with no external model updates
      async () => {
        logger.info(
          "Attempting template initialization (method 3: skip external models)..."
        );
        return await Template.fromDirectory(templatePath, {
          skipUpdateExternalModels: true,
        });
      },
    ];

    for (let i = 0; i < initMethods.length; i++) {
      try {
        this.template = await initMethods[i]();
        this.templateProcessor = new TemplateArchiveProcessor(this.template);
        logger.info(
          `Template loaded from: ${templatePath} (method ${i + 1} successful)`
        );
        return; // Success, exit the function
      } catch (error) {
        logger.warn(
          `Template initialization method ${i + 1} failed:`,
          error.message
        );
        if (i === initMethods.length - 1) {
          // Last method failed, throw error
          logger.error("All template initialization methods failed");
          throw error;
        }
        // Continue to next method
      }
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Service is already running");
      return;
    }

    try {
      await this.initialize();
      this.isRunning = true;

      // Start listening for events
      await this.listenForEvents();

      // Start health check server
      this.startHealthServer();

      logger.info("Draft Service started successfully");
    } catch (error) {
      logger.error("Failed to start Draft Service:", error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      // Cleanup event subscription
      if (this.eventUnsubscriber) {
        this.eventUnsubscriber();
        this.eventUnsubscriber = null;
      }

      // Close API connection
      if (this.api) {
        await this.api.disconnect();
        this.api = null;
      }

      this.isRunning = false;
      logger.info("Draft Service stopped successfully");
    } catch (error) {
      logger.error("Error stopping Draft Service:", error);
    }
  }

  async listenForEvents() {
    logger.info("Starting to listen for DraftRequested events...");

    // Subscribe to system events to catch contract events
    const unsub = await this.api.query.system.events((events) => {
      events.forEach((record) => {
        const { event, phase } = record;

        // Check if this is a contract event
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          try {
            // Extract contract address and data from the event
            const eventData = event.data;
            const contractAddress = eventData[0].toString();
            const eventBytes = eventData[1];

            // Check if this event is from our contract
            if (contractAddress === process.env.CONTRACT_ADDRESS) {
              logger.info("Event from our contract, attempting to decode...");

              // Debug the complete event structure
              logger.info("Complete event structure:", {
                section: event.section,
                method: event.method,
                data: event.data.map((d) => d.toString()),
                topics: event.topics?.map((t) => t.toString()) || "no topics",
              });

              // Debug the raw event data
              logger.info("Raw event data:", {
                contractAddress: contractAddress,
                eventBytesType: typeof eventBytes,
                eventBytesLength: eventBytes.length,
                eventBytesString: eventBytes.toString(),
                eventBytesHex: eventBytes.toHex
                  ? eventBytes.toHex()
                  : "no toHex method",
              });

              // Try to decode using the contract ABI
              try {
                // Debug the ABI structure
                logger.info("ABI debugging info:", {
                  hasAbi: !!this.contract.abi,
                  abiEvents: this.contract.abi?.events
                    ? Object.keys(this.contract.abi.events)
                    : "no events",
                  decodeEventMethod: typeof this.contract.abi.decodeEvent,
                  eventBytesType: typeof eventBytes,
                  eventBytesConstructor: eventBytes.constructor.name,
                  eventBytesLength: eventBytes.length,
                });

                // Check if eventBytes needs conversion
                let eventData = eventBytes;
                if (typeof eventBytes.toU8a === "function") {
                  eventData = eventBytes.toU8a();
                  logger.info("Converted eventBytes to Uint8Array");
                }

                logger.info("Calling decodeEvent with data:", {
                  dataType: typeof eventData,
                  dataConstructor: eventData.constructor.name,
                  dataLength: eventData.length,
                  firstFewBytes: Array.from(eventData.slice(0, 10)),
                  fullHex: Array.from(eventData)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join(""),
                });

                // Try to manually parse the hex data to understand the structure
                logger.info("Manual hex analysis:", {
                  originalHex: eventBytes.toHex(),
                  possibleEventId: eventBytes.toHex().slice(0, 8),
                  remainingData: eventBytes.toHex().slice(8),
                });

                // Try multiple decoding approaches
                let decoded;

                // Approach 1: Direct decodeEvent call
                try {
                  decoded = this.contract.abi.decodeEvent(eventData);
                  logger.info("Approach 1 (direct decodeEvent) succeeded");
                } catch (approach1Error) {
                  logger.warn("Approach 1 failed:", approach1Error.message);

                  // Approach 2: Try finding the event by signature topic
                  try {
                    // The DraftRequested signature topic
                    const draftRequestedTopic =
                      "0xa95a60bdaef26fa2156a65a63a4370085b124a2548dd2f66ce72fd4cdffcd75f";

                    // Create a proper event record structure
                    const eventRecord = {
                      phase: { isInitialization: false },
                      event: {
                        section: "contracts",
                        method: "ContractEmitted",
                        data: [contractAddress, eventData],
                        topics: [draftRequestedTopic], // Add the signature topic
                      },
                    };

                    logger.info("Trying with event record structure");
                    decoded = this.contract.abi.decodeEvent(eventRecord);
                    logger.info("Approach 2 (with event record) succeeded");
                  } catch (approach2Error) {
                    logger.warn("Approach 2 failed:", approach2Error.message);

                    // Approach 3: Try decoding with the contract's event registry
                    try {
                      const registry = this.api.registry;
                      const eventRecord = registry.createType(
                        "ContractEventData",
                        eventData
                      );
                      decoded = this.contract.abi.decodeEvent(eventRecord);
                      logger.info("Approach 3 (with registry) succeeded");
                    } catch (approach3Error) {
                      logger.error(
                        "All decoding approaches failed:",
                        approach3Error.message
                      );
                      throw approach1Error; // Throw the original error
                    }
                  }
                }

                if (decoded) {
                  logger.info("Decoded event structure:", {
                    event: decoded.event?.identifier,
                    args: decoded.args,
                    eventKeys: Object.keys(decoded.event || {}),
                    argsType: Array.isArray(decoded.args)
                      ? "array"
                      : typeof decoded.args,
                  });
                }

                if (
                  decoded &&
                  decoded.event &&
                  decoded.event.identifier === "DraftRequested"
                ) {
                  logger.info("DraftRequested event successfully decoded!");

                  // Extract the event arguments (handling both array and object format)
                  const args = decoded.args || decoded.event.args;
                  const eventInfo = {
                    name: "DraftRequested",
                    data: {
                      requester: Array.isArray(args)
                        ? args[0].toString()
                        : args.requester.toString(),
                      request_id: Array.isArray(args)
                        ? args[1].toNumber
                          ? args[1].toNumber()
                          : parseInt(args[1].toString())
                        : args.request_id.toNumber
                        ? args.request_id.toNumber()
                        : parseInt(args.request_id.toString()),
                      template_data: Array.isArray(args)
                        ? args[2].toString()
                        : args.template_data.toString(),
                      timestamp: Array.isArray(args)
                        ? args[3].toNumber
                          ? args[3].toNumber()
                          : parseInt(args[3].toString())
                        : args.timestamp.toNumber
                        ? args.timestamp.toNumber()
                        : parseInt(args.timestamp.toString()),
                    },
                  };

                  // Process the draft request
                  this.processDraftRequest(eventInfo.data);
                }
              } catch (decodeError) {
                const abiError = {
                  message: decodeError.message,
                  type: "ABI_DECODE_FAILURE",
                  eventLength: eventBytes.length,
                  timestamp: Date.now(),
                };

                logger.error("Failed to decode event with ABI:", abiError);

                // Store ABI failure for debugging
                this.recordFailedEvent({
                  contractAddress,
                  eventHex: eventBytes.toHex(),
                  error: `ABI Decode Failed: ${decodeError.message}`,
                  timestamp: Date.now(),
                  reason: "ABI_DECODE_FAILURE",
                });

                // Fallback: Try to manually parse if it's a DraftRequested event
                // Look for the signature topic in the event
                logger.info("Attempting manual event parsing fallback...");

                try {
                  // Check if this matches our DraftRequested signature topic
                  const draftRequestedTopic =
                    "0xa95a60bdaef26fa2156a65a63a4370085b124a2548dd2f66ce72fd4cdffcd75f";

                  // Try to manually parse the hex data
                  const hexData = eventBytes.toHex();
                  logger.info("Attempting manual hex parsing:", {
                    fullHex: hexData,
                    length: hexData.length,
                    possibleStructures: {
                      if_account_based: hexData.slice(0, 66), // First 32 bytes as account
                      if_event_id: hexData.slice(0, 10), // First 4 bytes as event ID
                      remaining: hexData.slice(66),
                    },
                  });

                  // Look for DraftRequested event pattern
                  // Based on the ABI, DraftRequested has: requester (AccountId), request_id (u64), template_data (String), timestamp (u64)

                  // Analyze event patterns we're seeing:
                  // - 40-byte events: Account ID (32 bytes) + extra data (8 bytes)
                  // - 9-byte events: Shorter data, likely request_id + flags

                  if (hexData.length === 82) {
                    // 40 bytes = 80 hex chars + "0x" prefix
                    logger.info(
                      "Processing 40-byte event (likely contains AccountId)"
                    );
                    const accountBytes = hexData.slice(2, 66); // First 32 bytes as account
                    const extraData = hexData.slice(66); // Remaining 8 bytes
                    logger.info("Event analysis:", {
                      accountHex: "0x" + accountBytes,
                      extraDataHex: "0x" + extraData,
                      extraDataDecimal: parseInt(extraData, 16),
                    });
                  } else if (hexData.length === 20) {
                    // 9 bytes = 18 hex chars + "0x" prefix
                    logger.info(
                      "Processing 9-byte event (likely request metadata)"
                    );
                    const possibleRequestId = hexData.slice(2, 10); // First 4 bytes
                    const possibleFlags = hexData.slice(10); // Remaining 5 bytes
                    logger.info("Short event analysis:", {
                      possibleRequestIdHex: "0x" + possibleRequestId,
                      possibleRequestIdDecimal: parseInt(possibleRequestId, 16),
                      possibleFlagsHex: "0x" + possibleFlags,
                      possibleFlagsDecimal: parseInt(possibleFlags, 16),
                    });
                  }

                  if (hexData.includes("7b22")) {
                    // Look for JSON start {"
                    logger.info(
                      "Found potential JSON data in hex, attempting to extract..."
                    );

                    // Try to find and decode JSON from the hex data
                    let jsonStart = hexData.indexOf("7b22"); // {"
                    if (jsonStart !== -1) {
                      // Look for JSON end - try multiple patterns
                      let jsonHex = hexData.slice(jsonStart);
                      let jsonEnd = -1;

                      // Try different JSON end patterns
                      const endPatterns = ["7d22", "7d7d", "7d"]; // }", }}, }
                      for (const pattern of endPatterns) {
                        const foundEnd = jsonHex.lastIndexOf(pattern);
                        if (foundEnd > 0) {
                          jsonEnd = foundEnd + pattern.length;
                          break;
                        }
                      }

                      // If no clear end found, try to find reasonable cutoff
                      if (jsonEnd === -1) {
                        // Look for end of data or timestamp patterns
                        const possibleEnds = [
                          jsonHex.indexOf("d27aafa897010000"), // timestamp pattern
                          jsonHex.indexOf("0000000000000000"), // null padding
                          jsonHex.length, // full data
                        ].filter((end) => end > 0);

                        if (possibleEnds.length > 0) {
                          jsonEnd = Math.min(...possibleEnds);
                        }
                      }

                      if (jsonEnd > 4) {
                        jsonHex = jsonHex.slice(0, jsonEnd);
                        try {
                          const jsonStr = Buffer.from(jsonHex, "hex").toString(
                            "utf8"
                          );
                          logger.info("Extracted JSON from event:", {
                            rawHex: jsonHex,
                            jsonString: jsonStr,
                            length: jsonStr.length,
                          });

                          // Clean up any trailing nulls or garbage
                          let cleanJsonStr = jsonStr.replace(/\0+$/, "").trim();

                          // Remove any trailing non-JSON characters after the last }
                          const lastBraceIndex = cleanJsonStr.lastIndexOf("}");
                          if (
                            lastBraceIndex !== -1 &&
                            lastBraceIndex < cleanJsonStr.length - 1
                          ) {
                            cleanJsonStr = cleanJsonStr.substring(
                              0,
                              lastBraceIndex + 1
                            );
                            logger.info("Trimmed trailing garbage from JSON:", {
                              original: jsonStr.length,
                              cleaned: cleanJsonStr.length,
                              trimmed: jsonStr.substring(lastBraceIndex + 1),
                            });
                          }

                          // If we found real JSON, try to process it
                          const parsedData = JSON.parse(cleanJsonStr);
                          logger.info(
                            "Successfully parsed event JSON data!",
                            parsedData
                          );

                          // Extract request_id from the hex structure
                          // Based on the pattern: AccountId(32) + request_id(8) + timestamp(8) + length(4) + data
                          const afterAccount = hexData.slice(66); // Skip 32-byte account
                          const requestIdHex = afterAccount.slice(0, 16); // Next 8 bytes
                          let requestId = parseInt(requestIdHex, 16);

                          // Ensure request_id is within safe integer range for blockchain submission
                          if (requestId > Number.MAX_SAFE_INTEGER) {
                            requestId = Math.floor(requestId / 1000000); // Scale down to safe range
                            logger.warn("Request ID too large, scaled down:", {
                              original: parseInt(requestIdHex, 16),
                              scaled: requestId,
                            });
                          }

                          // Create a real event from the parsed data
                          const realEventData = {
                            requester: contractAddress,
                            request_id: requestId || Date.now(),
                            template_data: cleanJsonStr,
                            timestamp: Date.now(),
                          };

                          logger.info(
                            "Processing REAL draft request from blockchain event!",
                            realEventData
                          );
                          this.processDraftRequest(realEventData);
                          return; // Exit fallback, we found real data
                        } catch (jsonError) {
                          logger.warn(
                            "Failed to parse extracted JSON:",
                            jsonError.message,
                            "Raw hex:",
                            jsonHex
                          );
                        }
                      }
                    }
                  }

                  const errorMessage = `Event processing failed: ABI decoding failed and no JSON data found in event. Raw hex: ${hexData.slice(
                    0,
                    100
                  )}...`;

                  logger.error("Complete event processing failure:", {
                    error: errorMessage,
                    eventLength: hexData.length,
                    contractAddress: contractAddress,
                    hasJsonMarker: hexData.includes("7b22"),
                    timestamp: Date.now(),
                  });

                  // Store failed event for debugging and UI display
                  this.recordFailedEvent({
                    contractAddress,
                    eventHex: hexData,
                    error: errorMessage,
                    timestamp: Date.now(),
                    reason: "ABI_DECODE_AND_JSON_PARSE_FAILED",
                  });
                } catch (fallbackError) {
                  logger.error("Fallback parsing also failed:", fallbackError);
                }
              }
            }
          } catch (eventError) {
            const generalError = {
              message: eventError.message,
              stack: eventError.stack,
              type: "GENERAL_EVENT_PROCESSING_ERROR",
              timestamp: Date.now(),
            };

            logger.error(
              "Error processing ContractEmitted event:",
              generalError
            );

            // Store general processing failure
            this.recordFailedEvent({
              contractAddress: contractAddress || "unknown",
              eventHex: "unknown - error occurred before hex extraction",
              error: `General Processing Error: ${eventError.message}`,
              timestamp: Date.now(),
              reason: "GENERAL_PROCESSING_ERROR",
            });
          }
        }
      });
    });

    // Store the unsubscribe function for cleanup
    this.eventUnsubscriber = unsub;
  }

  recordFailedEvent(failedEvent) {
    // Add timestamp and unique ID
    const eventRecord = {
      id: `failed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...failedEvent,
    };

    // Add to beginning of array
    this.failedEvents.unshift(eventRecord);

    // Trim to max size
    if (this.failedEvents.length > this.maxFailedEvents) {
      this.failedEvents = this.failedEvents.slice(0, this.maxFailedEvents);
    }

    logger.warn(
      `Recorded failed event ${eventRecord.id}. Total failed events: ${this.failedEvents.length}`
    );
  }

  async processDraftRequest(eventData) {
    const { requester, request_id, template_data, timestamp } = eventData;

    try {
      // Parse template data
      const templateModelData = JSON.parse(template_data);

      // Extract format preference from template data, fallback to env variable
      const { _outputFormat, ...cleanTemplateData } = templateModelData;
      const requestedFormat = _outputFormat || this.outputFormat;

      logger.info(
        `Processing draft request ${request_id} from ${requester} (format: ${requestedFormat})`
      );

      // Generate the draft using the template processor
      const draftMarkdown = await this.templateProcessor.draft(
        cleanTemplateData,
        "markdown",
        { verbose: false }
      );

      let filename, filepath, documentUrl;

      if (requestedFormat === "pdf") {
        // Generate PDF
        filename = `contract-${request_id}-${Date.now()}.pdf`;
        filepath = path.join(this.documentsDir, filename);

        logger.info("Converting markdown to PDF...");
        await this.convertMarkdownToPdf(draftMarkdown, filepath);

        documentUrl = `${process.env.DOCUMENTS_BASE_URL}/${filename}`;
        logger.info(`PDF generated and saved to: ${filepath}`);
      } else {
        // Generate Markdown (default)
        filename = `contract-${request_id}-${Date.now()}.md`;
        filepath = path.join(this.documentsDir, filename);

        fs.writeFileSync(filepath, draftMarkdown);

        documentUrl = `${process.env.DOCUMENTS_BASE_URL}/${filename}`;
        logger.info(`Markdown generated and saved to: ${filepath}`);
      }

      logger.info(`Document accessible at: ${documentUrl}`);

      // Submit result back to contract (using document URL instead of IPFS hash)
      await this.submitDraftResult(request_id, documentUrl);
    } catch (error) {
      logger.error(`Error processing draft request ${request_id}:`, error);
      await this.submitDraftError(request_id, error.message);
    }
  }

  async convertMarkdownToPdf(markdown, outputPath) {
    return new Promise((resolve, reject) => {
      // Configure markdown-pdf options (based on generate-pdf.js)
      const options = {
        paperFormat: "A4",
        paperOrientation: "portrait",
        paperBorder: "2cm",
        renderDelay: 1000,
        type: "pdf",
      };

      // Convert markdown string to PDF
      markdownpdf(options)
        .from.string(markdown)
        .to(outputPath, (err) => {
          if (err) {
            reject(new Error(`PDF conversion failed: ${err.message}`));
          } else {
            resolve();
          }
        });
    });
  }

  async submitDraftResult(requestId, documentUrl) {
    try {
      // Add small delay to prevent transaction conflicts
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Get current nonce to prevent transaction conflicts
      const nonce = await this.api.rpc.system.accountNextIndex(
        this.serviceAccount.address
      );

      const tx = this.contract.tx.submitDraftResult(
        {
          gasLimit: this.api.registry.createType("WeightV2", {
            refTime: 30000000000,
            proofSize: 1000000,
          }),
          nonce: nonce.toNumber(),
        },
        requestId,
        documentUrl
      );

      await tx.signAndSend(this.serviceAccount, (result) => {
        if (result.status.isInBlock) {
          logger.info(
            `Draft result submitted for request ${requestId}: ${result.status.asInBlock}`
          );
        } else if (result.status.isFinalized) {
          logger.info(
            `Draft result finalized for request ${requestId}: ${result.status.asFinalized}`
          );
        }
      });
    } catch (error) {
      logger.error(
        `Error submitting draft result for request ${requestId}:`,
        error
      );
    }
  }

  async submitDraftError(requestId, errorMessage) {
    try {
      // Add small delay to prevent transaction conflicts
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Get current nonce to prevent transaction conflicts
      const nonce = await this.api.rpc.system.accountNextIndex(
        this.serviceAccount.address
      );

      const tx = this.contract.tx.submitDraftError(
        {
          gasLimit: this.api.registry.createType("WeightV2", {
            refTime: 30000000000,
            proofSize: 1000000,
          }),
          nonce: nonce.toNumber(),
        },
        requestId,
        errorMessage
      );

      await tx.signAndSend(this.serviceAccount, (result) => {
        if (result.status.isInBlock) {
          logger.info(
            `Draft error submitted for request ${requestId}: ${result.status.asInBlock}`
          );
        } else if (result.status.isFinalized) {
          logger.info(
            `Draft error finalized for request ${requestId}: ${result.status.asFinalized}`
          );
        }
      });
    } catch (error) {
      logger.error(
        `Error submitting draft error for request ${requestId}:`,
        error
      );
    }
  }

  startHealthServer() {
    const app = express();
    const port = process.env.PORT || 3001;

    // Enable CORS for frontend access
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );
      if (req.method === "OPTIONS") {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "draft-service",
        version: "1.0.0",
      });
    });

    // Status endpoint
    app.get("/status", (req, res) => {
      res.json({
        isRunning: this.isRunning,
        connected: {
          substrate: !!this.api,
          contract: !!this.contract,
          template: !!this.template,
        },
        documentsDir: this.documentsDir,
        lastActivity: new Date().toISOString(),
        stats: {
          totalFailedEvents: this.failedEvents.length,
          recentFailures: this.failedEvents.slice(0, 5).map((e) => ({
            id: e.id,
            reason: e.reason,
            timestamp: new Date(e.timestamp).toISOString(),
            error: e.error.slice(0, 100) + "...",
          })),
        },
      });
    });

    // Failed events endpoint for debugging
    app.get("/failed-events", (req, res) => {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      const events = this.failedEvents
        .slice(offset, offset + limit)
        .map((event) => ({
          ...event,
          timestamp: new Date(event.timestamp).toISOString(),
          eventHex: event.eventHex.slice(0, 200) + "...", // Truncate for display
        }));

      res.json({
        total: this.failedEvents.length,
        limit,
        offset,
        events,
      });
    });

    // Clear failed events endpoint
    app.delete("/failed-events", (req, res) => {
      const clearedCount = this.failedEvents.length;
      this.failedEvents = [];
      logger.info(`Cleared ${clearedCount} failed events via API`);
      res.json({
        message: `Cleared ${clearedCount} failed events`,
        timestamp: new Date().toISOString(),
      });
    });

    // Serve generated documents
    app.get("/documents/:filename", (req, res) => {
      const filename = req.params.filename;
      const filepath = path.join(this.documentsDir, filename);

      // Security check - prevent path traversal
      if (filename.includes("..") || filename.includes(path.sep)) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      // Check if file exists
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Set content type based on file extension
      if (filename.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      } else {
        res.setHeader("Content-Type", "text/markdown");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      }

      // Stream the file
      const fileStream = fs.createReadStream(filepath);
      fileStream.pipe(res);
    });

    // List all generated documents
    app.get("/documents", (req, res) => {
      try {
        const requestedAddress = req.query.address;

        const files = fs
          .readdirSync(this.documentsDir)
          .filter((file) => file.endsWith(".md") || file.endsWith(".pdf"))
          .map((file) => {
            const filepath = path.join(this.documentsDir, file);
            const stats = fs.statSync(filepath);

            // Parse filename to extract request info: contract-{requestId}-{timestamp}.(md|pdf) or draft-{requestId}-{timestamp}.(md|pdf)
            const match = file.match(/^(contract|draft)-(.+)-(\d+)\.(md|pdf)$/);
            if (!match) return null;

            const [, prefix, requestId, timestamp, extension] = match;

            return {
              id: `${requestId}-${timestamp}`,
              requestId: requestId,
              filename: file,
              format: extension,
              status: "completed",
              documentUrl: `${process.env.DOCUMENTS_BASE_URL}/${file}`,
              createdAt: stats.birthtime.toISOString(),
              size: stats.size,
              // Try to read template data from file metadata or assume it's available
              templateData: null,
            };
          })
          .filter(Boolean) // Remove null entries
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Filter by address if provided (this is a simplified approach)
        // In a real application, you'd store the mapping between addresses and requests in a database
        let filteredFiles = files;
        if (requestedAddress) {
          // For now, return all files since we don't have address mapping
          // You could enhance this by storing request metadata in a JSON file
          filteredFiles = files;
        }

        res.json(filteredFiles);
      } catch (error) {
        logger.error("Error listing documents:", error);
        res.status(500).json({ error: "Failed to list documents" });
      }
    });

    app.listen(port, () => {
      logger.info(`Health server running on port ${port}`);
    });
  }
}

// Start the service
async function main() {
  serviceInstance = new DraftService();

  try {
    await serviceInstance.start();
    logger.info("Draft Service is running...");
  } catch (error) {
    logger.error("Failed to start service:", error);
    process.exit(1);
  }
}

// Global service instance for cleanup
let serviceInstance = null;

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (serviceInstance) {
    await serviceInstance.stop();
  }
  process.exit(0);
};

// Handle process signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = DraftService;
