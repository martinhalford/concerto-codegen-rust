# Concerto Rust Code Generator

A universal code generator that transforms Concerto model definitions (.cto files) into executable Rust projects with business logic boilerplate. Should work with any valid Concerto model.

## Prerequisites

- **Node.js** (version 16 or higher)
- **npm** (comes with Node.js)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Generator

```bash
npm run generate
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
```

### Key Features

- ** Immediately Executable**: Run `cargo run` for instant demo with synthetic data
- ** Business Logic Boilerplate**: Complete `logic.rs` with function signatures derived from .cto models
- ** Testing**: Test framework with realistic synthetic data
- ** Type Safety**: All request/response handling is type-safe
- ** JSON Compatible**: Full serialize/deserialize with proper field naming
- ** DateTime Support**: ISO 8601 compatible DateTime serialization
- ** TODO Markers**: Clear guidance on where to implement business logic

## Project Structure

```
concerto-codegen-rust/
├── src/
│   ├── generate.js                       # Core generation engine
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
├── output/                               # Generated Rust project ⚡
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

## Development Workflow

### 1. Generate and Test

```bash
npm run generate   # Generate Rust project from your .cto files
cd output
cargo run          # See your models in action with synthetic data
cargo test         # Run comprehensive test suite
```

### 2. Implement Business Logic

1. Open `src/logic.rs`
2. Find the `trigger()` method
3. Replace TODO markers with your business logic
4. Run `cargo test` to verify implementation

### 3. Use in Production

Copy the generated project or integrate into your existing Rust codebase:

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
chrono = { version = "0.4", features = ["serde"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["macros", "rt-multi-thread"] }
```

## Key Benefits

- **🚀 Zero Setup Time**: Immediately executable output
- **🔒 Type Safety**: Compile-time guarantees for all model operations
- **🧪 Test-Driven**: Comprehensive test framework included
- **📊 Production Ready**: Async-compatible business logic structure
- **🌍 Universal**: Works with any valid Concerto model from any domain

---

**Ready to transform your Concerto models into production-ready Rust code?**

`npm run generate` and start building! 🚀
