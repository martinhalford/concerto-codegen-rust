# Rust Code Generation from Concerto Models

This project demonstrates how to use the Concerto RustVisitor to generate Rust structs and enums from Concerto model files (.cto). It creates a complete, buildable Rust project from your Concerto models.

## Prerequisites

- **Node.js** (version 16 or higher)
- **npm** (comes with Node.js)

## Quick Start

### 1. Clone and Navigate to the Project

```bash
cd rust-codegen-example
```

### 2. Install Dependencies

```bash
npm install
```

This will install:

- `@accordproject/concerto-codegen` - Contains the RustVisitor
- `@accordproject/concerto-core` - Core Concerto functionality
- `@accordproject/concerto-util` - Utility functions including FileWriter

### 3. Run the Generator

```bash
npm run generate
```

This will:

- Load all `.cto` files from template archives in the `archives/` directory
- Generate corresponding Rust files in the `output/` directory
- Create a complete Rust project with `Cargo.toml`, `lib.rs`, and `main.rs`
- Generate utility functions for DateTime serialization

### 4. Test the Generated Rust Project

```bash
cd output
cargo build
cargo run
```

## Generated Output

The generator creates a complete Rust project in the `output/` directory:

```
output/
├── Cargo.toml              # Complete Rust project configuration
├── README.md               # Documentation for the generated project
├── src/
│   ├── lib.rs             # Main library file with proper module exports
│   ├── main.rs            # Example usage with your model namespaces
│   ├── hello_1_0_0.rs     # Your generated models (e.g., Address, Customer)
│   ├── concerto*.rs       # Concerto base types
│   └── utils.rs           # DateTime serialization utilities
└── examples/
    └── usage.rs           # Additional usage examples
```

### Key Features

- **Complete Rust Project**: Ready to build and run with `cargo build` and `cargo run`
- **Proper Module Organization**: User models are re-exported, base Concerto types available via explicit imports
- **JSON Serialization**: All types implement Serialize/Deserialize with proper field naming
- **DateTime Support**: Custom serialization for DateTime fields maintaining ISO 8601 compatibility
- **Optional Fields**: Properly handled with Rust's `Option<T>` type

## Project Structure

```
rust-codegen-example/
├── src/
│   ├── index.js          # Main entry point with user-friendly interface
│   ├── generate.js       # Core code generation logic
│   └── utils.js          # Utility functions
├── archives/
│   └── latedeliveryandpenalty-typescript/   # Example template archive
│       ├── model/
│       │   ├── model.cto                   # Main template model
│       │   ├── @models.accordproject.org.accordproject.contract@0.2.0.cto
│       │   ├── @models.accordproject.org.accordproject.runtime@0.2.0.cto
│       │   └── @models.accordproject.org.time@0.3.0.cto
│       ├── logic/                          # Template logic (Ergo files)
│       ├── text/                           # Template text (grammar files)
│       └── package.json                    # Template archive metadata
├── output/               # Generated Rust project (created when you run the generator)
├── package.json          # Node.js project configuration
├── README.md            # This file
└── .gitignore           # Git ignore file
```

## Adding Your Own Template Archives

1. Create template archives in the `archives/` directory following the Accord Project structure:
   ```
   archives/your-template-name/
   ├── model/
   │   ├── model.cto        # Your main template model
   │   └── *.cto           # Any additional model dependencies
   ├── logic/              # Ergo logic files (optional)
   ├── text/               # Grammar files (optional)
   └── package.json        # Template metadata
   ```
2. Run `npm run generate` again
3. The generator will process all `.cto` files from all template archives and generate corresponding Rust code
4. Build and test: `cd output && cargo build && cargo run`

## Understanding the Generated Code

The RustVisitor generates:

### Structs from Concerto Classes

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Address {
    #[serde(rename = "$class")]
    pub _class: String,

    #[serde(rename = "line1")]
    pub line1: String,

    #[serde(rename = "city")]
    pub city: String,

    // ... other fields
}
```

### Optional Fields

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Customer {
    #[serde(rename = "$class")]
    pub _class: String,

    #[serde(
        rename = "address",
        skip_serializing_if = "Option::is_none",
    )]
    pub address: Option<Address>,
}
```

### Enums from Concerto Enumerations

```rust
pub enum BusinessType {
    #[allow(non_camel_case_types)]
    SOLE_PROPRIETORSHIP,
    #[allow(non_camel_case_types)]
    PARTNERSHIP,
    // ... other variants
}
```

### Special DateTime Handling

DateTime fields get special serialization attributes:

```rust
#[serde(
    rename = "timestamp",
    serialize_with = "serialize_datetime",
    deserialize_with = "deserialize_datetime",
)]
pub timestamp: DateTime<Utc>,
```

## Using the Generated Code

### In the Generated Project

The generated project includes a `main.rs` with examples:

```bash
cd output
cargo run
```

### In Your Own Rust Project

1. Copy the generated files to your Rust project's `src/` directory
2. Add dependencies to your `Cargo.toml`:

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
chrono = { version = "0.4", features = ["serde"] }
serde_json = "1.0"
```

3. Import and use the generated types:

```rust
use concerto_models::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = Address {
        _class: "hello@1.0.0.Address".to_string(),
        line1: "123 Main St".to_string(),
        city: "Anytown".to_string(),
        state: "CA".to_string(),
        country: "USA".to_string(),
    };

    let customer = Customer {
        _class: "hello@1.0.0.Customer".to_string(),
        address: Some(address),
    };

    // Serialize to JSON
    let json = serde_json::to_string_pretty(&customer)?;
    println!("{}", json);

    Ok(())
}
```

## Development with Local Concerto-Codegen

To use a local version of concerto-codegen during development:

1. Update `package.json`:

```json
"@accordproject/concerto-codegen": "file:/path/to/your/local/concerto-codegen"
```

2. Reinstall dependencies:

```bash
npm install
```

## Troubleshooting

### Common Issues

1. **"Module not found" errors**

   - Make sure you've run `npm install`
   - Check that the dependencies are correctly installed

2. **"No .cto files found"**

   - Ensure your template archives are in the `archives/` directory
   - Check that each archive has a `model/` subdirectory containing `.cto` files
   - Verify that `.cto` files have the correct extension

3. **Generated Rust code doesn't compile**

   - Make sure you have the required dependencies in your Rust project's `Cargo.toml`
   - Check that you're importing the generated modules correctly

4. **Namespace resolution errors**
   - Ensure all imported types are available locally or via URL
   - Check that dependencies are loaded in the correct order

### Getting Help

- Check the console output for detailed error messages
- Review the example model file to understand proper Concerto syntax
- Ensure your model files are syntactically correct

## Customization

You can customize the code generation by:

- Modifying the `src/generate.js` script
- Adding custom template archives to the `archives/` directory
- Adjusting the output directory in the generator script
- Customizing the generated `Cargo.toml` in `src/utils.js`

## License

Apache-2.0
