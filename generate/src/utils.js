"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Utility functions for the Rust code generator
 */

/**
 * Check if a directory exists and create it if it doesn't
 * @param {string} dirPath - Path to the directory
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Clean a directory by removing all files
 * @param {string} dirPath - Path to the directory to clean
 * @param {string[]} extensions - File extensions to remove (e.g., ['.rs'])
 */
function cleanDirectory(dirPath, extensions = []) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const files = fs.readdirSync(dirPath);
  let removedCount = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      if (
        extensions.length === 0 ||
        extensions.some((ext) => file.endsWith(ext))
      ) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    }
  }

  if (removedCount > 0) {
    console.log(`Cleaned ${removedCount} files from ${dirPath}`);
  }
}

/**
 * Get file statistics for a directory
 * @param {string} dirPath - Path to the directory
 * @param {string} extension - File extension to filter by
 * @returns {Object} Statistics object
 */
function getFileStats(dirPath, extension) {
  if (!fs.existsSync(dirPath)) {
    return { count: 0, totalSize: 0, files: [] };
  }

  const files = fs.readdirSync(dirPath);
  const filteredFiles = files.filter((file) => file.endsWith(extension));

  let totalSize = 0;
  const fileDetails = [];

  for (const file of filteredFiles) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    totalSize += stat.size;
    fileDetails.push({
      name: file,
      size: stat.size,
      modified: stat.mtime,
    });
  }

  return {
    count: filteredFiles.length,
    totalSize,
    files: fileDetails,
  };
}

/**
 * Validate that a Concerto model file has proper syntax
 * @param {string} filePath - Path to the .cto file
 * @returns {Object} Validation result
 */
function validateCTOFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");

    // Basic validation checks
    const checks = {
      hasNamespace: /namespace\s+[\w.]+/.test(content),
      hasValidSyntax: !content.includes("syntax error"),
      isNotEmpty: content.trim().length > 0,
    };

    const isValid = Object.values(checks).every((check) => check);

    return {
      isValid,
      checks,
      filePath,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      filePath,
    };
  }
}

/**
 * Create a sample Cargo.toml for the generated Rust code
 * @param {string} outputPath - Path where to create the Cargo.toml
 * @param {string} projectName - Name of the Rust project
 */
function createCargoToml(
  outputPath,
  projectName = "generated-concerto-models"
) {
  const cargoToml = `[package]
name = "${projectName}"
version = "0.1.0"
edition = "2021"
description = "Generated Rust models from Concerto schema files"
license = "Apache-2.0"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
chrono = { version = "0.4", features = ["serde"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["macros", "rt-multi-thread"] }

[dev-dependencies]
# Add any test-specific dependencies here


`;

  const cargoPath = path.join(outputPath, "Cargo.toml");
  fs.writeFileSync(cargoPath, cargoToml);
  console.log(`Created Cargo.toml at: ${cargoPath}`);
}

module.exports = {
  ensureDirectoryExists,
  cleanDirectory,
  getFileStats,
  validateCTOFile,
  createCargoToml,
};
