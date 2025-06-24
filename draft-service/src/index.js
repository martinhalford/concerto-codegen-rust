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
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
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
        const { event } = record;

        logger.debug(`Event received: ${event.section}.${event.method}`);

        // Check if this is a contract event
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          logger.debug("ContractEmitted event detected");
          logger.debug("Event data:", event.data.toHuman());

          // Try to decode the event using the contract
          try {
            // Get both human-readable and raw formats
            const humanData = event.data.toHuman();
            const rawData = event.data.toPrimitive();

            // Try multiple ways to extract contract address and hex data
            let contractAddress =
              humanData?.contract || rawData?.[0]?.toString();
            let hexData = humanData?.data || rawData?.[1]?.toString();

            logger.debug("Contract address:", contractAddress);
            logger.debug("Raw hex data:", hexData);
            logger.debug("Full human data:", JSON.stringify(humanData));
            logger.debug("Raw data:", JSON.stringify(rawData));

            // Also try to get raw data directly
            if (!hexData || !contractAddress) {
              logger.debug("Trying to extract from raw event data...");
              logger.debug("Event data toString:", event.data.toString());
              logger.debug("Event data type:", typeof event.data);
            }

            // Try to process regardless if we can find the hex data in the debug log
            if (
              contractAddress === process.env.CONTRACT_ADDRESS ||
              humanData.contract === process.env.CONTRACT_ADDRESS ||
              JSON.stringify(humanData).includes(process.env.CONTRACT_ADDRESS)
            ) {
              logger.info("Event is from our contract, parsing hex data...");

              // Try multiple ways to get the hex data
              let actualHexData = hexData;
              if (!actualHexData || actualHexData === "{}") {
                // Try to extract from the full event data string
                const eventStr = JSON.stringify(humanData);
                const hexMatch = eventStr.match(/"data":"(0x[a-fA-F0-9]+)"/);
                if (hexMatch) {
                  actualHexData = hexMatch[1];
                  logger.debug("Extracted hex from string:", actualHexData);
                }
              }

              // Parse the hex data manually since ABI decoding isn't working
              if (actualHexData && actualHexData.startsWith("0x")) {
                try {
                  // Remove 0x prefix and convert to buffer
                  const buffer = Buffer.from(actualHexData.slice(2), "hex");
                  const bufferStr = buffer.toString();

                  logger.debug(
                    "Buffer as string (first 200 chars):",
                    bufferStr.substring(0, 200)
                  );
                  logger.debug("Buffer length:", bufferStr.length);
                  logger.debug("Looking for JSON pattern...");

                  // Look for JSON pattern in hex directly
                  const hexBuffer = actualHexData.slice(2); // Remove 0x

                  // Pattern for {"buyer" or similar JSON start
                  const jsonHexPattern = "7b22"; // hex for '{"'
                  let jsonHexStart = hexBuffer.indexOf(jsonHexPattern);

                  if (jsonHexStart !== -1) {
                    logger.debug(
                      "Found JSON hex pattern at position:",
                      jsonHexStart
                    );

                    // Extract from this position to the end and try to find valid JSON
                    const remainingHex = hexBuffer.substring(jsonHexStart);
                    const jsonBuffer = Buffer.from(remainingHex, "hex");
                    const jsonStr = jsonBuffer.toString();

                    logger.debug(
                      "Potential JSON string:",
                      jsonStr.substring(0, 200)
                    );

                    // Find the first complete JSON object
                    let braceCount = 0;
                    let jsonEnd = -1;
                    let jsonStart = jsonStr.indexOf("{");

                    if (jsonStart !== -1) {
                      for (let i = jsonStart; i < jsonStr.length; i++) {
                        if (jsonStr[i] === "{") braceCount++;
                        if (jsonStr[i] === "}") {
                          braceCount--;
                          if (braceCount === 0) {
                            jsonEnd = i + 1;
                            break;
                          }
                        }
                      }

                      if (jsonEnd !== -1) {
                        const extractedJson = jsonStr.substring(
                          jsonStart,
                          jsonEnd
                        );
                        logger.info(
                          "Successfully extracted template data via hex!"
                        );
                        logger.debug("Template JSON:", extractedJson);

                        // Validate it's proper JSON
                        try {
                          JSON.parse(extractedJson);

                          // Process the request with extracted data
                          this.processDraftRequest({
                            requester:
                              contractAddress || process.env.CONTRACT_ADDRESS,
                            request_id: Date.now(),
                            template_data: extractedJson,
                            timestamp: Date.now(),
                          });
                          return; // Exit early on success
                        } catch (jsonError) {
                          logger.debug(
                            "Invalid JSON, continuing with other methods"
                          );
                        }
                      }
                    }
                  }

                  // Find the JSON string in the buffer (fallback method)
                  // Try different patterns to find the JSON
                  let jsonStart = bufferStr.indexOf('{"$class"');
                  if (jsonStart === -1) {
                    jsonStart = bufferStr.indexOf('{"\\$class"'); // Escaped version
                  }
                  if (jsonStart === -1) {
                    jsonStart = bufferStr.indexOf('{"$class"'); // Different escaping
                  }
                  if (jsonStart === -1) {
                    jsonStart = bufferStr.indexOf('{"buyer"'); // Look for buyer field
                  }
                  if (jsonStart === -1) {
                    jsonStart = bufferStr.indexOf('{"'); // Any JSON start
                  }
                  if (jsonStart === -1) {
                    // Look for the hex pattern directly
                    const hexPattern = "7b2224636c617373223a22"; // hex for '{"$class":"'
                    const hexBuffer = actualHexData.slice(2); // Remove 0x
                    const hexStart = hexBuffer.indexOf(hexPattern);
                    if (hexStart !== -1) {
                      // Extract from hex and convert to string
                      const jsonHexStart = hexStart;
                      // Find the end by looking for the closing brace pattern
                      let jsonHexEnd = hexBuffer.length;

                      // Extract and convert
                      const jsonHex = hexBuffer.substring(jsonHexStart);
                      const jsonBuffer = Buffer.from(jsonHex, "hex");
                      const jsonStr = jsonBuffer.toString();

                      // Find the actual end of the JSON in the string
                      const realStart = jsonStr.indexOf('{"$class"');
                      if (realStart !== -1) {
                        let braceCount = 0;
                        let realEnd = realStart;
                        for (let i = realStart; i < jsonStr.length; i++) {
                          if (jsonStr[i] === "{") braceCount++;
                          if (jsonStr[i] === "}") {
                            braceCount--;
                            if (braceCount === 0) {
                              realEnd = i + 1;
                              break;
                            }
                          }
                        }

                        const extractedJson = jsonStr.substring(
                          realStart,
                          realEnd
                        );
                        logger.info(
                          "Successfully extracted template data via hex!"
                        );
                        logger.debug("Template JSON:", extractedJson);

                        // Process the request with extracted data
                        this.processDraftRequest({
                          requester: contractAddress,
                          request_id: Date.now(),
                          template_data: extractedJson,
                          timestamp: Date.now(),
                        });
                        return; // Exit early
                      }
                    }
                  }

                  logger.debug("JSON start position:", jsonStart);

                  if (jsonStart !== -1) {
                    // Find the end of the JSON
                    let braceCount = 0;
                    let jsonEnd = jsonStart;

                    for (let i = jsonStart; i < bufferStr.length; i++) {
                      if (bufferStr[i] === "{") braceCount++;
                      if (bufferStr[i] === "}") {
                        braceCount--;
                        if (braceCount === 0) {
                          jsonEnd = i + 1;
                          break;
                        }
                      }
                    }

                    const jsonString = bufferStr.substring(jsonStart, jsonEnd);
                    logger.info("Successfully extracted template data!");
                    logger.debug("Template JSON:", jsonString);

                    // Process the request with extracted data
                    this.processDraftRequest({
                      requester: contractAddress, // Use contract as requester for now
                      request_id: Date.now(), // Use timestamp as request ID
                      template_data: jsonString,
                      timestamp: Date.now(),
                    });
                  } else {
                    logger.warn("Could not find JSON in hex data");
                  }
                } catch (parseError) {
                  logger.error("Error parsing hex data:", parseError);
                }
              }
            }
          } catch (error) {
            logger.error("Error processing contract event:", error);
          }
        }
      });
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      unsub();
      process.exit(0);
    });
  }

  async handleContractEvent(eventData) {
    try {
      logger.debug("Raw contract event received:", eventData);
      const [contractAddress, eventBytes] = eventData;

      logger.debug("Contract address from event:", contractAddress.toString());
      logger.debug("Expected contract address:", process.env.CONTRACT_ADDRESS);

      // Check if this event is from our contract
      if (contractAddress.toString() !== process.env.CONTRACT_ADDRESS) {
        logger.debug("Event from different contract, ignoring");
        return;
      }

      logger.info("Event from our contract, attempting to decode...");

      // Decode the event (simplified - in practice you'd use proper ABI decoding)
      const eventInfo = this.decodeContractEvent(eventData);

      logger.debug("Decoded event info:", eventInfo);

      if (eventInfo && eventInfo.name === "DraftRequested") {
        logger.info("DraftRequested event detected!");
        await this.processDraftRequest(eventInfo.data);
      } else {
        logger.debug("Event is not DraftRequested or failed to decode");
      }
    } catch (error) {
      logger.error("Error handling contract event:", error);
    }
  }

  decodeContractEvent(eventData) {
    try {
      const [contractAddress, eventBytes] = eventData;

      // Check if this event is from our contract
      if (contractAddress.toString() !== process.env.CONTRACT_ADDRESS) {
        return null;
      }

      logger.debug("Attempting to decode event bytes:", eventBytes);

      // Use the contract ABI to decode the event
      const decoded = this.contract.abi.decodeEvent(eventBytes);
      logger.debug("Raw decoded result:", decoded);

      // The decoded event should have event and args properties
      if (decoded && decoded.event) {
        logger.debug("Event identifier:", decoded.event.identifier);
        logger.debug("Event args:", decoded.args);

        if (decoded.event.identifier === "DraftRequested") {
          // Extract the arguments - they should be in order: requester, request_id, template_data, timestamp
          const args = decoded.args;

          return {
            name: "DraftRequested",
            data: {
              requester: args[0] ? args[0].toString() : "unknown",
              request_id: args[1]
                ? args[1].toNumber
                  ? args[1].toNumber()
                  : parseInt(args[1])
                : 0,
              template_data: args[2] ? args[2].toString() : "{}",
              timestamp: args[3]
                ? args[3].toNumber
                  ? args[3].toNumber()
                  : parseInt(args[3])
                : Date.now(),
            },
          };
        } else {
          logger.debug(
            `Event is ${decoded.event.identifier}, not DraftRequested`
          );
        }
      } else {
        logger.debug("No event identifier found in decoded result");
      }

      return null;
    } catch (error) {
      logger.error("Error decoding contract event:", error);
      logger.debug("Event data:", eventData);
      return null;
    }
  }

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
