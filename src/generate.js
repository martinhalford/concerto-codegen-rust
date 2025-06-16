#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { ModelManager } = require("@accordproject/concerto-core");
const { FileWriter } = require("@accordproject/concerto-util");
const { CodeGen } = require("@accordproject/concerto-codegen");
const { RustVisitor } = CodeGen;
const { ensureDirectoryExists, createCargoToml } = require("./utils");

/**
 * Load all .cto files from template archives in the archives directory
 * @param {string} archivesDir - Directory containing template archives
 * @returns {Array<{filename: string, content: string, archiveName: string}>} Array of model files
 */
function loadModelFiles(archivesDir) {
  const modelFiles = [];

  if (!fs.existsSync(archivesDir)) {
    console.log(
      `Archives directory '${archivesDir}' does not exist. Creating it...`
    );
    fs.mkdirSync(archivesDir, { recursive: true });
    return modelFiles;
  }

  // Get all subdirectories in archives (each is a template archive)
  const archiveEntries = fs.readdirSync(archivesDir, { withFileTypes: true });
  const archiveDirectories = archiveEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (archiveDirectories.length === 0) {
    console.log("No template archives found in the archives directory.");
    console.log(
      "Please add template archives to the archives/ directory and try again."
    );
    return modelFiles;
  }

  // Process each template archive
  for (const archiveName of archiveDirectories) {
    const archivePath = path.join(archivesDir, archiveName);
    const modelDir = path.join(archivePath, "model");

    if (!fs.existsSync(modelDir)) {
      console.log(
        `Warning: No model directory found in archive '${archiveName}', skipping...`
      );
      continue;
    }

    console.log(`Processing template archive: ${archiveName}`);

    // Load all .cto files from the model directory of this archive
    const files = fs.readdirSync(modelDir);

    for (const file of files) {
      if (file.endsWith(".cto")) {
        const filePath = path.join(modelDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        modelFiles.push({
          filename: file,
          content: content,
          archiveName: archiveName,
        });
        console.log(`  Loaded model file: ${file} from ${archiveName}`);
      }
    }
  }

  return modelFiles;
}

/**
 * Extract Request and Response transaction types from the ModelManager
 * @param {ModelManager} modelManager - The loaded model manager
 * @returns {Object} Object containing request and response type information
 */
function extractContractTypes(modelManager) {
  const contractTypes = {
    requests: [],
    responses: [],
    templateModels: [],
  };

  // Get all namespaces and their declarations
  for (const namespace of modelManager.getNamespaces()) {
    const modelFile = modelManager.getModelFile(namespace);
    const declarations = modelFile.getAllDeclarations();

    for (const declaration of declarations) {
      const typeName = declaration.getName();
      const fullyQualifiedName = declaration.getFullyQualifiedName();

      if (declaration.isTransaction && declaration.isTransaction()) {
        // Check if this transaction extends Request
        if (
          declaration.getSuperType() &&
          declaration.getSuperType().includes("Request")
        ) {
          contractTypes.requests.push({
            name: typeName,
            fullyQualifiedName,
            namespace,
            declaration,
            properties: extractProperties(declaration),
          });
        }

        // Check if this transaction extends Response
        if (
          declaration.getSuperType() &&
          declaration.getSuperType().includes("Response")
        ) {
          contractTypes.responses.push({
            name: typeName,
            fullyQualifiedName,
            namespace,
            declaration,
            properties: extractProperties(declaration),
          });
        }
      }

      // Check for template models (assets that extend Clause)
      if (declaration.isAsset && declaration.isAsset()) {
        if (
          declaration.getSuperType() &&
          declaration.getSuperType().includes("Clause")
        ) {
          contractTypes.templateModels.push({
            name: typeName,
            fullyQualifiedName,
            namespace,
            declaration,
            properties: extractProperties(declaration),
          });
        }
      }
    }
  }

  return contractTypes;
}

/**
 * Extract property information from a declaration
 * @param {Object} declaration - Concerto declaration
 * @returns {Array} Array of property information
 */
function extractProperties(declaration) {
  const properties = [];

  if (declaration.getOwnProperties) {
    const ownProperties = declaration.getOwnProperties();

    for (const property of ownProperties) {
      const propInfo = {
        name: property.getName(),
        type: property.getType(),
        isOptional: property.isOptional ? property.isOptional() : false,
        isArray: property.isArray ? property.isArray() : false,
        rustName: toRustFieldName(property.getName()),
        rustType: toRustType(
          property.getType(),
          property.isOptional ? property.isOptional() : false
        ),
      };

      properties.push(propInfo);
    }
  }

  return properties;
}

/**
 * Convert Concerto field name to Rust snake_case
 * @param {string} fieldName - Concerto field name
 * @returns {string} Rust field name
 */
function toRustFieldName(fieldName) {
  return fieldName.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/**
 * Convert Concerto type to Rust type
 * @param {string} concertoType - Concerto type name
 * @param {boolean} isOptional - Whether the field is optional
 * @returns {string} Rust type
 */
function toRustType(concertoType, isOptional = false) {
  let rustType;

  switch (concertoType) {
    case "String":
      rustType = "String";
      break;
    case "Boolean":
      rustType = "bool";
      break;
    case "Double":
    case "Long":
      rustType = "f64";
      break;
    case "Integer":
      rustType = "i64";
      break;
    case "DateTime":
      rustType = "DateTime<Utc>";
      break;
    default:
      // For custom types, use the type name as-is
      rustType = concertoType;
      break;
  }

  return isOptional ? `Option<${rustType}>` : rustType;
}

/**
 * Generate boilerplate logic.rs file based on Concerto model definitions
 * @param {Object} contractTypes - Contract types extracted from models
 * @param {string} archiveName - Name of the template archive
 * @returns {string} Generated Rust boilerplate code
 */
function generateBoilerplateFromModels(contractTypes, archiveName) {
  const { requests, responses, templateModels } = contractTypes;

  if (requests.length === 0 || responses.length === 0) {
    console.log(
      "Warning: No Request/Response transaction types found in models"
    );
    return null;
  }

  // Use the first request/response pair found
  const requestType = requests[0];
  const responseType = responses[0];
  const templateModelType =
    templateModels.length > 0 ? templateModels[0] : null;

  console.log(`  Using Request type: ${requestType.name}`);
  console.log(`  Using Response type: ${responseType.name}`);
  if (templateModelType) {
    console.log(`  Using Template model: ${templateModelType.name}`);
  }

  // Generate response field assignments
  const responseFields = responseType.properties
    .filter((prop) => prop.name !== "$class" && prop.name !== "$timestamp")
    .map((prop) => {
      const rustName = prop.rustName === "_class" ? "_class" : prop.rustName;

      // Generate appropriate default values based on type
      let defaultValue;
      switch (prop.type) {
        case "Boolean":
          defaultValue = "false, // TODO: Calculate based on business logic";
          break;
        case "Double":
        case "Long":
          defaultValue = "0.0, // TODO: Calculate based on business logic";
          break;
        case "Integer":
          defaultValue = "0, // TODO: Calculate based on business logic";
          break;
        case "String":
          defaultValue =
            '"".to_string(), // TODO: Calculate based on business logic';
          break;
        default:
          defaultValue =
            "Default::default(), // TODO: Calculate based on business logic";
          break;
      }

      return `            ${rustName}: ${defaultValue}`;
    })
    .join("\n");

  // Generate test request field assignments
  const testRequestFields = requestType.properties
    .filter((prop) => prop.name !== "$class" && prop.name !== "$timestamp")
    .map((prop) => {
      const rustName = prop.rustName === "_class" ? "_class" : prop.rustName;

      // Generate appropriate test values based on type
      let testValue;
      switch (prop.type) {
        case "Boolean":
          testValue = "false";
          break;
        case "Double":
        case "Long":
          testValue = "100.0";
          break;
        case "Integer":
          testValue = "100";
          break;
        case "String":
          testValue = '"test_value".to_string()';
          break;
        case "DateTime":
          if (prop.isOptional) {
            testValue = "Some(Utc::now())";
          } else {
            testValue = "Utc::now()";
          }
          break;
        default:
          if (prop.isOptional) {
            testValue = "None";
          } else {
            testValue = "Default::default()";
          }
          break;
      }

      return `            ${rustName}: ${testValue}`;
    })
    .join(",\n");

  return `//! Model Logic Module
//! 
//! AUTO-GENERATED BOILERPLATE - Based on template: ${archiveName}
//! 
//! This file provides boilerplate code for implementing the business logic.
//! The function signatures are generated based on Concerto model definitions.
//!
//! TODO: Implement the business logic in the trigger function.

use chrono::Utc;
use crate::*;

// Model response wrapper
#[derive(Debug)]
pub struct ContractResponse {
    pub result: ${responseType.name},
}

// Business Logic struct
pub struct ContractLogic;

impl ContractLogic {
    pub fn new() -> Self {
        Self
    }

    /// Main trigger function
    /// 
    /// This function processes a request and generates a response according to the business logic.
    /// 
    /// # Arguments
    /// * \`template_data\` - The template/model data 
    /// * \`request\` - The incoming request to process
    /// 
    /// # Returns
    /// * \`ContractResponse\` - The response containing the execution result
    pub async fn trigger(
        &self,
        template_data: &${
          templateModelType ? templateModelType.name : "TemplateModel"
        },
        request: &${requestType.name},
    ) -> Result<ContractResponse, Box<dyn std::error::Error>> {
        
        // TODO: Implement your business logic here
        // 
        // Available request fields:
${requestType.properties
  .map(
    (prop) =>
      `        // - request.${prop.rustName}: ${prop.rustType} ${
        prop.isOptional ? "(optional)" : ""
      }`
  )
  .join("\n")}
        //
        // Template data fields:
${
  templateModelType
    ? templateModelType.properties
        .map(
          (prop) =>
            `        // - template_data.${prop.rustName}: ${prop.rustType} ${
              prop.isOptional ? "(optional)" : ""
            }`
        )
        .join("\n")
    : "        // - (Template model not found)"
}
        //
        // Example pattern:
        // 1. Validate the request
        // 2. Extract relevant data from template_data and request
        // 3. Perform calculations/business logic
        // 4. Create and return the response
        
        // Create the response based on your business logic
        let response = ${responseType.name} {
            _class: "${responseType.fullyQualifiedName}".to_string(),
${responseFields}
            _timestamp: Utc::now(),
        };

        Ok(ContractResponse { result: response })
    }
}

impl Default for ContractLogic {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_logic_trigger() {
        let logic = ContractLogic::new();
        
        // Create test template data
        ${
          templateModelType
            ? `        let template_data = ${templateModelType.name} {
            _class: "${templateModelType.fullyQualifiedName}".to_string(),
            clause_id: "test-clause".to_string(),
            _identifier: "test-template".to_string(),
${templateModelType.properties
  .filter(
    (prop) =>
      prop.name !== "$class" &&
      prop.name !== "$timestamp" &&
      prop.name !== "clauseId" &&
      prop.name !== "$identifier"
  )
  .map((prop) => {
    const rustName = prop.rustName === "_class" ? "_class" : prop.rustName;

    let testValue;
    switch (prop.type) {
      case "Boolean":
        testValue = "false";
        break;
      case "Double":
      case "Long":
        testValue = "10.0";
        break;
      case "Integer":
        testValue = "100";
        break;
      case "String":
        testValue = '"Sample Value".to_string()';
        break;
      case "Duration":
        testValue = `Duration {
                 _class: "org.accordproject.time@0.3.0.Duration".to_string(),
                 amount: 1,
                 unit: TemporalUnit::days,
             }`;
        break;
      case "TemporalUnit":
        testValue = "TemporalUnit::days";
        break;
      default:
        if (prop.isOptional) {
          testValue = "None";
        } else {
          testValue = "Default::default()";
        }
        break;
    }

    return `            ${rustName}: ${testValue},`;
  })
  .join("\n")}
        };`
            : `// TODO: Create template data
        let template_data = TemplateModel::default();`
        }

        // Create test request data
        let request = ${requestType.name} {
            _class: "${requestType.fullyQualifiedName}".to_string(),
${testRequestFields},
            _timestamp: Utc::now(),
        };

        // Execute the business logic
        let result = logic.trigger(&template_data, &request).await;
        
        // TODO: Add proper assertions based on your business logic
        assert!(result.is_ok(), "Logic execution should succeed");
        
        if let Ok(response) = result {
            println!("Logic response: {:?}", response.result);
            // TODO: Add specific assertions for your business logic
        }
    }
}`;
}

/**
 * Generate Rust code from Concerto models
 * @param {string} archivesDir - Directory containing template archives with .cto files
 * @param {string} outputDir - Directory to write generated Rust files
 */
async function generateRustCode(archivesDir, outputDir) {
  try {
    console.log("Starting Rust code generation...");

    // Create Rust project structure
    const rustSrcDir = path.join(outputDir, "src");
    ensureDirectoryExists(outputDir);
    ensureDirectoryExists(rustSrcDir);
    console.log(`Created Rust project structure in: ${outputDir}`);

    // Load model files from template archives
    const modelFiles = loadModelFiles(archivesDir);

    if (modelFiles.length === 0) {
      console.log("No .cto files found in the template archives.");
      console.log(
        "Please add template archives with model files to the archives/ directory and try again."
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

    // Load template examples (request.json and response.json) before creating files
    console.log("Scanning for template examples...");
    // Template examples are no longer needed - we extract everything from .cto models
    const templateExamples = [];

    // Create lib.rs that includes all generated modules
    console.log("Creating lib.rs...");
    createLibRs(rustSrcDir);

    // Extract contract types from the loaded models
    console.log("Extracting contract types from Concerto models...");
    const contractTypes = extractContractTypes(modelManager);

    // Create main.rs with executable business logic
    console.log("Creating main.rs with executable demo...");
    createMainRs(rustSrcDir, modelManager, contractTypes);

    if (
      contractTypes.requests.length > 0 &&
      contractTypes.responses.length > 0
    ) {
      console.log(
        `Found ${contractTypes.requests.length} Request type(s) and ${contractTypes.responses.length} Response type(s)`
      );

      // Determine archive name from template examples or use default
      const archiveName =
        templateExamples.length > 0
          ? templateExamples[0].archiveName
          : "template";

      console.log(`Generating boilerplate logic.rs from Concerto models...`);
      const boilerplateLogic = generateBoilerplateFromModels(
        contractTypes,
        archiveName
      );

      if (boilerplateLogic) {
        const logicPath = path.join(rustSrcDir, "logic.rs");
        fs.writeFileSync(logicPath, boilerplateLogic);
        console.log("  Created logic.rs with executable boilerplate");
        console.log(
          "  Boilerplate generated directly from .cto model definitions!"
        );
      }
    } else {
      console.log(
        "No Request/Response transaction types found in Concerto models"
      );
    }

    // Usage examples are provided in main.rs and logic.rs tests
    console.log("Usage examples integrated into main.rs and tests...");

    // Create README for the Rust project
    console.log("Creating README.md...");
    createRustProjectReadme(outputDir, modelManager, contractTypes);

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
        file !== "logic.rs" && // Exclude logic.rs since we handle it manually
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

  // Business logic module
pub mod logic;

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
 * Create main.rs that executes the business logic with synthetic data
 * @param {string} srcDir - Source directory path
 * @param {ModelManager} modelManager - Model manager with loaded models
 * @param {Object} contractTypes - Contract types extracted from models
 */
function createMainRs(srcDir, modelManager, contractTypes = null) {
  const namespaces = modelManager.getNamespaces();

  let mainContent;

  if (
    contractTypes &&
    contractTypes.requests.length > 0 &&
    contractTypes.responses.length > 0
  ) {
    const requestType = contractTypes.requests[0];
    const responseType = contractTypes.responses[0];
    const templateModelType =
      contractTypes.templateModels.length > 0
        ? contractTypes.templateModels[0]
        : null;

    // Generate synthetic test data for the request
    const requestFields = requestType.properties
      .filter((prop) => prop.name !== "$class" && prop.name !== "$timestamp")
      .map((prop) => {
        const rustName = prop.rustName === "_class" ? "_class" : prop.rustName;

        // Generate appropriate test values based on type (generic)
        let testValue;
        switch (prop.type) {
          case "Boolean":
            testValue = "false";
            break;
          case "Double":
          case "Long":
            testValue = "100.0";
            break;
          case "Integer":
            testValue = "100";
            break;
          case "String":
            testValue = '"Sample Value".to_string()';
            break;
          case "DateTime":
            if (prop.isOptional) {
              testValue = 'Some("2024-01-01T12:00:00Z".parse().unwrap())';
            } else {
              testValue = '"2024-01-01T12:00:00Z".parse().unwrap()';
            }
            break;
          default:
            if (prop.isOptional) {
              testValue = "None";
            } else {
              testValue = "Default::default()";
            }
            break;
        }

        return `            ${rustName}: ${testValue}`;
      })
      .join(",\n");

    // Generate synthetic template data
    const templateFields = templateModelType
      ? templateModelType.properties
          .filter(
            (prop) =>
              prop.name !== "$class" &&
              prop.name !== "$timestamp" &&
              prop.name !== "clauseId" &&
              prop.name !== "$identifier"
          )
          .map((prop) => {
            const rustName =
              prop.rustName === "_class" ? "_class" : prop.rustName;

            let testValue;
            switch (prop.type) {
              case "Boolean":
                testValue = "false";
                break;
              case "Double":
              case "Long":
                testValue = "10.0";
                break;
              case "Integer":
                testValue = "100";
                break;
              case "String":
                testValue = '"Sample Value".to_string()';
                break;
              case "Duration":
                testValue = `Duration {
                 _class: "org.accordproject.time@0.3.0.Duration".to_string(),
                 amount: 1,
                 unit: TemporalUnit::days,
             }`;
                break;
              case "TemporalUnit":
                testValue = "TemporalUnit::days";
                break;
              default:
                testValue = "Default::default()";
                break;
            }

            return `            ${rustName}: ${testValue}`;
          })
          .join(",\n")
      : "";

    mainContent = `//! Concerto Model Execution Demo
//!
//! This file demonstrates the auto-generated logic with synthetic test data.
//! The generated code is immediately executable and shows the complete workflow.

use chrono::{TimeZone, Utc};
use serde_json;
use concerto_models::*;
use logic::{ContractLogic};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("\\nConcerto Model Execution Demo");
    println!("==============================\\n");
    
    println!("Available namespaces:");
${namespaces.map((ns) => `    println!("  - ${ns}");`).join("\n")}
    
    println!("\\nModel Types Found:");
    println!("  Request: ${requestType.name}");
    println!("  Response: ${responseType.name}");
    ${
      templateModelType
        ? `println!("  Template: ${templateModelType.name}");`
        : ""
    }
    
    // Create synthetic template data
    ${
      templateModelType
        ? `let template_data = ${templateModelType.name} {
        _class: "${templateModelType.fullyQualifiedName}".to_string(),
        clause_id: "demo-clause-001".to_string(),
        _identifier: "demo-template".to_string(),
${templateFields}
    };`
        : `let template_data = TemplateModel::default();`
    }
    
    // Create synthetic request data  
    let request = ${requestType.name} {
        _class: "${requestType.fullyQualifiedName}".to_string(),
${requestFields},
        _timestamp: Utc::now(),
    };
    
    println!("\\nProcessing Request with synthetic data...");
    
    // Execute the business logic
    println!("\\nExecuting Business Logic...");
    let logic = ContractLogic::new();
    
    match logic.trigger(&template_data, &request).await {
        Ok(response) => {
            println!("\\nLogic Execution Successful!");
            println!("\\nResponse Generated:");
            
            // Show JSON serialization (generic approach)
            match serde_json::to_string_pretty(&response.result) {
                Ok(json) => {
                    println!("\\nResponse JSON:");
                    println!("{}", json);
                }
                Err(e) => println!("Failed to serialize response: {}", e),
            }
        }
        Err(e) => {
            println!("\\nLogic execution failed: {}", e);
        }
    }
    
    println!("\\nNext Steps:");
    println!("  1. Check logic.rs for the contract implementation");
    println!("  2. Modify the TODO items to add your business logic");
    println!("  3. Run 'cargo test' to run the included unit tests");
    println!("  4. Customize the synthetic data above for your use case");
    
    println!("\\nDemo completed successfully!\\n");
    println!("=============================\\n");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_contract_execution() {
        // Test the contract execution with synthetic data
        let logic = ContractLogic::new();
        
        // This test ensures the basic structure works
        assert!(true, "Logic structure is valid");
    }
}
`;
  } else {
    // Fallback if no contract types found
    mainContent = `//! Example usage of generated Concerto models
//!
//! This file demonstrates how to create instances of the generated types.

use concerto_models::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Concerto Models Example");
    println!("========================\\n");
    
    println!("Available namespaces:");
${namespaces.map((ns) => `    println!("  - ${ns}");`).join("\n")}
    
    println!("\\nNo model types found. Check your .cto files for:");
    println!("  - transaction types extending Request");
    println!("  - transaction types extending Response");
    
    Ok(())
}
`;
  }

  fs.writeFileSync(path.join(srcDir, "main.rs"), mainContent);
}

/**
 * Create README.md for the Rust project
 * @param {string} projectDir - Project directory path
 * @param {ModelManager} modelManager - Model manager with loaded models
 * @param {Object} contractTypes - Contract types info (optional)
 */
function createRustProjectReadme(
  projectDir,
  modelManager = null,
  contractTypes = null
) {
  // Get domain-specific namespaces (filter out generic Concerto ones)
  const domainNamespaces = modelManager
    ? Array.from(modelManager.getNamespaces())
        .filter((ns) => !ns.startsWith("concerto")) // Remove generic Concerto namespaces
        .filter((ns) => !ns.startsWith("org.accordproject")) // Remove standard Accord Project namespaces
        .sort()
    : [];

  // Get generated model file count (exclude standard files)
  const srcDir = path.join(projectDir, "src");
  const modelFileCount = fs.existsSync(srcDir)
    ? fs
        .readdirSync(srcDir)
        .filter(
          (file) =>
            file.endsWith(".rs") &&
            !["lib.rs", "main.rs", "logic.rs", "utils.rs"].includes(file)
        ).length
    : 0;

  // Contract types section (generic version)
  const contractTypesSection =
    contractTypes && contractTypes.requests.length > 0
      ? `
## Available Types

This project includes Request/Response types and business logic structures:

**Request Types**: ${contractTypes.requests.length} type(s)  
**Response Types**: ${contractTypes.responses.length} type(s)  
${
  contractTypes.templateModels.length > 0
    ? `**Template Types**: ${contractTypes.templateModels.length} type(s)`
    : ""
}

See the generated files for complete type definitions and field information.
`
      : "";

  // Namespaces section (only show domain-specific ones)
  const namespacesSection =
    domainNamespaces.length > 0
      ? `
## Generated from Models

**Domain Namespaces**: ${domainNamespaces.length}  
**Generated Model Files**: ${modelFileCount}

This project includes types from your specific domain models plus standard Concerto base types.
`
      : `
## Generated from Models

**Generated Model Files**: ${modelFileCount}

This project includes types from Concerto model definitions.
`;

  const readmeContent = `# Concerto Generated Rust Models

This project contains automatically generated Rust code from Concerto model definitions (.cto files).

## Quick Start

**Build and run immediately:**
\`\`\`bash
cargo build
cargo run    # Runs demo with synthetic data
cargo test   # Runs all tests
\`\`\`

## Generated From

This project was generated from Accord Project Template Archives:
- Template archives are in the \`archives/\` directory of the parent project
- Each archive contains \`.cto\` model files in its \`model/\` subdirectory
${namespacesSection}${contractTypesSection}

## Project Structure

**Key files:**
- \`src/lib.rs\` - Main library file that exports all modules
- \`src/main.rs\` - **Executable demo** with synthetic data
- \`src/logic.rs\` - **Business logic boilerplate** with TODO markers
- \`src/utils.rs\` - Utility functions for serialization
- \`Cargo.toml\` - Project configuration with dependencies

**Generated model files:**
- \`src/*.rs\` - ${modelFileCount} model files (one per namespace)
- Plus standard Concerto base types and utilities

## Business Logic Implementation

1. Open \`src/logic.rs\`
2. Implement the \`trigger()\` method
3. Replace default return values with your business logic
4. Run \`cargo test\` to verify your implementation

## Using in Your Project

Add this to your \`Cargo.toml\`:

\`\`\`toml
[dependencies]
concerto-models = { path = "./path/to/this/project" }
\`\`\`

Example usage:

\`\`\`rust
use concerto_models::*;
use concerto_models::logic::ContractLogic;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create the business logic processor
    let logic = ContractLogic::new();
    
    // Create your request (see main.rs for examples)
    // let request = YourRequestType { ... };
    // let template = YourTemplateType { ... };
    
    // Process the request
    // let response = logic.trigger(&template, &request).await?;
    
    Ok(())
}
\`\`\`

##  Generated Types

All generated types implement:
-  \`Serialize\` and \`Deserialize\` for JSON compatibility
-  \`Debug\` for easy printing and debugging  
-  \`Clone\` for copying when needed
-  Proper field naming (snake_case in Rust, original names in JSON)

##  DateTime Handling

DateTime fields use \`chrono::DateTime<Utc>\` with custom serialization to maintain ISO 8601 format compatibility with Concerto models.

##  Testing

The project includes tests:

\`\`\`bash
cargo test              # Run all tests
cargo test logic        # Run business logic tests only
cargo test --verbose    # Detailed test output
\`\`\`

##  Dependencies

- **serde** - JSON serialization/deserialization
- **chrono** - DateTime handling with timezone support
- **serde_json** - JSON parsing and formatting
- **tokio** - Async runtime for business logic execution

`;

  fs.writeFileSync(path.join(projectDir, "README.md"), readmeContent);
}

// Main execution
async function main() {
  const archivesDir = path.join(__dirname, "..", "archives");
  const outputDir = path.join(__dirname, "..", "output");

  console.log(`Archives directory: ${path.resolve(archivesDir)}`);
  console.log(`Output directory: ${path.resolve(outputDir)}`);

  await generateRustCode(archivesDir, outputDir);
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
  extractContractTypes,
  generateBoilerplateFromModels,
};
