# Draft Service

A Node.js service that listens for blockchain events from ink! smart contracts and generates Accord Project contract documents in real-time.

## 🎯 **Overview**

The Draft Service bridges blockchain smart contracts with Accord Project template processing:

- **🔗 Blockchain Integration**: Listens for `DraftRequested` events from Substrate
- **📄 Document Generation**: Uses Accord Project templates to create contracts in Markdown or PDF format
- **🌐 API Server**: Serves generated documents to frontend applications
- **⚡ Real-time Processing**: Automatically processes requests as they occur
- **📊 Multiple Formats**: Supports both Markdown (.md) and PDF (.pdf) output formats

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

# Output Format Configuration
# Set to 'md' for markdown files or 'pdf' for PDF files
OUTPUT_FORMAT=md
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
    "format": "md",
    "documentUrl": "http://localhost:3001/documents/contract-1750717926035-1750717927094.md",
    "createdAt": "2025-06-23T22:32:07.095Z",
    "filename": "contract-1750717926035-1750717927094.md"
  },
  {
    "id": "1750718082027-1750718082611",
    "requestId": "1750718082027",
    "status": "completed",
    "format": "pdf",
    "documentUrl": "http://localhost:3001/documents/contract-1750718082027-1750718082611.pdf",
    "createdAt": "2025-06-23T22:35:12.612Z",
    "filename": "contract-1750718082027-1750718082611.pdf"
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

## 📊 **Output Formats**

The service supports two output formats controlled by the `OUTPUT_FORMAT` environment variable:

### Markdown Format (`OUTPUT_FORMAT=md`)

- **File Extension**: `.md`
- **Content Type**: `text/markdown`
- **Use Case**: Web display, further processing, version control
- **File Size**: Smaller file size
- **Processing**: Fast generation

### PDF Format (`OUTPUT_FORMAT=pdf`)

- **File Extension**: `.pdf`
- **Content Type**: `application/pdf`
- **Use Case**: Professional documents, printing, legal compliance
- **File Size**: Larger file size (includes formatting)
- **Processing**: Requires PDF conversion (slightly slower)

**Example Configuration:**

```env
# For Markdown output
OUTPUT_FORMAT=md

# For PDF output
OUTPUT_FORMAT=pdf
```

### 🎯 **Frontend Format Selection**

The service now supports **per-request format selection** from the frontend UI:

- **Default**: Uses `OUTPUT_FORMAT` from environment file
- **Override**: Frontend can specify format in template data via `_outputFormat` field
- **UI Control**: Users can choose format (MD/PDF) when requesting drafts

**Frontend Usage:**

1. User selects format in UI (radio buttons for MD/PDF)
2. Frontend embeds `_outputFormat` in template data JSON
3. Service extracts format preference and generates accordingly
4. Generated document matches user's choice

This allows **mixed format usage** - some users can generate PDFs while others use Markdown, all from the same service instance!

## 📁 **File Structure**

```
draft-service/
├── src/
│   └── index.js           # Main service implementation
├── generated-documents/   # Output directory for contracts (*.md or *.pdf)
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

4. **"PDF conversion failed"**
   - Ensure `markdown-pdf` package is properly installed: `npm install markdown-pdf`
   - Check system dependencies for PDF generation (phantomjs)
   - Try switching to Markdown format temporarily: `OUTPUT_FORMAT=md`
   - Check available disk space in the output directory

## **Production Deployment**

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
