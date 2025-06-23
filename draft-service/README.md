# Draft Service

A Node.js service that listens for blockchain events from ink! smart contracts and generates Accord Project contract documents in real-time.

## 🎯 **Overview**

The Draft Service bridges blockchain smart contracts with Accord Project template processing:

- **🔗 Blockchain Integration**: Listens for `DraftRequested` events from Substrate
- **📄 Document Generation**: Uses Accord Project templates to create contracts
- **🌐 API Server**: Serves generated documents to frontend applications
- **⚡ Real-time Processing**: Automatically processes requests as they occur

## 🚀 **Quick Start**

### Prerequisites

- Node.js 18+
- Running Substrate node with deployed contract
- Accord Project template archive

### Installation

```bash
npm install
```

### Configuration

Copy and configure environment variables:

```bash
cp env.example .env
```

**Environment Variables:**

```env
# Substrate/Polkadot Network Configuration
SUBSTRATE_WS_URL=ws://localhost:9944
CONTRACT_ADDRESS=5C6u9c9e1RdzzdDAGQRKZBhsiAdMK1BCsy8qTsZUY2YhNQqS

# Document Storage Configuration
DOCUMENTS_OUTPUT_DIR=./generated-documents
DOCUMENTS_BASE_URL=http://localhost:3001/documents

# Service Configuration
PORT=3001
LOG_LEVEL=debug

# Security
SERVICE_PRIVATE_KEY=//Alice
AUTHORIZED_CALLER=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Template Configuration
TEMPLATE_ARCHIVE_PATH=../archives/latedeliveryandpenalty
```

### Start the Service

```bash
npm start
```

The service will:

1. Connect to the Substrate node
2. Load the contract ABI
3. Initialize Accord Project templates
4. Start listening for blockchain events
5. Launch the API server on port 3001

## 📋 **API Endpoints**

### Health & Status

- **`GET /health`** - Service health check
- **`GET /status`** - Detailed service status

### Document Management

- **`GET /documents`** - List all generated documents
- **`GET /documents?address={wallet}`** - Filter documents by wallet address
- **`GET /documents/{filename}`** - Download specific document

**Example API Response:**

```json
[
  {
    "id": "1750717926035-1750717927094",
    "requestId": "1750717926035",
    "status": "completed",
    "documentUrl": "http://localhost:3001/documents/contract-1750717926035-1750717927094.md",
    "createdAt": "2025-06-23T22:32:07.095Z",
    "filename": "contract-1750717926035-1750717927094.md"
  }
]
```

## 🔧 **How It Works**

### 1. Event Detection

The service subscribes to Substrate system events and filters for `contracts.ContractEmitted` events from the configured contract address.

### 2. Data Extraction

When a `DraftRequested` event is detected, the service:

- Extracts hex-encoded template data from the event
- Decodes the hex to recover the original JSON template data
- Validates the JSON format and structure

### 3. Document Generation

Using the extracted template data:

- Loads the configured Accord Project template
- Processes the template with the provided data
- Generates a formatted markdown document
- Saves the document to the configured output directory

### 4. Blockchain Update

After successful generation:

- Calls `submit_draft_result` on the smart contract
- Provides the document URL for frontend access
- Handles any errors by calling `submit_draft_error`

## 📁 **File Structure**

```
draft-service/
├── src/
│   └── index.js           # Main service implementation
├── generated-documents/   # Output directory for contracts
├── package.json          # Dependencies and scripts
├── env.example           # Environment configuration template
└── README.md            # This file
```

## 🧪 **Template Data Format**

The service expects template data in Accord Project format:

```json
{
  "$class": "io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenalty",
  "clauseId": "test-clause-1",
  "forceMajeure": false,
  "penaltyDuration": {
    "$class": "org.accordproject.time@0.3.0.Duration",
    "amount": 3,
    "unit": "days"
  },
  "penaltyPercentage": 10.5,
  "capPercentage": 55,
  "termination": {
    "$class": "org.accordproject.time@0.3.0.Duration",
    "amount": 15,
    "unit": "days"
  },
  "fractionalPart": "days"
}
```

## 🔍 **Debugging**

### Enable Debug Logging

Set `LOG_LEVEL=debug` in your `.env` file to see detailed processing information:

```
debug: Event received: contracts.ContractEmitted
debug: Found JSON hex pattern at position: 42
debug: Successfully extracted template data via hex!
info: Processing draft request 1750717926035
info: Draft generated and saved to: contract-1750717926035-1750717927094.md
```

### Common Issues

1. **"Contract ABI not found"**

   - Verify the contract path in `loadContractAbi()`
   - Ensure the contract is deployed and the address is correct

2. **"Template not found"**

   - Check the `TEMPLATE_ARCHIVE_PATH` environment variable
   - Verify the template archive structure

3. **"No events detected"**
   - Confirm the Substrate node is running
   - Check the `CONTRACT_ADDRESS` matches your deployed contract
   - Verify events are being emitted from the frontend

## 🚀 **Production Deployment**

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3001

CMD ["npm", "start"]
```

### Environment Variables for Production

```env
SUBSTRATE_WS_URL=wss://your-production-node.com
CONTRACT_ADDRESS=your-production-contract-address
DOCUMENTS_BASE_URL=https://your-domain.com/documents
SERVICE_PRIVATE_KEY=your-production-private-key
LOG_LEVEL=info
```

## 🤝 **Integration**

This service is designed to work with:

- **ink! Smart Contracts** generated by the main project
- **React Frontends** using Polkadot.js for blockchain interaction
- **Accord Project Templates** for document generation

See [FRONTEND_INTEGRATION.md](../FRONTEND_INTEGRATION.md) for complete integration examples.

## 📜 **License**

Apache License 2.0 - see [LICENSE](../LICENSE) for details.
