const { ApiPromise, WsProvider } = require("@polkadot/api");
const { ContractPromise } = require("@polkadot/api-contract");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady } = require("@polkadot/util-crypto");
const winston = require("winston");
const express = require("express");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

class LocalDraftService {
  constructor() {
    this.api = null;
    this.contract = null;
    this.keyring = null;
    this.serviceAccount = null;
    this.isRunning = false;
    this.documentsDir = "./generated-documents";
    this.app = express();
    this.setupExpress();
  }

  setupExpress() {
    // Enable JSON body parsing
    this.app.use(express.json());

    // Enable CORS for frontend
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      next();
    });

    // Serve static files from documents directory
    this.app.use("/documents", express.static(this.documentsDir));

    // Health endpoints
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "local-draft-service",
        contract: process.env.CONTRACT_ADDRESS,
        isRunning: this.isRunning,
      });
    });

    this.app.get("/status", (req, res) => {
      res.json({
        service: "Local Draft Service",
        version: "1.0.0",
        contract: process.env.CONTRACT_ADDRESS,
        substrate: process.env.SUBSTRATE_WS_URL,
        storage: "local",
        documentsPath: this.documentsDir,
        documentsUrl: process.env.LOCAL_STORAGE_URL,
        isRunning: this.isRunning,
      });
    });

    // API endpoint to trigger document generation
    this.app.post("/generate-draft", async (req, res) => {
      try {
        const { requestId, templateData, requester } = req.body;

        logger.info("📨 Direct draft generation request received:", {
          requestId,
          requester,
          templateData: templateData?.penaltyPercentage,
        });

        // Process the draft request
        const result = await this.processDraftRequest({
          requestId,
          templateData,
          requester,
        });

        const filename = `contract-${requestId}.html`;
        const documentUrl = `${
          process.env.LOCAL_STORAGE_URL || "http://localhost:3001/documents"
        }/${filename}`;

        res.json({
          success: true,
          requestId,
          documentUrl,
          message: "Document generated successfully",
        });
      } catch (error) {
        logger.error("❌ Error in direct draft generation:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Local Draft Service...");

      // Create documents directory
      if (!fs.existsSync(this.documentsDir)) {
        fs.mkdirSync(this.documentsDir, { recursive: true });
        logger.info(`📁 Created documents directory: ${this.documentsDir}`);
      }

      // Wait for crypto libraries to be ready
      await cryptoWaitReady();

      // Initialize Polkadot API
      const wsProvider = new WsProvider(process.env.SUBSTRATE_WS_URL);
      this.api = await ApiPromise.create({ provider: wsProvider });
      logger.info(
        `✅ Connected to Substrate node: ${process.env.SUBSTRATE_WS_URL}`
      );

      // Initialize keyring and service account
      this.keyring = new Keyring({ type: "sr25519" });
      this.serviceAccount = this.keyring.addFromUri(
        process.env.SERVICE_PRIVATE_KEY
      );
      logger.info(
        `✅ Service account initialized: ${this.serviceAccount.address}`
      );

      // Load contract metadata if available
      const metadataPath = path.resolve(
        "../output/target/ink/late_delivery_and_penalty.json"
      );
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        this.contract = new ContractPromise(
          this.api,
          metadata,
          process.env.CONTRACT_ADDRESS
        );
        logger.info(`✅ Contract initialized: ${process.env.CONTRACT_ADDRESS}`);
      } else {
        logger.warn(`⚠️  Contract metadata not found at ${metadataPath}`);
      }

      logger.info("✅ Local Draft Service initialization complete");
    } catch (error) {
      logger.error("❌ Failed to initialize Local Draft Service:", error);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Service is already running");
      return;
    }

    this.isRunning = true;
    logger.info("📡 Starting to listen for blockchain events...");

    // Subscribe to system events
    const unsubscribe = await this.api.query.system.events((events) => {
      if (events.length > 0) {
        logger.info(`📊 Received ${events.length} events from blockchain`);
      }

      events.forEach((record) => {
        const { event } = record;

        // Look for contract events
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          this.handleContractEvent(event.data);
        }
      });
    });

    // Start HTTP server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      logger.info(`🌐 Local Draft Service running on http://localhost:${port}`);
      logger.info(`📋 Status: http://localhost:${port}/status`);
      logger.info(`📁 Documents: http://localhost:${port}/documents/`);
    });

    logger.info("🎉 Local Draft Service is now running!");
    logger.info(
      "💡 Next step: Use the frontend to call request_draft on your contract"
    );

    return unsubscribe;
  }

  async handleContractEvent(eventData) {
    try {
      const contractAddress = eventData[0].toString();

      logger.info("📩 Contract event received:", {
        contract: contractAddress,
        dataLength: eventData[1].toString().length,
      });

      // Check if this is from our contract
      if (contractAddress === process.env.CONTRACT_ADDRESS) {
        logger.info(
          "✅ Event is from our contract! Processing draft request..."
        );

        // Parse the event data to extract request details
        // For now, we'll simulate with mock data
        await this.processDraftRequest({
          requestId: Date.now(),
          templateData: { penaltyPercentage: 10.5 },
          requester: "Mock-Address",
        });
      }
    } catch (error) {
      logger.error("❌ Error handling contract event:", error);
    }
  }

  async processDraftRequest(requestData) {
    try {
      logger.info("🎨 Processing draft request:", requestData);

      // Generate mock contract document
      const contractDocument = this.generateContractDocument(requestData);

      // Save to local file
      const filename = `contract-${requestData.requestId}.html`;
      const filepath = path.join(this.documentsDir, filename);

      fs.writeFileSync(filepath, contractDocument, "utf8");
      logger.info(`📄 Contract document saved: ${filepath}`);

      // Generate public URL
      const documentUrl = `${process.env.LOCAL_STORAGE_URL}/${filename}`;
      logger.info(`🔗 Document URL: ${documentUrl}`);

      // For demo purposes, log the success
      // In a real implementation, we'd call back to the contract here
      logger.info(`🎉 Draft processing complete!`);
      logger.info(`📝 Request ID: ${requestData.requestId}`);
      logger.info(`🌐 Document accessible at: ${documentUrl}`);

      // TODO: Call contract's submit_draft_result method with documentUrl
    } catch (error) {
      logger.error("❌ Error processing draft request:", error);
    }
  }

  generateContractDocument(requestData) {
    const timestamp = new Date().toISOString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Late Delivery and Penalty Contract</title>
    <style>
        body { 
            font-family: 'Times New Roman', serif; 
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px 20px;
            background: #fafafa;
        }
        .contract {
            background: white;
            padding: 40px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header { 
            text-align: center; 
            border-bottom: 2px solid #333; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
        }
        .clause { 
            margin: 20px 0; 
            padding: 15px;
            background: #f9f9f9;
            border-left: 4px solid #007acc;
        }
        .penalty-rate { 
            font-weight: bold; 
            color: #d32f2f; 
            font-size: 1.1em;
        }
        .metadata {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ccc;
            font-size: 0.9em;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="contract">
        <div class="header">
            <h1>LATE DELIVERY AND PENALTY CONTRACT</h1>
            <p><strong>Contract ID:</strong> ${requestData.requestId}</p>
            <p><strong>Generated:</strong> ${timestamp}</p>
        </div>

        <div class="clause">
            <h3>1. PENALTY CLAUSE</h3>
            <p>In the event of late delivery, the following penalty shall apply:</p>
            <p class="penalty-rate">Penalty Rate: ${
              requestData.templateData.penaltyPercentage
            }% per day</p>
        </div>

        <div class="clause">
            <h3>2. DELIVERY TERMS</h3>
            <p>The goods must be delivered on or before the agreed delivery date. Any delay shall result in the automatic application of penalties as specified in Clause 1.</p>
        </div>

        <div class="clause">
            <h3>3. TERMINATION RIGHTS</h3>
            <p>The buyer may terminate this contract if delivery is delayed beyond the agreed termination period, while retaining rights to applicable penalties.</p>
        </div>

        <div class="clause">
            <h3>4. FORCE MAJEURE</h3>
            <p>Force majeure events may suspend penalty calculations during the period of the qualifying event, subject to proper notification and documentation.</p>
        </div>

        <div class="metadata">
            <p><strong>Blockchain Contract:</strong> ${
              process.env.CONTRACT_ADDRESS
            }</p>
            <p><strong>Generated by:</strong> Hybrid Smart Contract System</p>
            <p><strong>Template Data:</strong> ${JSON.stringify(
              requestData.templateData
            )}</p>
        </div>
    </div>
</body>
</html>`;
  }
}

async function main() {
  const service = new LocalDraftService();

  try {
    await service.initialize();
    await service.start();

    // Keep the process running
    process.on("SIGINT", () => {
      logger.info("👋 Shutting down gracefully...");
      process.exit(0);
    });
  } catch (error) {
    logger.error("💥 Service failed to start:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = LocalDraftService;
