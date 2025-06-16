#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { ModelManager } = require("@accordproject/concerto-core");
const { FileWriter } = require("@accordproject/concerto-util");
const { CodeGen } = require("@accordproject/concerto-codegen");
const { RustVisitor } = CodeGen;
const {
  ensureDirectoryExists,
  createCargoToml,
  createUsageExample,
} = require("./utils");

/**
 * Load all .cto files from a directory
 * @param {string} modelsDir - Directory containing .cto files
 * @returns {Array<{filename: string, content: string}>} Array of model files
 */
function loadModelFiles(modelsDir) {
  const modelFiles = [];

  if (!fs.existsSync(modelsDir)) {
    console.log(
      `Models directory '${modelsDir}' does not exist. Creating it...`
    );
    fs.mkdirSync(modelsDir, { recursive: true });
    return modelFiles;
  }

  const files = fs.readdirSync(modelsDir);

  for (const file of files) {
    if (file.endsWith(".cto")) {
      const filePath = path.join(modelsDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      modelFiles.push({
        filename: file,
        content: content,
      });
      console.log(`Loaded model file: ${file}`);
    }
  }

  return modelFiles;
}

/**
 * Generate Rust code from Concerto models
 * @param {string} modelsDir - Directory containing .cto files
 * @param {string} outputDir - Directory to write generated Rust files
 */
async function generateRustCode(modelsDir, outputDir) {
  try {
    console.log("Starting Rust code generation...");

    // Create Rust project structure
    const rustSrcDir = path.join(outputDir, "src");
    ensureDirectoryExists(outputDir);
    ensureDirectoryExists(rustSrcDir);
    console.log(`Created Rust project structure in: ${outputDir}`);

    // Load model files
    const modelFiles = loadModelFiles(modelsDir);

    if (modelFiles.length === 0) {
      console.log("No .cto files found in the models directory.");
      console.log(
        "Please add some Concerto model files to the models/ directory and try again."
      );
      return;
    }

    // Create ModelManager and add model files
    const modelManager = new ModelManager();

    // Sort models to ensure dependencies are loaded first
    // Models without imports (like money.cto) should be loaded before models that import them
    const sortedModelFiles = modelFiles.sort((a, b) => {
      const aHasImports = a.content.includes("import ");
      const bHasImports = b.content.includes("import ");

      // Models without imports come first
      if (!aHasImports && bHasImports) return -1;
      if (aHasImports && !bHasImports) return 1;

      // Otherwise maintain original order
      return 0;
    });

    for (const modelFile of sortedModelFiles) {
      try {
        modelManager.addCTOModel(modelFile.content, modelFile.filename);
        console.log(`Added model to ModelManager: ${modelFile.filename}`);
      } catch (error) {
        console.error(
          `Error adding model file ${modelFile.filename}:`,
          error.message
        );
        throw error;
      }
    }

    // Validate all models
    try {
      await modelManager.validateModelFiles();
      console.log("All model files validated successfully");
    } catch (error) {
      console.error("Model validation failed:", error.message);
      throw error;
    }

    // Create FileWriter for the src directory
    const fileWriter = new FileWriter(rustSrcDir);

    // Create RustVisitor
    const rustVisitor = new RustVisitor();

    // Generate Rust code
    const parameters = {
      fileWriter: fileWriter,
    };

    console.log("Generating Rust code...");
    rustVisitor.visit(modelManager, parameters);

    // Create Cargo.toml
    console.log("Creating Cargo.toml...");
    createCargoToml(outputDir, "concerto-models");

    // Create lib.rs that includes all generated modules
    console.log("Creating lib.rs...");
    createLibRs(rustSrcDir);

    // Create main.rs with example usage
    console.log("Creating main.rs with examples...");
    createMainRs(rustSrcDir, modelManager);

    // Create usage examples
    console.log("Creating usage examples...");
    createUsageExample(outputDir);

    // Create README for the Rust project
    console.log("Creating README.md...");
    createRustProjectReadme(outputDir);

    console.log(`Rust code generation completed successfully!`);
    console.log(`Generated Rust project is in: ${path.resolve(outputDir)}`);

    // List generated files
    const generatedFiles = fs
      .readdirSync(rustSrcDir)
      .filter((file) => file.endsWith(".rs"));
    if (generatedFiles.length > 0) {
      console.log("\nGenerated Rust files:");
      generatedFiles.forEach((file) => console.log(`  - src/${file}`));
    }

    console.log(`\nTo build and run the Rust project:`);
    console.log(`  cd ${path.relative(process.cwd(), outputDir)}`);
    console.log(`  cargo build`);
    console.log(`  cargo run`);
  } catch (error) {
    console.error("Error during code generation:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Create lib.rs file that includes all generated modules
 * @param {string} srcDir - Source directory path
 */
function createLibRs(srcDir) {
  const files = fs.readdirSync(srcDir);
  const modules = files
    .filter(
      (file) =>
        file.endsWith(".rs") &&
        file !== "lib.rs" &&
        file !== "main.rs" &&
        file !== "utils.rs" &&
        file !== "mod.rs" // Exclude the generated mod.rs file
    )
    .map((file) => path.basename(file, ".rs"))
    .filter((module) => module !== "mod"); // Extra safety to exclude 'mod' keyword

  // Separate user modules from concerto base modules
  const userModules = modules.filter(
    (module) =>
      !module.startsWith("concerto") && !module.includes("concerto_decorator")
  );
  const concertoModules = modules.filter(
    (module) =>
      module.startsWith("concerto") || module.includes("concerto_decorator")
  );

  const libContent = `//! Generated Concerto Models
//! 
//! This library contains Rust structs and enums generated from Concerto model files.
//! All types implement Serialize and Deserialize for JSON compatibility.

// External dependencies
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

// Generated modules
${modules.map((module) => `pub mod ${module};`).join("\n")}

// Re-export user-defined types (avoiding conflicts with base Concerto types)
${userModules.map((module) => `pub use ${module}::*;`).join("\n")}

// Concerto base modules are available but not globally re-exported to avoid conflicts
// Access them directly: use concerto_models::concerto::*; 
// Available base modules: ${concertoModules.join(", ")}

// Export utilities  
pub mod utils;
pub use utils::*;
`;

  fs.writeFileSync(path.join(srcDir, "lib.rs"), libContent);

  // Remove the generated mod.rs file since we're using lib.rs instead
  const modRsPath = path.join(srcDir, "mod.rs");
  if (fs.existsSync(modRsPath)) {
    fs.unlinkSync(modRsPath);
    console.log("Removed conflicting mod.rs file");
  }
}

/**
 * Create main.rs with example usage
 * @param {string} srcDir - Source directory path
 * @param {ModelManager} modelManager - Model manager with loaded models
 */
function createMainRs(srcDir, modelManager) {
  const namespaces = modelManager.getNamespaces();

  const mainContent = `//! Example usage of generated Concerto models
//!
//! This file demonstrates how to create instances of the generated types,
//! serialize them to JSON, and deserialize them back.

use serde_json;
use concerto_models::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🦀 Concerto Models Example");
    println!("========================\\n");
    
    // TODO: Add specific examples based on your models
    // You can create instances of your generated types here
    
    println!("Available namespaces:");
${namespaces.map((ns) => `    println!("  - ${ns}");`).join("\n")}
    
    println!("\\n✅ All examples completed successfully!");
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_functionality() {
        // Add tests for your generated types here
        assert!(true);
    }
}
`;

  fs.writeFileSync(path.join(srcDir, "main.rs"), mainContent);
}

/**
 * Create README.md for the Rust project
 * @param {string} projectDir - Project directory path
 */
function createRustProjectReadme(projectDir) {
  const readmeContent = `# Concerto Generated Rust Models

This is an automatically generated Rust project containing structs and enums derived from Concerto model files.

## Generated From

This project was generated from the following Concerto model files:
- See the \`models/\` directory in the parent project for the source .cto files

## Dependencies

- **serde**: For JSON serialization/deserialization
- **chrono**: For DateTime handling
- **serde_json**: For JSON parsing (dev dependency)

## Building

\`\`\`bash
cargo build
\`\`\`

## Running Examples

\`\`\`bash
cargo run
\`\`\`

## Running Tests

\`\`\`bash
cargo test
\`\`\`

## Using in Your Project

Add this to your \`Cargo.toml\`:

\`\`\`toml
[dependencies]
concerto-models = { path = "./path/to/this/project" }
\`\`\`

Then in your Rust code:

\`\`\`rust
use concerto_models::*;

// Use the generated types
// Example will depend on your specific models
\`\`\`

## Project Structure

- \`src/lib.rs\` - Main library file that exports all modules
- \`src/main.rs\` - Example usage
- \`src/*.rs\` - Generated model files (one per namespace)
- \`src/utils.rs\` - Utility functions for DateTime serialization
- \`Cargo.toml\` - Project configuration
- \`examples/\` - Additional usage examples

## Generated Types

All generated types implement:
- \`Serialize\` and \`Deserialize\` for JSON compatibility
- \`Debug\` for easy printing
- Proper field naming conventions (snake_case in Rust, preserved original names in JSON)

## DateTime Handling

DateTime fields use \`chrono::DateTime<Utc>\` and have custom serialization to maintain ISO 8601 format compatibility with the original Concerto models.

---

*This project was automatically generated by the Concerto Rust Code Generator.*
`;

  fs.writeFileSync(path.join(projectDir, "README.md"), readmeContent);
}

// Main execution
async function main() {
  const modelsDir = path.join(__dirname, "..", "models");
  const outputDir = path.join(__dirname, "..", "output");

  console.log(`Models directory: ${path.resolve(modelsDir)}`);
  console.log(`Output directory: ${path.resolve(outputDir)}`);

  await generateRustCode(modelsDir, outputDir);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = {
  generateRustCode,
  loadModelFiles,
};
