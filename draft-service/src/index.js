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
    try {
      const templatePath = path.resolve(process.env.TEMPLATE_ARCHIVE_PATH);

      this.template = await Template.fromDirectory(templatePath);
      this.templateProcessor = new TemplateArchiveProcessor(this.template);
      logger.info(`Template loaded from: ${templatePath}`);
    } catch (error) {
      logger.error("Failed to initialize template:", error);
      throw error;
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

  async listenForEvents() {
    logger.info("Starting to listen for DraftRequested events...");

    // Subscribe to system events to catch contract events
    const unsub = await this.api.query.system.events((events) => {
      events.forEach((record) => {
        const { event, phase } = record;

        logger.debug(`Event received: ${event.section}.${event.method}`);

        // Check if this is a contract event
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          logger.debug("ContractEmitted event detected");

          try {
            // Extract contract address and data from the event
            const eventData = event.data;
            const contractAddress = eventData[0].toString();
            const eventBytes = eventData[1];

            logger.debug("Contract address:", contractAddress);
            logger.debug("Event bytes:", eventBytes.toString());

            // Check if this event is from our contract
            if (contractAddress === process.env.CONTRACT_ADDRESS) {
              logger.info("Event from our contract, attempting to decode...");

              // Try to decode using the contract ABI
              try {
                const decoded = this.contract.abi.decodeEvent(eventBytes);
                logger.debug("Decoded event:", decoded);

                if (
                  decoded &&
                  decoded.event &&
                  decoded.event.identifier === "DraftRequested"
                ) {
                  logger.info("DraftRequested event successfully decoded!");

                  // Extract the event arguments
                  const args = decoded.args;
                  const eventInfo = {
                    name: "DraftRequested",
                    data: {
                      requester: args[0].toString(),
                      request_id: args[1].toNumber
                        ? args[1].toNumber()
                        : parseInt(args[1].toString()),
                      template_data: args[2].toString(),
                      timestamp: args[3].toNumber
                        ? args[3].toNumber()
                        : parseInt(args[3].toString()),
                    },
                  };

                  logger.debug("Extracted event data:", eventInfo.data);

                  // Process the draft request
                  this.processDraftRequest(eventInfo.data);
                } else if (decoded && decoded.event) {
                  logger.debug(
                    `Decoded event is ${decoded.event.identifier}, not DraftRequested`
                  );
                } else {
                  logger.warn(
                    "Failed to decode event or no event identifier found"
                  );
                }
              } catch (decodeError) {
                logger.error("Failed to decode event with ABI:", decodeError);

                // Fallback: Try manual hex parsing for debugging
                const hexData = eventBytes.toString();
                logger.debug("Raw hex data for manual parsing:", hexData);

                if (hexData.startsWith("0x")) {
                  try {
                    // Remove 0x prefix and convert to buffer
                    const buffer = Buffer.from(hexData.slice(2), "hex");
                    const bufferStr = buffer.toString("utf8");

                    logger.debug(
                      "Buffer as UTF8 string (first 200 chars):",
                      bufferStr.substring(0, 200)
                    );

                    // Look for JSON patterns
                    const jsonMatch = bufferStr.match(/\{.*\}/);
                    if (jsonMatch) {
                      const potentialJson = jsonMatch[0];
                      logger.debug("Found potential JSON:", potentialJson);

                      try {
                        JSON.parse(potentialJson);
                        logger.info(
                          "Successfully found valid JSON in hex data!"
                        );

                        // Create a mock event for processing
                        const fallbackEventData = {
                          requester: contractAddress,
                          request_id: Date.now(),
                          template_data: potentialJson,
                          timestamp: Date.now(),
                        };

                        this.processDraftRequest(fallbackEventData);
                      } catch (jsonError) {
                        logger.warn(
                          "Found JSON-like data but it's not valid JSON:",
                          jsonError.message
                        );
                      }
                    } else {
                      logger.warn("No JSON pattern found in buffer string");
                    }
                  } catch (bufferError) {
                    logger.error(
                      "Failed to parse hex data as buffer:",
                      bufferError
                    );
                  }
                }
              }
            } else {
              logger.debug(`Event from different contract: ${contractAddress}`);
            }
          } catch (eventError) {
            logger.error("Error processing ContractEmitted event:", eventError);
          }
        }
      });
    });

    // Store the unsubscribe function for cleanup
    this.eventUnsubscriber = unsub;
  }

  // Legacy methods removed - functionality integrated into listenForEvents()

  async processDraftRequest(eventData) {
    const { requester, request_id, template_data, timestamp } = eventData;

    try {
      // Parse template data
      const templateModelData = JSON.parse(template_data);

      // Extract format preference from template data, fallback to env variable
      const requestedFormat =
        templateModelData._outputFormat || this.outputFormat;

      // Remove the format preference from template data before processing
      // Use JSON stringify/parse to ensure clean object without prototype chain issues
      const cleanTemplateDataString = JSON.stringify(
        templateModelData,
        (key, value) => {
          if (key === "_outputFormat") {
            return undefined; // This removes the key entirely
          }
          return value;
        }
      );
      const cleanTemplateData = JSON.parse(cleanTemplateDataString);

      logger.debug(
        "Original template data:",
        JSON.stringify(templateModelData, null, 2)
      );
      logger.debug(
        "Cleaned template data:",
        JSON.stringify(cleanTemplateData, null, 2)
      );
      logger.debug("Requested format:", requestedFormat);

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
      const tx = this.contract.tx.submitDraftResult(
        {
          gasLimit: this.api.registry.createType("WeightV2", {
            refTime: 30000000000,
            proofSize: 1000000,
          }),
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
      const tx = this.contract.tx.submitDraftError(
        {
          gasLimit: this.api.registry.createType("WeightV2", {
            refTime: 30000000000,
            proofSize: 1000000,
          }),
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
      });
    });

    // Serve generated documents
    app.get("/documents/:filename", (req, res) => {
      const filename = req.params.filename;
      const filepath = path.join(this.documentsDir, filename);

      // Security check - ensure filename doesn't contain path traversal
      if (
        filename.includes("..") ||
        filename.includes("/") ||
        filename.includes("\\")
      ) {
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
  const service = new DraftService();

  try {
    await service.start();
    logger.info("Draft Service is running...");
  } catch (error) {
    logger.error("Failed to start service:", error);
    process.exit(1);
  }
}

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
