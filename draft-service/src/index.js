const { ApiPromise, WsProvider } = require("@polkadot/api");
const { ContractPromise } = require("@polkadot/api-contract");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady } = require("@polkadot/util-crypto");
const { create: createIpfsClient } = require("ipfs-http-client");
const { TemplateArchiveProcessor } = require("@accordproject/template-engine");
const { Template } = require("@accordproject/cicero-core");
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
    this.ipfs = null;
    this.template = null;
    this.templateProcessor = null;
    this.isRunning = false;
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

      // Initialize IPFS
      this.ipfs = createIpfsClient({ url: process.env.IPFS_API_URL });
      logger.info(`IPFS client initialized: ${process.env.IPFS_API_URL}`);

      // Initialize Accord Project template
      await this.initializeTemplate();

      logger.info("Draft Service initialization complete");
    } catch (error) {
      logger.error("Failed to initialize Draft Service:", error);
      throw error;
    }
  }

  loadContractAbi() {
    // For this example, we'll use a simplified ABI
    // In practice, you'd load this from the contract metadata
    return {
      spec: {
        constructors: [],
        docs: [],
        events: [
          {
            args: [
              {
                indexed: true,
                label: "requester",
                type: { type: 0, displayName: ["AccountId"] },
              },
              {
                indexed: false,
                label: "request_id",
                type: { type: 1, displayName: ["u64"] },
              },
              {
                indexed: false,
                label: "template_data",
                type: { type: 2, displayName: ["String"] },
              },
              {
                indexed: false,
                label: "timestamp",
                type: { type: 1, displayName: ["u64"] },
              },
            ],
            docs: [],
            label: "DraftRequested",
          },
        ],
        messages: [
          {
            args: [
              { label: "request_id", type: { type: 1, displayName: ["u64"] } },
              {
                label: "ipfs_hash",
                type: { type: 2, displayName: ["String"] },
              },
            ],
            docs: [],
            label: "submit_draft_result",
            mutating: true,
            payable: false,
            returnType: { type: 3, displayName: ["Result"] },
            selector: "0x12345678",
          },
          {
            args: [
              { label: "request_id", type: { type: 1, displayName: ["u64"] } },
              {
                label: "error_message",
                type: { type: 2, displayName: ["String"] },
              },
            ],
            docs: [],
            label: "submit_draft_error",
            mutating: true,
            payable: false,
            returnType: { type: 3, displayName: ["Result"] },
            selector: "0x87654321",
          },
        ],
      },
      types: [
        {
          id: 0,
          type: {
            def: { composite: { fields: [{ type: 4 }] } },
            path: ["ink_primitives", "types", "AccountId"],
          },
        },
        { id: 1, type: { def: { primitive: "u64" } } },
        { id: 2, type: { def: { primitive: "str" } } },
        {
          id: 3,
          type: {
            def: {
              variant: {
                variants: [
                  { fields: [{ type: 5 }], index: 0, name: "Ok" },
                  { fields: [{ type: 6 }], index: 1, name: "Err" },
                ],
              },
            },
          },
        },
        { id: 4, type: { def: { array: { len: 32, type: 7 } } } },
        { id: 5, type: { def: { tuple: [] } } },
        { id: 6, type: { def: { primitive: "str" } } },
        { id: 7, type: { def: { primitive: "u8" } } },
      ],
    };
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

        // Check if this is a contract event
        if (
          event.section === "contracts" &&
          event.method === "ContractEmitted"
        ) {
          this.handleContractEvent(event.data);
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
      const [contractAddress, eventBytes] = eventData;

      // Check if this event is from our contract
      if (contractAddress.toString() !== process.env.CONTRACT_ADDRESS) {
        return;
      }

      // Decode the event (simplified - in practice you'd use proper ABI decoding)
      const eventInfo = this.decodeContractEvent(eventBytes);

      if (eventInfo && eventInfo.name === "DraftRequested") {
        await this.processDraftRequest(eventInfo.data);
      }
    } catch (error) {
      logger.error("Error handling contract event:", error);
    }
  }

  decodeContractEvent(eventBytes) {
    // Simplified event decoding - in practice you'd use proper ABI decoding
    // This is just a placeholder for demonstration
    try {
      // For now, we'll simulate receiving a DraftRequested event
      return {
        name: "DraftRequested",
        data: {
          requester: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
          request_id: 1,
          template_data: JSON.stringify({
            $class: "io.clause.latedeliveryandpenalty@0.1.0.TemplateModel",
            forceMajeure: true,
            penaltyDuration: {
              $class: "org.accordproject.time@0.3.0.Duration",
              amount: 2,
              unit: "days",
            },
            penaltyPercentage: 10.5,
            capPercentage: 55,
            termination: {
              $class: "org.accordproject.time@0.3.0.Duration",
              amount: 15,
              unit: "days",
            },
            fractionalPart: "days",
          }),
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error("Error decoding contract event:", error);
      return null;
    }
  }

  async processDraftRequest(eventData) {
    const { requester, request_id, template_data, timestamp } = eventData;

    logger.info(`Processing draft request ${request_id} from ${requester}`);

    try {
      // Parse template data
      const templateModelData = JSON.parse(template_data);

      // Generate the draft using your existing draft.js logic
      const draftMarkdown = await this.templateProcessor.draft(
        templateModelData,
        "markdown",
        { verbose: false }
      );

      // Store in IPFS
      const ipfsResult = await this.ipfs.add(draftMarkdown);
      const ipfsHash = ipfsResult.cid.toString();

      logger.info(`Draft generated and stored in IPFS: ${ipfsHash}`);

      // Submit result back to contract
      await this.submitDraftResult(request_id, ipfsHash);
    } catch (error) {
      logger.error(`Error processing draft request ${request_id}:`, error);
      await this.submitDraftError(request_id, error.message);
    }
  }

  async submitDraftResult(requestId, ipfsHash) {
    try {
      const tx = this.contract.tx.submitDraftResult(
        { gasLimit: -1 },
        requestId,
        ipfsHash
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
        { gasLimit: -1 },
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

    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "draft-service",
        version: "1.0.0",
      });
    });

    app.get("/status", (req, res) => {
      res.json({
        isRunning: this.isRunning,
        connected: {
          substrate: !!this.api,
          ipfs: !!this.ipfs,
          contract: !!this.contract,
        },
        lastActivity: new Date().toISOString(),
      });
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
