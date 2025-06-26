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
    this.maxFailedEvents = 20; // Reduced limit for cleaner storage
  }

  // Centralized error handling utility
  handleError(context, error, additionalInfo = {}) {
    const errorInfo = {
      context,
      message: error.message,
      timestamp: Date.now(),
      ...additionalInfo,
    };

    logger.error(`Error in ${context}:`, errorInfo);
    return errorInfo;
  }

  // Simplified failed event recording
  recordEventFailure(eventBytes, reason, error) {
    if (this.failedEvents.length >= this.maxFailedEvents) {
      this.failedEvents.pop(); // Remove oldest
    }

    const failureRecord = {
      id: `fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reason,
      error: error.message || error,
      eventLength: eventBytes.length,
      timestamp: Date.now(),
    };

    this.failedEvents.unshift(failureRecord);
    logger.warn(`Event processing failed: ${reason}`, {
      failureId: failureRecord.id,
      totalFailures: this.failedEvents.length,
    });
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
      this.handleError("initialization", error);
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
      this.handleError("loadContractAbi", error, { contractPath });
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
      this.handleError("initializeDocumentsDirectory", error, {
        documentsDir: this.documentsDir,
      });
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
      this.handleError("initializeLogsDirectory", error, { logsDir });
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
          this.handleError("initializeTemplate", error, { templatePath });
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
      this.handleError("start", error);
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
      this.handleError("stop", error);
    }
  }

  async listenForEvents() {
    logger.info("Starting to listen for contract events...");

    // Subscribe to system events to catch contract events
    const unsub = await this.api.query.system.events((events) => {
      events.forEach((record) => {
        const { event } = record;

        // Check if this is a contract event from our contract
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          const [contractAddress, eventBytes] = event.data;

          if (contractAddress.toString() === process.env.CONTRACT_ADDRESS) {
            this.handleContractEvent(eventBytes);
          }
        }
      });
    });

    // Store the unsubscribe function for cleanup
    this.eventUnsubscriber = unsub;
  }

  handleContractEvent(eventBytes) {
    try {
      // Use ink!-specific event decoding (optimized for ink! contracts)
      const decoded = this.decodeInkEvent(eventBytes);
      logger.info("Event decoding successful");
      this.processDecodedEvent(decoded);
    } catch (decodeError) {
      this.recordEventFailure(
        eventBytes,
        "INK_EVENT_DECODING_FAILED",
        decodeError
      );
    }
  }

  processDecodedEvent(decoded) {
    if (decoded.event.identifier.includes("DraftRequested")) {
      logger.info("Processing DraftRequested event");
      this.processDraftRequest(decoded.event.args || decoded.args);
    } else {
      logger.info(`Received ${decoded.event.identifier} event`);
    }
  }

  // Simplified ink!-specific event decoder
  decodeInkEvent(eventBytes) {
    // Convert to Uint8Array for consistent processing
    let eventData;
    if (typeof eventBytes.toHex === "function") {
      const hexString = eventBytes.toHex();
      const cleanHex = hexString.startsWith("0x")
        ? hexString.slice(2)
        : hexString;
      eventData = new Uint8Array(
        cleanHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
      );
    } else if (typeof eventBytes.toU8a === "function") {
      eventData = eventBytes.toU8a();
    } else {
      eventData = eventBytes;
    }

    // Identify event type by length
    if (eventData.length > 100) {
      return this.decodeDraftRequestedEvent(eventData);
    } else if (eventData.length >= 39 && eventData.length <= 41) {
      return this.decodeLateDeliveryRequestEvent(eventData);
    } else if (eventData.length >= 8 && eventData.length <= 10) {
      return this.decodeLateDeliveryResponseEvent(eventData);
    } else {
      throw new Error(
        `Unknown event type with length ${eventData.length}. Expected: 8-10, 39-41, or >100`
      );
    }
  }

  // DraftRequested decoder
  decodeDraftRequestedEvent(eventData) {
    let offset = 0;

    // 1. requester (AccountId) - 32 bytes
    const requesterBytes = eventData.slice(offset, offset + 32);
    const requester = this.api.registry.createType("AccountId", requesterBytes);
    offset += 32;

    // 2. request_id (u64) - 8 bytes
    const requestIdBytes = eventData.slice(offset, offset + 8);
    const requestId = this.api.registry.createType("u64", requestIdBytes);
    offset += 8;

    // 3. template_data (String) - SCALE encoded
    const stringDataStart = eventData.slice(offset);
    const { value: templateData, bytesRead } =
      this.decodeScaleString(stringDataStart);
    offset += bytesRead;

    // 4. timestamp (u64) - 8 bytes
    const timestampBytes = eventData.slice(offset, offset + 8);
    const timestamp = this.api.registry.createType("u64", timestampBytes);

    return {
      event: {
        identifier:
          "late_delivery_and_penalty::latedeliveryandpenalty::DraftRequested",
        args: {
          requester: requester.toString(),
          request_id: requestId.toNumber(),
          template_data: templateData,
          timestamp: timestamp.toNumber(),
        },
      },
    };
  }

  // SCALE string decoder
  decodeScaleString(data) {
    // Decode compact length
    const compact = this.api.registry.createType("Compact<u32>", data);
    const stringLength = compact.toNumber();
    const bytesRead = compact.encodedLength;

    // Extract string data
    const stringBytes = data.slice(bytesRead, bytesRead + stringLength);
    const value = new TextDecoder().decode(stringBytes);

    return {
      value: value.replace(/\0+$/, "").trim(),
      bytesRead: bytesRead + stringLength,
    };
  }

  // Other event decoders
  decodeLateDeliveryRequestEvent(eventData) {
    let offset = 0;
    const submitterBytes = eventData.slice(offset, offset + 32);
    const submitter = this.api.registry.createType("AccountId", submitterBytes);
    offset += 32;

    const requestIdBytes = eventData.slice(offset, offset + 8);
    const requestId = this.api.registry.createType("u64", requestIdBytes);

    return {
      event: {
        identifier:
          "late_delivery_and_penalty::latedeliveryandpenalty::LateDeliveryAndPenaltyRequestSubmitted",
        args: {
          submitter: submitter.toString(),
          request_id: requestId.toNumber(),
        },
      },
    };
  }

  decodeLateDeliveryResponseEvent(eventData) {
    let offset = 0;
    const requestIdBytes = eventData.slice(offset, offset + 8);
    const requestId = this.api.registry.createType("u64", requestIdBytes);
    offset += 8;

    const successByte = eventData[offset];
    const success = successByte === 1;

    return {
      event: {
        identifier:
          "late_delivery_and_penalty::latedeliveryandpenalty::LateDeliveryAndPenaltyResponseGenerated",
        args: {
          request_id: requestId.toNumber(),
          success: success,
        },
      },
    };
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
      this.handleError("processDraftRequest", error, { request_id });
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
      this.handleError("submitDraftResult", error, { requestId });
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
      this.handleError("submitDraftError", error, { requestId });
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
          lastFailure:
            this.failedEvents.length > 0
              ? {
                  reason: this.failedEvents[0].reason,
                  timestamp: new Date(
                    this.failedEvents[0].timestamp
                  ).toISOString(),
                }
              : null,
        },
      });
    });

    // Failed events endpoint for debugging
    app.get("/failed-events", (req, res) => {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const offset = parseInt(req.query.offset) || 0;

      const events = this.failedEvents
        .slice(offset, offset + limit)
        .map((event) => ({
          id: event.id,
          reason: event.reason,
          error: event.error,
          eventLength: event.eventLength,
          timestamp: new Date(event.timestamp).toISOString(),
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
        this.handleError("listDocuments", error);
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
