# Concerto Rust Code Generator

A universal code generator that transforms Concerto model definitions (.cto files) into executable Rust projects with business logic boilerplate. Should work with any valid Concerto model.

## **Quick Demo - Complete Working Integration**

**Want to see it in action?** We have a **complete end-to-end integration** with:

- **ink! Smart Contract** deployed to Substrate
- **Draft Service** for document generation
- **React Frontend** with real-time updates
- **Document Management** via API

**Start the demo:**

```bash
# Terminal 1: Start Draft Service
cd draft-service && npm start

# Terminal 2: Start Substrate Node
cd inkathon && pnpm run node

# Terminal 3: Start Frontend
cd inkathon/frontend && pnpm run dev
```

Then open `http://localhost:3000` and request a contract draft!

> ** Full Integration Guide:** See [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md) for complete setup instructions.

## Prerequisites

- **Node.js** (version 16 or higher)
- **npm** (comes with Node.js)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Generator

**Generate Rust Models:**

```bash
npm run generate
```

**Generate ink! Smart Contract:**

```bash
node src/generate-ink.js
```

### 3. Build and Run the Generated Project

**Prerequisites:** This step requires Rust 1.70+ and Cargo to be installed on your system. For installation instructions, see the [official Rust installation guide](https://rustup.rs/).

```bash
cd output
cargo build    # Compiles the generated Rust code
cargo run      # Runs demo with synthetic data
cargo test     # Runs comprehensive test suite
```

**What happens:**

- Scans all `.cto` files from template archives in `archives/`
- Generates Rust project with executable business logic boilerplate
- Creates type-safe request/response handling
- Provides working demo with synthetic data
- Includes test framework with TODO markers for implementation

## Generated Output

The generator creates a complete, executable Rust project in the `output/` directory:

```
output/
├── Cargo.toml              # Complete Rust project configuration
├── README.md               # Generated project documentation
├── src/
│   ├── lib.rs             # Main library with module exports
│   ├── main.rs            # Executable demo with synthetic data
│   ├── logic.rs           # Business logic boilerplate with TODO markers
│   ├── utils.rs           # DateTime and serialization utilities
│   └── *.rs               # Generated model files (one per namespace)
└── ink-contract/           # ink! Smart Contract (if generated)
    ├── Cargo.toml          # ink! project configuration
    ├── README.md           # Contract documentation
    └── src/
        └── lib.rs          # ink! smart contract code
```

### Key Features

- ** Immediately Executable**: Run `cargo run` for instant demo with synthetic data
- ** Business Logic Boilerplate**: Complete `logic.rs` with function signatures derived from .cto models
- ** Testing**: Test framework with realistic synthetic data
- ** Type Safety**: All request/response handling is type-safe
- ** JSON Compatible**: Full serialize/deserialize with proper field naming
- ** DateTime Support**: ISO 8601 compatible DateTime serialization
- ** TODO Markers**: Clear guidance on where to implement business logic

## ink! Smart Contract Generation

Generate deployable ink! smart contracts for Substrate blockchains:

```bash
node src/generate-ink.js    # Generates output/ink-contract/
cd output/ink-contract
cargo contract build       # Build the smart contract
cargo test                  # Run contract tests
```

**ink! Features:**

- ** Substrate Compatible**: Deploys to any Substrate blockchain with contracts pallet
- ** Storage Management**: Contract state derived from your Concerto models
- ** Event Emission**: Automatic event generation for all contract actions
- ** Access Control**: Owner-based permissions and pausable functionality
- ** Transaction Processing**: Type-safe request/response handling

## 🌐 **Frontend Integration**

We provide a **complete React frontend** with real-time blockchain integration:

- **React + TypeScript**: Modern, type-safe frontend
- **Polkadot.js Integration**: Connect any Substrate wallet
- **Real-time Document Generation**: See contracts created instantly
- **Document Management**: Download and view generated contracts
- **Transaction History**: Track all blockchain interactions

**Key Components:**

- `inkathon/frontend/` - React frontend with Tailwind CSS
- `draft-service/` - Node.js service for document processing
- `inkathon/contracts/` - Deployed ink! smart contracts

**See [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md) for complete setup guide.**

## Project Structure

```
concerto-codegen-rust/
├── src/
│   ├── generate.js                       # Core Rust generation engine
│   ├── generate-ink.js                   # ink! Smart Contract generator
│   └── utils.js                          # Project utilities
├── archives/
# Template archives (Accord Project format)
│   └── latedeliveryandpenalty/
│       ├── model/
│       │   ├── model.cto                 # Main template model
│       │   └── *.cto                     # Accord Project base models
│       ├── logic/                        # Template logic (reference only)
│       ├── text/                         # Template grammar (reference only)
│       └── package.json                  # Template metadata
├── inkathon/                             # Complete Frontend Integration
│   ├── frontend/                         # React frontend with Polkadot.js
│   └── contracts/                        # Deployed ink! contracts
├── draft-service/                        # Document Generation Service
│   ├── src/index.js                      # Event listener & API server
│   └── generated-documents/              # Generated contract documents
├── output/                               # Generated Rust project ⚡
├── FRONTEND_INTEGRATION.md               # Complete integration guide
├── deployment-guide.md                   # Production deployment guide
├── package.json                          # Node.js configuration
└── README.md                             # This file
```

## Adding Your Own Models

Place any valid, uncompressed template archive into the `archives/` subdirectory.

```
archives/your-domain/
├── model/
│   ├── model.cto       # Your main model definitions
│   └── *.cto           # Additional dependencies
├── logic/              # Reference logic (optional)
├── text/               # Reference grammar (optional)
└── package.json        # Metadata
```

Run `npm run generate` and get an executable Rust implementation, ready for further coding.

## What Gets Generated

### Type-Safe Model Structures

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct YourRequestType {
    #[serde(rename = "$class")]
    pub _class: String,

    pub field_name: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub optional_field: Option<DateTime<Utc>>,

    #[serde(rename = "$timestamp")]
    pub _timestamp: DateTime<Utc>,
}
```

### Executable Business Logic Boilerplate

```rust
pub struct ContractLogic;

impl ContractLogic {
    pub async fn trigger(
        &self,
        template_data: &YourTemplateType,
        request: &YourRequestType,
    ) -> Result<ContractResponse, Box<dyn std::error::Error>> {

        // TODO: Implement your business logic here

        let response = YourResponseType {
            _class: "your.namespace.YourResponseType".to_string(),
            result_field: 0.0, // TODO: Calculate based on business logic
            _timestamp: Utc::now(),
        };

        Ok(ContractResponse { result: response })
    }
}
```

### Comprehensive Test Framework

```rust
#[tokio::test]
async fn test_logic_trigger() {
    let logic = ContractLogic::new();

    // Synthetic test data generated from your models
    let template_data = YourTemplateType { /* ... */ };
    let request = YourRequestType { /* ... */ };

    let result = logic.trigger(&template_data, &request).await;
    assert!(result.is_ok());

    // TODO: Add your specific business logic assertions
}
```

## **Contributing**

We welcome contributions! The project includes:

- **Core Code Generation**: Rust model generation from Concerto
- **ink! Smart Contracts**: Substrate-compatible blockchain contracts
- **Frontend Integration**: React + Polkadot.js integration
- **Document Generation**: Accord Project template processing
- **Developer Experience**: Documentation, testing, examples

## **License**

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## **Related Projects**

- **[Accord Project](https://accordproject.org/)** - Smart legal contract templates
- **[ink!](https://use.ink/)** - Rust smart contracts for Substrate
- **[Substrate](https://substrate.io/)** - Blockchain development framework
- **[Polkadot.js](https://polkadot.js.org/)** - JavaScript library for Polkadot

---

**Ready to transform your Concerto models into production-ready Rust code?**

`npm run generate` and start building! 🚀
