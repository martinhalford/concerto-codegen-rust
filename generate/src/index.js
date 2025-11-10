#!/usr/bin/env node

"use strict";

const path = require("path");
const { generateRustCode } = require("./generate");

/**
 * Main entry point for the Rust code generator
 */
async function main() {
  console.log("Concerto to Rust Code Generator");
  console.log("================================\n");

  const archivesDir = path.join(__dirname, "..", "..", "archives");
  const outputDir = path.join(__dirname, "..", "..", "output");

  console.log(
    "This tool generates Rust structs and enums from Concerto model files (.cto) in template archives"
  );
  console.log(`Archives directory: ${path.resolve(archivesDir)}`);
  console.log(`Output directory: ${path.resolve(outputDir)}\n`);

  try {
    await generateRustCode(archivesDir, outputDir);

    console.log("\n Code generation completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Review the generated Rust files in the output/ directory");
    console.log("2. Add the generated files to your Rust project");
    console.log("3. Add required dependencies to your Cargo.toml:");
    console.log('   - serde = { version = "1.0", features = ["derive"] }');
    console.log('   - chrono = { version = "0.4", features = ["serde"] }');
    console.log("   - std::collections::HashMap (built-in)");
  } catch (error) {
    console.error("\n Code generation failed:", error.message);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
