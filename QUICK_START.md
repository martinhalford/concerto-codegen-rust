# 🚀 Quick Start Guide

Get the complete integration running in under 5 minutes!

## ✅ **What You'll See**

A complete end-to-end legal contract generation system:

- **React Frontend** at `http://localhost:3000`
- **Real-time Document Generation**
- **Blockchain Integration** with Substrate
- **Generated Contract Downloads**

## 📋 **Prerequisites**

- Node.js 18+
- Rust + Cargo (for contract compilation)
- pnpm (install with `npm install -g pnpm`)

## ⚡ **5-Minute Setup**

### 1. Install Dependencies

```bash
# Root dependencies
npm install

# Frontend dependencies
cd inkathon && pnpm install
cd ..

# Draft service dependencies
cd draft-service && npm install
cd ..
```

### 2. Start All Services (3 Terminals)

**Terminal 1 - Draft Service:**

```bash
cd draft-service
npm start
```

_Should show: "Draft service listening on port 3001"_

**Terminal 2 - Substrate Node:**

```bash
cd inkathon
pnpm run node
```

_Should show: "Development chain running"_

**Terminal 3 - Frontend:**

```bash
cd inkathon/frontend
pnpm run dev
```

_Should show: "Ready - started server on http://localhost:3000"_

### 3. Test the Integration

1. **Open Frontend**: Navigate to `http://localhost:3000`
2. **Connect Wallet**: Click "Connect Wallet" and select a Substrate account
3. **Submit Draft Request**: Fill in contract details and click "Request Draft"
4. **Watch Real-time Updates**: See the document appear in "Generated Documents" section
5. **Download Contract**: Click the download button to get your generated contract

## 🎯 **What Happens Behind the Scenes**

```
Your Request → Smart Contract → Event Emission → Draft Service → Document Generation → Frontend Update
```

1. Frontend submits request to smart contract
2. Smart contract emits `DraftRequested` event
3. Draft service detects event and extracts template data
4. Service generates contract using Accord Project templates
5. Generated document saved and contract updated
6. Frontend polls API and displays new document

## 🔧 **Troubleshooting**

### "No wallet found"

Install Polkadot.js browser extension: https://polkadot.js.org/extension/

### "Contract ABI not found"

Run the contract build first:

```bash
cd inkathon/contracts/late-delivery-and-penalty
cargo contract build
```

### "Draft service not responding"

Check the draft service is running on port 3001:

```bash
curl http://localhost:3001/health
```

### "No documents appearing"

1. Check the draft service logs for event detection
2. Verify the contract address matches in both frontend and service
3. Ensure the Substrate node is running with contracts pallet

## 📁 **Generated Files**

After successful execution, you'll find:

- **Generated Contracts**: `draft-service/generated-documents/contract-*.md`
- **Frontend Build**: `inkathon/frontend/.next/`
- **Contract Artifacts**: `inkathon/contracts/late-delivery-and-penalty/target/`

## 🎉 **Success Indicators**

You'll know it's working when you see:

- ✅ "Connected to Substrate node" in draft service logs
- ✅ "Contract events detected" messages
- ✅ New `.md` files in `generated-documents/`
- ✅ Documents appearing in frontend "Generated Documents" section
- ✅ Download buttons working for completed contracts

## 📖 **Next Steps**

- **Customize Templates**: Modify files in `archives/latedeliveryandpenalty/`
- **Add New Models**: Place additional `.cto` files in archives
- **Deploy to Testnet**: Update environment configs for testnet deployment
- **Production Setup**: See `deployment-guide.md` for production deployment

## 🤝 **Need Help?**

- **Full Integration Guide**: [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)
- **Draft Service Details**: [draft-service/README.md](draft-service/README.md)
- **Contract Documentation**: [inkathon/contracts/late-delivery-and-penalty/README.md](inkathon/contracts/late-delivery-and-penalty/README.md)
- **Deployment Guide**: [deployment-guide.md](deployment-guide.md)

---

**🎯 Ready to build your own legal contract automation system? This is your starting point!**
