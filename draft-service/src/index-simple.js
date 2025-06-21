const { ApiPromise, WsProvider } = require("@polkadot/api");
const { ContractPromise } = require("@polkadot/api-contract");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady } = require("@polkadot/util-crypto");
const { create: createIpfsClient } = require("ipfs-http-client");
const winston = require("winston");
const express = require("express");
const fs = require("fs");
const path = require("path");

// Try to load Accord Project dependencies
let Template, Engine;
try {
  Template = require("@accordproject/cicero-core").Template;
  Engine = require("@accordproject/template-engine").Engine;
} catch (error) {
  winston
    .createLogger()
    .warn("Accord Project dependencies not available, using mock processing");
}

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

class SimpleDraftService {
  constructor() {
    this.api = null;
    this.contract = null;
    this.keyring = null;
    this.serviceAccount = null;
    this.ipfs = null;
    this.isRunning = false;
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Simple Draft Service...");

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

      // Initialize IPFS
      this.ipfs = createIpfsClient({ url: process.env.IPFS_API_URL });

      // Test IPFS connection
      try {
        const version = await this.ipfs.version();
        logger.info(
          `✅ IPFS client initialized: ${process.env.IPFS_API_URL} (version: ${version.version})`
        );
      } catch (ipfsError) {
        logger.warn(
          `⚠️  IPFS connection failed, but continuing: ${ipfsError.message}`
        );
      }

      // Load contract metadata (you'll need the actual metadata file)
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
        logger.warn(
          `⚠️  Contract metadata not found at ${metadataPath}, using simplified ABI`
        );
      }

      logger.info("✅ Simple Draft Service initialization complete");
    } catch (error) {
      logger.error("❌ Failed to initialize Simple Draft Service:", error);
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
      logger.info(`📊 Received ${events.length} events from blockchain`);

      events.forEach((record) => {
        const { event } = record;

        // Log all events for debugging
        logger.info(`🔍 Event: ${event.section}.${event.method}`);

        // Look for contract events
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          this.handleContractEvent(event.data);
        }
      });
    });

    // Start health check server
    this.startHealthServer();

    logger.info("🎉 Simple Draft Service is now running!");
    logger.info(
      "💡 To test: Use the frontend to call request_draft on your contract"
    );

    return unsubscribe;
  }

  async handleContractEvent(eventData) {
    try {
      logger.info("📩 Contract event received:", {
        contract: eventData[0].toString(),
        data: eventData[1].toString(),
      });

      // Check if this is from our contract
      if (eventData[0].toString() === process.env.CONTRACT_ADDRESS) {
        logger.info("✅ Event is from our contract! Processing...");

        // For now, just simulate processing a draft request
        await this.simulateDraftProcessing();
      }
    } catch (error) {
      logger.error("❌ Error handling contract event:", error);
    }
  }

  async simulateDraftProcessing() {
    try {
      logger.info("🎨 Simulating draft processing...");

      // Create a simple mock document
      const mockDocument = {
        title: "Late Delivery and Penalty Contract",
        content:
          "This is a generated contract document with penalty percentage: 10.5%",
        timestamp: new Date().toISOString(),
        templateData: { penaltyPercentage: 10.5 },
      };

      // Try to upload to IPFS
      let ipfsHash = "mock-hash-" + Date.now();

      try {
        const result = await this.ipfs.add(
          JSON.stringify(mockDocument, null, 2)
        );
        ipfsHash = result.cid.toString();
        logger.info(`📁 Document uploaded to IPFS: ${ipfsHash}`);
      } catch (ipfsError) {
        logger.warn(
          `⚠️  IPFS upload failed, using mock hash: ${ipfsError.message}`
        );
      }

      // For now, just log the success (in real implementation, we'd call back to contract)
      logger.info(`🎉 Draft processing complete! IPFS hash: ${ipfsHash}`);
      logger.info(
        `🔗 View document: ${process.env.IPFS_GATEWAY_URL}/ipfs/${ipfsHash}`
      );
    } catch (error) {
      logger.error("❌ Error simulating draft processing:", error);
    }
  }

  startHealthServer() {
    const app = express();
    const port = process.env.PORT || 3001;

    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "simple-draft-service",
        contract: process.env.CONTRACT_ADDRESS,
        isRunning: this.isRunning,
      });
    });

    app.get("/status", (req, res) => {
      res.json({
        service: "Simple Draft Service",
        version: "1.0.0",
        contract: process.env.CONTRACT_ADDRESS,
        substrate: process.env.SUBSTRATE_WS_URL,
        ipfs: process.env.IPFS_API_URL,
        isRunning: this.isRunning,
      });
    });

    app.listen(port, () => {
      logger.info(`🌐 Health server running on http://localhost:${port}`);
      logger.info(`📋 Status: http://localhost:${port}/status`);
    });
  }
}

async function main() {
  const service = new SimpleDraftService();

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

module.exports = SimpleDraftService;
