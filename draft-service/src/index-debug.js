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

class DebugDraftService {
  constructor() {
    this.api = null;
    this.contract = null;
    this.keyring = null;
    this.serviceAccount = null;
    this.isRunning = false;
    this.outputDir = "./generated-documents";
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing DEBUG Draft Service (No IPFS)...");

      // Create output directory
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        logger.info(`📁 Created output directory: ${this.outputDir}`);
      }

      // Wait for crypto libraries to be ready
      await cryptoWaitReady();

      // Initialize Polkadot API
      const wsProvider = new WsProvider(
        process.env.SUBSTRATE_WS_URL || "ws://127.0.0.1:9944"
      );
      this.api = await ApiPromise.create({ provider: wsProvider });
      logger.info(
        `✅ Connected to Substrate node: ${
          process.env.SUBSTRATE_WS_URL || "ws://127.0.0.1:9944"
        }`
      );

      // Initialize keyring and service account
      this.keyring = new Keyring({ type: "sr25519" });
      this.serviceAccount = this.keyring.addFromUri(
        process.env.SERVICE_PRIVATE_KEY || "//Alice"
      );
      logger.info(
        `✅ Service account initialized: ${this.serviceAccount.address}`
      );

      // Contract address from environment or use the deployed one
      const contractAddress =
        process.env.CONTRACT_ADDRESS ||
        "5ENCfGuGRtJkskfv6VVWhTw4wkxSQBxG54uvVsJJnzoooLXw";

      logger.info(`✅ Will monitor contract: ${contractAddress}`);
      logger.info("✅ DEBUG Draft Service initialization complete (NO IPFS)");
    } catch (error) {
      logger.error("❌ Failed to initialize DEBUG Draft Service:", error);
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
        const { event, phase } = record;

        // Look for contract events
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          logger.info(`🔍 Contract Event: ${event.section}.${event.method}`);
          this.handleContractEvent(event.data);
        }

        // Also log any other interesting events
        if (event.section === "balances" || event.section === "system") {
          // logger.info(`📋 ${event.section}.${event.method}`);
        }
      });
    });

    // Start health check server
    this.startHealthServer();

    logger.info("🎉 DEBUG Draft Service is now running!");
    logger.info(
      "💡 To test: Use the frontend to call request_draft on your contract"
    );
    logger.info(
      `🔗 Health check: http://localhost:${process.env.PORT || 3001}/health`
    );

    return unsubscribe;
  }

  async handleContractEvent(eventData) {
    try {
      const contractAddress = eventData[0].toString();
      const eventBytes = eventData[1];

      logger.info("📩 Contract event received:", {
        contract: contractAddress,
        dataLength: eventBytes.length,
      });

      // Check if this is from our target contract
      const targetContract =
        process.env.CONTRACT_ADDRESS ||
        "5ENCfGuGRtJkskfv6VVWhTw4wkxSQBxG54uvVsJJnzoooLXw";

      if (contractAddress === targetContract) {
        logger.info("✅ Event is from our target contract! Processing...");
        await this.simulateDraftProcessing(eventBytes);
      } else {
        logger.info(`ℹ️  Event from different contract: ${contractAddress}`);
      }
    } catch (error) {
      logger.error("❌ Error handling contract event:", error);
    }
  }

  async simulateDraftProcessing(eventData) {
    try {
      logger.info("🎨 Simulating draft processing (LOCAL FILES)...");

      // Create a simple mock document
      const timestamp = new Date().toISOString();
      const filename = `draft-${Date.now()}.json`;

      const mockDocument = {
        title: "Late Delivery and Penalty Contract",
        content: "This is a generated contract document with penalty terms",
        timestamp: timestamp,
        templateData: {
          penaltyPercentage: 10.5,
          terminationDays: 14,
          lateDeliveryDays: 30,
        },
        eventData: eventData ? eventData.toString() : "no-event-data",
        note: "This is a DEBUG version using local file storage instead of IPFS",
      };

      // Save to local file
      const filePath = path.join(this.outputDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(mockDocument, null, 2));

      logger.info(`📁 Document saved locally: ${filePath}`);
      logger.info(`🎉 Draft processing complete! File: ${filename}`);

      // In a real implementation, we'd submit the result back to the contract
      // For now, just log success
      logger.info("✅ Ready for next draft request!");
    } catch (error) {
      logger.error("❌ Error in draft processing:", error);
    }
  }

  startHealthServer() {
    const app = express();
    const port = process.env.PORT || 3001;

    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        service: "DEBUG Draft Service",
        timestamp: new Date().toISOString(),
        isRunning: this.isRunning,
        nodeConnected: this.api ? this.api.isConnected : false,
        outputDirectory: this.outputDir,
        generatedFiles: fs.existsSync(this.outputDir)
          ? fs.readdirSync(this.outputDir).length
          : 0,
      });
    });

    app.get("/files", (req, res) => {
      if (!fs.existsSync(this.outputDir)) {
        return res.json({ files: [] });
      }

      const files = fs.readdirSync(this.outputDir).map((filename) => {
        const filePath = path.join(this.outputDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      });

      res.json({ files });
    });

    app.listen(port, () => {
      logger.info(`🌐 Health server running on http://localhost:${port}`);
      logger.info(`📊 Health endpoint: http://localhost:${port}/health`);
      logger.info(`📁 Files endpoint: http://localhost:${port}/files`);
    });
  }

  async stop() {
    this.isRunning = false;
    if (this.api) {
      await this.api.disconnect();
    }
    logger.info("🛑 DEBUG Draft Service stopped");
  }
}

async function main() {
  const service = new DebugDraftService();

  try {
    await service.initialize();
    await service.start();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("📡 Received SIGINT, shutting down gracefully...");
      await service.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("📡 Received SIGTERM, shutting down gracefully...");
      await service.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error("❌ Failed to start DEBUG Draft Service:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { DebugDraftService };
