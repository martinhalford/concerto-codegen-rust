# Frontend Integration with Draft Service

## **Status: FULLY WORKING INTEGRATION**

Complete end-to-end integration tested and verified! This document explains the **working integration** between draft-service and inkathon frontend.

**Last Updated**: January 2025
**Test Status**: All components working correctly

## **Quick Start Demo**

```bash
# Terminal 1: Start Draft Service
cd draft-service && npm start

# Terminal 2: Start Substrate Node
cd inkathon && pnpm run node

# Terminal 3: Start Frontend
cd inkathon/frontend && pnpm run dev
```

Open `http://localhost:3000` and request a contract draft to see the complete workflow!

## Changes Made

### 1. Frontend Changes (`inkathon/frontend/`)

#### Environment Configuration (`src/config/environment.ts`)

- Added `draftServiceUrl` configuration pointing to `http://localhost:3001`
- Can be overridden with `NEXT_PUBLIC_DRAFT_SERVICE_URL` environment variable

#### Late Delivery Contract Component (`src/components/web3/late-delivery-contract-interactions.tsx`)

- Added `GeneratedDocument` interface for typing draft service responses
- Added `generatedDocuments` state and `isLoadingDocuments` loading state
- Added `fetchGeneratedDocuments()` function to poll the draft service API
- Added automatic polling every 10 seconds when user is connected
- Enhanced UI with a "Generated Documents" section showing:
  - Document status (Processing, Completed, Error)
  - Creation timestamps
  - Download/view buttons for completed documents
  - Error messages for failed generations
  - Template data expandable sections
  - Refresh button for manual updates

### 2. Draft Service Changes (`draft-service/src/index.js`)

#### Enhanced API Endpoints

- **CORS Support**: Added CORS headers to allow frontend access
- **Enhanced `/documents` endpoint**:
  - Returns JSON array instead of nested object
  - Includes document metadata (id, requestId, status, createdAt)
  - Supports address filtering (currently returns all documents)
  - Parses filenames to extract request information

#### Document Format

- Documents are saved as `draft-{requestId}-{timestamp}.md`
- The API parses these filenames to extract metadata
- Documents are served with proper content-type headers

## Setup Instructions

### 1. Environment Configuration

Create a `.env.local` file in `inkathon/frontend/` with:

```bash
# Default Chain (Local Development)
NEXT_PUBLIC_DEFAULT_CHAIN=development

# Draft Service Configuration
NEXT_PUBLIC_DRAFT_SERVICE_URL=http://localhost:3001
```

### 2. Start the Services

1. **Start the Draft Service** (in terminal 1):

```bash
cd draft-service
npm start
```

2. **Start the Substrate Node** (in terminal 2):

```bash
cd inkathon
pnpm run node
```

3. **Start the Frontend** (in terminal 3):

```bash
cd inkathon/frontend
pnpm run dev
```

### 3. Testing the Integration

1. **Open the Frontend**: Navigate to `http://localhost:3000`

2. **Connect Your Wallet**: Use a browser extension wallet (Polkadot.js or similar)

3. **Request a Draft**:

   - Find the "Request Draft" section
   - Enter valid JSON template data, for example:

   ```json
   {
     "buyer": "Alice Corp",
     "seller": "Bob Industries",
     "deliveryDate": "2024-01-15",
     "penaltyRate": "5%"
   }
   ```

   - Click "Request Draft"

4. **Monitor the Process**:

   - The transaction will be submitted to the contract
   - The draft service will detect the event and generate the document
   - The "Generated Documents" section will automatically refresh and show:
     - Processing status initially
     - Completed status with download link when ready
     - Any errors if generation fails

5. **View Generated Documents**:
   - Click the "📄 View/Download" button to open the generated contract
   - The document will open in a new tab as a formatted markdown file

## API Endpoints

The draft service exposes these endpoints:

- `GET /health` - Health check
- `GET /status` - Service status
- `GET /documents` - List all generated documents
- `GET /documents?address={wallet}` - List documents for specific address (currently shows all)
- `GET /documents/{filename}` - Download specific document

## Architecture Flow

1. **User Action**: User fills out the "Request Draft" form and submits
2. **Contract Interaction**: Frontend calls `request_draft` on the smart contract
3. **Event Emission**: Contract emits a `DraftRequested` event
4. **Service Processing**: Draft service detects the event and processes the request
5. **Document Generation**: Service uses Accord Project templates to generate the contract
6. **File Storage**: Generated document is saved locally in `generated-documents/`
7. **Contract Update**: Service calls `submit_draft_result` with the document URL
8. **Frontend Polling**: Frontend automatically polls the service API every 10 seconds
9. **UI Update**: New documents appear in the "Generated Documents" section
10. **User Download**: User can view/download the generated contract

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the draft service is running and CORS headers are enabled
2. **No Documents Showing**: Check that the draft service is accessible at the configured URL
3. **404 on Documents**: Verify the `DOCUMENTS_BASE_URL` in draft service matches the actual server URL
4. **Service Not Responding**: Check that all required environment variables are set in the draft service

### Debug Steps

1. Check browser console for fetch errors
2. Verify draft service logs for processing errors
3. Confirm contract events are being emitted
4. Test direct API calls to `http://localhost:3001/documents`

## Future Enhancements

1. **User-Specific Documents**: Store address mapping to show only user's documents
2. **Real-time Updates**: Use WebSockets for real-time document status updates
3. **Document Templates**: Allow users to select different contract templates
4. **Document History**: Store and display historical versions of contracts
5. **PDF Generation**: Convert markdown to PDF for professional document delivery
