#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { ModelManager } = require("@accordproject/concerto-core");
const { FileWriter } = require("@accordproject/concerto-util");
const { CodeGen } = require("@accordproject/concerto-codegen");
const { RustVisitor } = CodeGen;
const { ensureDirectoryExists } = require("./utils");

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
 * Extract Contract types from the ModelManager for ink! smart contracts
 * @param {ModelManager} modelManager - The loaded model manager
 * @returns {Object} Object containing contract type information
 */
function extractContractTypes(modelManager) {
  const contractTypes = {
    requests: [],
    responses: [],
    templateModels: [],
    concepts: [],
    participants: [],
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

      // Check for template models (assets that extend Clause/Contract)
      if (declaration.isAsset && declaration.isAsset()) {
        if (
          declaration.getSuperType() &&
          (declaration.getSuperType().includes("Clause") ||
            declaration.getSuperType().includes("Contract"))
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

      // Check for concepts
      if (declaration.isConcept && declaration.isConcept()) {
        contractTypes.concepts.push({
          name: typeName,
          fullyQualifiedName,
          namespace,
          declaration,
          properties: extractProperties(declaration),
        });
      }

      // Check for participants
      if (declaration.isParticipant && declaration.isParticipant()) {
        contractTypes.participants.push({
          name: typeName,
          fullyQualifiedName,
          namespace,
          declaration,
          properties: extractProperties(declaration),
        });
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
        rustType: toInkType(
          property.getType(),
          property.isOptional ? property.isOptional() : false,
          property.isArray ? property.isArray() : false
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
  // Handle special Concerto field names that start with $
  if (fieldName.startsWith("$")) {
    return fieldName
      .substring(1)
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase();
  }
  return fieldName.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/**
 * Convert Concerto type to ink! compatible Rust type
 * @param {string} concertoType - Concerto type name
 * @param {boolean} isOptional - Whether the field is optional
 * @param {boolean} isArray - Whether the field is an array
 * @returns {string} ink! compatible Rust type
 */
function toInkType(concertoType, isOptional = false, isArray = false) {
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
      rustType = "u128"; // Use u128 for financial calculations in ink!
      break;
    case "Integer":
      rustType = "u64";
      break;
    case "DateTime":
      rustType = "u64"; // Timestamp in ink!
      break;
    default:
      // For custom types, use the type name as-is
      rustType = concertoType;
      break;
  }

  if (isArray) {
    rustType = `Vec<${rustType}>`;
  }

  return isOptional ? `Option<${rustType}>` : rustType;
}

/**
 * Generate ink! contract storage structure
 * @param {Object} contractTypes - Contract type information
 * @param {string} contractName - Name of the contract
 * @returns {string} Generated storage struct
 */
function generateContractStorage(contractTypes, contractName) {
  const storageFields = [];

  // Add basic contract storage
  storageFields.push("        owner: AccountId");
  storageFields.push("        paused: bool");

  // Add template model data as storage if available
  if (contractTypes.templateModels.length > 0) {
    const templateModel = contractTypes.templateModels[0];
    const filteredProperties = templateModel.properties.filter(
      (prop) =>
        !["$class", "$timestamp", "clauseId", "$identifier"].includes(prop.name)
    );

    for (const prop of filteredProperties) {
      const storageType = mapTypeForInkStorage(prop.rustType);
      storageFields.push(`        ${prop.rustName}: ${storageType}`);
    }
  }

  return `    #[ink(storage)]
    pub struct ${contractName} {
${storageFields.join(",\n")}
    }`;
}

/**
 * Generate ink! contract events
 * @param {Object} contractTypes - Contract type information
 * @returns {string} Generated events
 */
function generateContractEvents(contractTypes) {
  let events = [];

  // Standard contract events
  events.push(`    #[ink(event)]
    pub struct ContractCreated {
        #[ink(topic)]
        pub owner: AccountId,
    }`);

  events.push(`    #[ink(event)]
    pub struct ContractPaused {
        #[ink(topic)]
        pub by: AccountId,
    }`);

  events.push(`    #[ink(event)]
    pub struct ContractUnpaused {
        #[ink(topic)]
        pub by: AccountId,
    }`);

  // Add events for request/response patterns
  if (contractTypes.requests.length > 0) {
    for (const request of contractTypes.requests) {
      events.push(`    #[ink(event)]
    pub struct ${request.name}Submitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }`);
    }
  }

  if (contractTypes.responses.length > 0) {
    for (const response of contractTypes.responses) {
      events.push(`    #[ink(event)]
    pub struct ${response.name}Generated {
        #[ink(topic)]
        pub request_id: u64,
        pub success: bool,
    }`);
    }
  }

  return events.join("\n\n");
}

/**
 * Generate ink! contract data structures
 * @param {Object} contractTypes - Contract type information
 * @returns {string} Generated data structures
 */
function generateDataStructures(contractTypes) {
  let structures = [];
  let generatedTypes = new Set(); // Track generated types to avoid duplicates

  // Generate request structures
  for (const request of contractTypes.requests) {
    if (generatedTypes.has(request.name)) continue;
    generatedTypes.add(request.name);

    const fields = request.properties
      .filter((prop) => !["$class", "$timestamp"].includes(prop.name))
      .map(
        (prop) =>
          `        pub ${prop.rustName}: ${mapTypeForInkStorage(prop.rustType)}`
      )
      .join(",\n");

    structures.push(`    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct ${request.name} {
${fields}
    }`);
  }

  // Generate response structures
  for (const response of contractTypes.responses) {
    if (generatedTypes.has(response.name)) continue;
    generatedTypes.add(response.name);

    const fields = response.properties
      .filter((prop) => !["$class", "$timestamp"].includes(prop.name))
      .map(
        (prop) =>
          `        pub ${prop.rustName}: ${mapTypeForInkStorage(prop.rustType)}`
      )
      .join(",\n");

    structures.push(`    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct ${response.name} {
${fields}
    }`);
  }

  // Generate concept structures (only relevant ones)
  const relevantConcepts = contractTypes.concepts.filter((concept) =>
    ["Penalty", "MonetaryAmount", "Period", "Duration"].includes(concept.name)
  );

  for (const concept of relevantConcepts) {
    if (generatedTypes.has(concept.name)) continue;
    generatedTypes.add(concept.name);

    const fields = concept.properties
      .filter(
        (prop) => !["$class", "$timestamp", "$identifier"].includes(prop.name)
      )
      .map(
        (prop) =>
          `        pub ${prop.rustName}: ${mapTypeForInkStorage(prop.rustType)}`
      )
      .join(",\n");

    if (fields.trim()) {
      structures.push(`    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct ${concept.name} {
${fields}
    }`);
    }
  }

  // Generate participant structures
  for (const participant of contractTypes.participants) {
    if (generatedTypes.has(participant.name)) continue;
    generatedTypes.add(participant.name);

    const fields = participant.properties
      .filter(
        (prop) =>
          !["$class", "$timestamp", "partyId", "$identifier"].includes(
            prop.name
          )
      )
      .map(
        (prop) =>
          `        pub ${prop.rustName}: ${mapTypeForInkStorage(prop.rustType)}`
      )
      .join(",\n");

    structures.push(`    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct ${participant.name} {
        pub party_id: String${fields ? ",\n" + fields : ""}
    }`);
  }

  return structures.join("\n\n");
}

/**
 * Map complex types to simple ink!-compatible types
 * @param {string} rustType - Original Rust type
 * @returns {string} ink!-compatible type
 */
function mapTypeForInkStorage(rustType) {
  // Map complex types to simple types for ink! storage
  if (rustType.includes("MonetaryAmount")) {
    return "u128"; // Represent monetary amounts as u128 (smallest currency unit)
  }
  if (rustType.includes("Period") || rustType.includes("Duration")) {
    return "u64"; // Represent time periods as seconds (u64)
  }
  if (
    rustType.includes("CurrencyCode") ||
    rustType.includes("DigitalCurrencyCode")
  ) {
    return "String"; // Currency codes as strings
  }
  if (rustType.includes("TemporalUnit") || rustType.includes("PeriodUnit")) {
    return "String"; // Time units as strings
  }
  return rustType;
}

/**
 * Generate ink! contract implementation
 * @param {Object} contractTypes - Contract type information
 * @param {string} contractName - Name of the contract
 * @returns {string} Generated contract implementation
 */
function generateContractImplementation(contractTypes, contractName) {
  const templateModel = contractTypes.templateModels[0];

  // Generate constructor parameters
  const constructorParams = templateModel
    ? templateModel.properties
        .filter(
          (prop) =>
            !["$class", "$timestamp", "clauseId", "$identifier"].includes(
              prop.name
            )
        )
        .map(
          (prop) => `${prop.rustName}: ${mapTypeForInkStorage(prop.rustType)}`
        )
        .join(",\n            ")
    : "";

  // Generate constructor initialization
  const constructorInit = templateModel
    ? templateModel.properties
        .filter(
          (prop) =>
            !["$class", "$timestamp", "clauseId", "$identifier"].includes(
              prop.name
            )
        )
        .map((prop) => `            ${prop.rustName}`)
        .join(",\n")
    : "";

  let implementation = `    impl ${contractName} {
        #[ink(constructor)]
        pub fn new(${constructorParams}) -> Self {
            let caller = Self::env().caller();
            
            Self::env().emit_event(ContractCreated {
                owner: caller,
            });

            Self {
                owner: caller,
                paused: false,
${constructorInit}
            }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(${
              templateModel
                ? templateModel.properties
                    .filter(
                      (prop) =>
                        ![
                          "$class",
                          "$timestamp",
                          "clauseId",
                          "$identifier",
                        ].includes(prop.name)
                    )
                    .map((prop) =>
                      generateDefaultValue(mapTypeForInkStorage(prop.rustType))
                    )
                    .join(", ")
                : ""
            })
        }

        #[ink(message)]
        pub fn get_owner(&self) -> AccountId {
            self.owner
        }

        #[ink(message)]
        pub fn is_paused(&self) -> bool {
            self.paused
        }

        #[ink(message)]
        pub fn pause(&mut self) -> Result<()> {
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            self.paused = true;
            self.env().emit_event(ContractPaused { by: caller });
            Ok(())
        }

        #[ink(message)]
        pub fn unpause(&mut self) -> Result<()> {
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            self.paused = false;
            self.env().emit_event(ContractUnpaused { by: caller });
            Ok(())
        }`;

  // Generate request processing methods
  if (contractTypes.requests.length > 0 && contractTypes.responses.length > 0) {
    const request = contractTypes.requests[0];
    const response = contractTypes.responses[0];

    implementation += `

        #[ink(message)]
        pub fn process_request(&mut self, request: ${request.name}) -> Result<${
      response.name
    }> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            // Generate a simple request ID
            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(${request.name}Submitted {
                submitter: self.env().caller(),
                request_id,
            });

            // Process the request logic here
            let response = self.execute_contract_logic(request)?;
            
            self.env().emit_event(${response.name}Generated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        fn execute_contract_logic(&self, _request: ${request.name}) -> Result<${
      response.name
    }> {
            // Implement your contract logic here
            // This is a placeholder implementation
            Ok(${response.name} {
                ${response.properties
                  .filter(
                    (prop) => !["$class", "$timestamp"].includes(prop.name)
                  )
                  .map(
                    (prop) =>
                      `${prop.rustName}: ${generateDefaultValue(
                        mapTypeForInkStorage(prop.rustType)
                      )}`
                  )
                  .join(",\n                ")}
            })
        }`;
  }

  // Generate getter methods for template model properties
  if (templateModel) {
    for (const prop of templateModel.properties.filter(
      (p) =>
        !["$class", "$timestamp", "clauseId", "$identifier"].includes(p.name)
    )) {
      implementation += `

        #[ink(message)]
        pub fn get_${prop.rustName}(&self) -> ${mapTypeForInkStorage(
        prop.rustType
      )} {
            self.${prop.rustName}.clone()
        }`;
    }
  }

  implementation += `
    }`;

  return implementation;
}

/**
 * Generate default value for a Rust type
 * @param {string} rustType - Rust type
 * @returns {string} Default value
 */
function generateDefaultValue(rustType) {
  if (rustType.startsWith("Option<")) {
    return "None";
  } else if (rustType.startsWith("Vec<")) {
    return "Vec::new()";
  } else if (rustType === "String") {
    return "String::new()";
  } else if (rustType === "bool") {
    return "false";
  } else if (rustType.includes("u") || rustType.includes("i")) {
    return "0";
  } else {
    return "Default::default()";
  }
}

/**
 * Create Cargo.toml for ink! smart contract
 * @param {string} outputPath - Path where to create the Cargo.toml
 * @param {string} projectName - Name of the ink! project
 */
function createInkCargoToml(
  outputPath,
  projectName = "concerto-smart-contract"
) {
  const cargoToml = `[package]
name = "${projectName}"
version = "0.1.0"
authors = ["[your_name] <[your_email]>"]
edition = "2021"

[dependencies]
ink = { version = "5.1.1", default-features = false }
scale = { package = "parity-scale-codec", version = "3", default-features = false, features = ["derive"] }
scale-info = { version = "2.6", default-features = false, features = ["derive"], optional = true }

[dev-dependencies]
ink_e2e = { version = "5.1.1" }

[lib]
path = "src/lib.rs"

[features]
default = ["std"]
std = [
    "ink/std",
    "scale/std",
    "scale-info/std",
]
ink-as-dependency = []
e2e-tests = []

[profile.release]
overflow-checks = false

[profile.dev]
overflow-checks = false
`;

  const cargoPath = path.join(outputPath, "Cargo.toml");
  fs.writeFileSync(cargoPath, cargoToml);
  console.log(`Created ink! Cargo.toml at: ${cargoPath}\n`);
}

/**
 * Create the main lib.rs file for the ink! smart contract
 * @param {string} srcDir - Source directory path
 * @param {Object} contractTypes - Contract type information
 * @param {string} contractName - Name of the contract
 */
function createInkLibRs(
  srcDir,
  contractTypes,
  contractName = "ConcertoContract"
) {
  const dataStructures = generateDataStructures(contractTypes);
  const contractStorage = generateContractStorage(contractTypes, contractName);
  const contractEvents = generateContractEvents(contractTypes);
  const contractImpl = generateContractImplementation(
    contractTypes,
    contractName
  );

  const libRsContent = `#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod ${contractName.toLowerCase().replace(/[^a-z0-9_]/g, "_")} {
    use ink::prelude::string::String;
    use ink::prelude::vec::Vec;

    // Error types
    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum ContractError {
        Unauthorized,
        ContractPaused,
        InvalidInput,
        ProcessingFailed,
    }

    pub type Result<T> = core::result::Result<T, ContractError>;

${dataStructures}

${contractStorage}

${contractEvents}

${contractImpl}

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn default_works() {
            let contract = ${contractName}::default();
            assert_eq!(contract.is_paused(), false);
        }

        #[ink::test]
        fn pause_works() {
            let mut contract = ${contractName}::default();
            assert_eq!(contract.pause(), Ok(()));
            assert_eq!(contract.is_paused(), true);
        }

        #[ink::test]
        fn unpause_works() {
            let mut contract = ${contractName}::default();
            assert_eq!(contract.pause(), Ok(()));
            assert_eq!(contract.unpause(), Ok(()));
            assert_eq!(contract.is_paused(), false);
        }
    }
}
`;

  const libRsPath = path.join(srcDir, "lib.rs");
  fs.writeFileSync(libRsPath, libRsContent);
  console.log(`Created ink! lib.rs at: ${libRsPath}\n`);
}

/**
 * Create README.md for the ink! smart contract project
 * @param {string} projectDir - Project directory path
 * @param {string} contractName - Name of the contract
 * @param {Object} contractTypes - Contract type information
 */
function createInkReadme(projectDir, contractName, contractTypes) {
  const templateModel = contractTypes.templateModels[0];
  const requestType = contractTypes.requests[0];
  const responseType = contractTypes.responses[0];

  const readmeContent = `# ${contractName} - ink! Smart Contract

This ink! smart contract was generated from Concerto models and implements a blockchain-based legal contract.

## Overview

${
  templateModel
    ? `This contract implements the **${
        templateModel.name
      }** template model with the following properties:

${templateModel.properties
  .filter(
    (prop) =>
      !["$class", "$timestamp", "clauseId", "$identifier"].includes(prop.name)
  )
  .map((prop) => `- **${prop.name}**: ${prop.type}`)
  .join("\n")}
`
    : ""
}

## Contract Features

- **Pausable**: Contract can be paused/unpaused by the owner
- **Access Control**: Owner-based permissions
- **Event Emission**: All important actions emit events
${
  requestType
    ? `- **Request Processing**: Handles ${requestType.name} requests`
    : ""
}
${
  responseType
    ? `- **Response Generation**: Generates ${responseType.name} responses`
    : ""
}

## Building and Testing

### Prerequisites

1. Install Rust and Cargo
2. Install ink! CLI:
   \`\`\`bash
   cargo install cargo-contract --force
   \`\`\`

### Build

\`\`\`bash
cargo contract build
\`\`\`

### Test

\`\`\`bash
cargo test
\`\`\`

### Deploy

1. Start a local Substrate node with contracts pallet
2. Deploy the contract:
   \`\`\`bash
   cargo contract upload --suri //Alice
   cargo contract instantiate --suri //Alice --constructor new
   \`\`\`

## Contract API

### Messages

- \`get_owner()\`: Returns the contract owner
- \`is_paused()\`: Returns whether the contract is paused
- \`pause()\`: Pause the contract (owner only)
- \`unpause()\`: Unpause the contract (owner only)
${
  requestType
    ? `- \`process_request(request: ${requestType.name})\`: Process a contract request`
    : ""
}
${
  templateModel
    ? templateModel.properties
        .filter(
          (prop) =>
            !["$class", "$timestamp", "clauseId", "$identifier"].includes(
              prop.name
            )
        )
        .map((prop) => `- \`get_${prop.rustName}()\`: Get ${prop.name}`)
        .join("\n")
    : ""
}

### Events

- \`ContractCreated\`: Emitted when contract is created
- \`ContractPaused\`: Emitted when contract is paused
- \`ContractUnpaused\`: Emitted when contract is unpaused
${
  requestType
    ? `- \`${requestType.name}Submitted\`: Emitted when a request is submitted`
    : ""
}
${
  responseType
    ? `- \`${responseType.name}Generated\`: Emitted when a response is generated`
    : ""
}

## Generated from Concerto Models

This contract was automatically generated from the following Concerto model files:
${contractTypes.templateModels
  .map((tm) => `- ${tm.fullyQualifiedName}`)
  .join("\n")}

## License

This contract is licensed under the Apache License 2.0.
`;

  const readmePath = path.join(projectDir, "README.md");
  fs.writeFileSync(readmePath, readmeContent);
  console.log(`Created README.md at: ${readmePath}\n`);
}

/**
 * Generate ink! smart contract from Concerto models
 * @param {string} archivesDir - Directory containing template archives
 * @param {string} outputDir - Directory to output generated code
 */
async function generateInkContract(archivesDir, outputDir) {
  try {
    console.log("🦑 Starting ink! smart contract generation...\n");
    console.log(`📁 Archives directory: ${archivesDir}`);
    console.log(`📤 Output directory: ${outputDir}`);
    console.log("\n");

    // Load model files
    const modelFiles = loadModelFiles(archivesDir);

    if (modelFiles.length === 0) {
      console.log("❌ No model files found. Exiting.");
      return;
    }
    console.log("\n");

    // Create ModelManager and load models
    const modelManager = new ModelManager({
      enableMapType: false,
      strict: false,
    });

    // Process model contents to handle versioned namespace imports
    const processedModelFiles = modelFiles.map((modelFile) => {
      let processedContent = modelFile.content;

      // Handle specific problematic imports first - keep the original namespace
      processedContent = processedContent.replace(
        /import\s+org\.accordproject\.money\.MonetaryAmount\s+from\s+https:\/\/models\.accordproject\.org\/money@([^\/]+)\.cto/g,
        "import org.accordproject.money.MonetaryAmount"
      );

      // Fallback: Remove any remaining external import URLs
      processedContent = processedContent.replace(
        /import\s+([^{}\s]+(?:\{[^}]+\})?)\s+from\s+https:\/\/[^\s]+/g,
        "import $1"
      );

      return {
        ...modelFile,
        content: processedContent,
      };
    });

    // First, try to load all models at once to handle dependencies properly
    try {
      const modelContents = processedModelFiles.map((mf) => mf.content);
      const modelFileNames = processedModelFiles.map((mf) => mf.filename);

      console.log(
        "📄 Loading all models together to resolve dependencies...\n"
      );
      await modelManager.addCTOModels(modelContents, modelFileNames);
      console.log(
        "✅ Successfully loaded all models with dependencies resolved"
      );
    } catch (error) {
      console.log(
        "⚠️  Batch loading failed, trying individual loading with dependency order...\n"
      );

      // Sort models to load base dependencies first
      const sortedModelFiles = [...processedModelFiles].sort((a, b) => {
        // Load order: money -> contract -> runtime -> party -> time -> others -> obligation (last)
        const aIsMoney = a.filename.includes("money");
        const bIsMoney = b.filename.includes("money");
        const aIsContract = a.filename.includes("contract");
        const bIsContract = b.filename.includes("contract");
        const aIsRuntime = a.filename.includes("runtime");
        const bIsRuntime = b.filename.includes("runtime");
        const aIsParty = a.filename.includes("party");
        const bIsParty = b.filename.includes("party");
        const aIsTime = a.filename.includes("time");
        const bIsTime = b.filename.includes("time");
        const aIsObligation = a.filename.includes("obligation");
        const bIsObligation = b.filename.includes("obligation");

        // Money models first (they're dependencies)
        if (aIsMoney && !bIsMoney) return -1;
        if (!aIsMoney && bIsMoney) return 1;

        // Contract models second
        if (aIsContract && !bIsContract) return -1;
        if (!aIsContract && bIsContract) return 1;

        // Runtime models third
        if (aIsRuntime && !bIsRuntime) return -1;
        if (!aIsRuntime && bIsRuntime) return 1;

        // Party models fourth
        if (aIsParty && !bIsParty) return -1;
        if (!aIsParty && bIsParty) return 1;

        // Time models fifth
        if (aIsTime && !bIsTime) return -1;
        if (!aIsTime && bIsTime) return 1;

        // Obligation models last (they depend on everything else)
        if (aIsObligation && !bIsObligation) return 1;
        if (!aIsObligation && bIsObligation) return -1;

        return a.filename.localeCompare(b.filename);
      });

      for (const modelFile of sortedModelFiles) {
        try {
          console.log(
            `📄 Loading model: ${modelFile.filename} from ${modelFile.archiveName}`
          );
          await modelManager.addCTOModel(modelFile.content, modelFile.filename);
        } catch (error) {
          console.error(
            `❌ Error loading model ${modelFile.filename}:\n`,
            error.message
          );
          continue;
        }
      }
    }

    // Extract contract types
    const contractTypes = extractContractTypes(modelManager);

    console.log(
      `\n🔍 Found ${contractTypes.templateModels.length} template models`
    );
    console.log(`🔍 Found ${contractTypes.requests.length} request types`);
    console.log(`🔍 Found ${contractTypes.responses.length} response types`);
    console.log(`🔍 Found ${contractTypes.concepts.length} concept types`);
    console.log(
      `🔍 Found ${contractTypes.participants.length} participant types\n`
    );

    if (contractTypes.templateModels.length === 0) {
      console.log("⚠️  No template models found. Creating a basic contract.");
    }

    // Determine contract name
    const contractName =
      contractTypes.templateModels.length > 0
        ? contractTypes.templateModels[0].name.replace(/Clause$/, "Contract")
        : "ConcertoContract";

    // Create output directory structure
    ensureDirectoryExists(outputDir);
    const srcDir = path.join(outputDir, "src");
    ensureDirectoryExists(srcDir);

    // Generate ink! contract files
    const packageName = contractName
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, ""); // Remove leading dash if present

    createInkCargoToml(outputDir, packageName);
    createInkLibRs(srcDir, contractTypes, contractName);
    createInkReadme(outputDir, contractName, contractTypes);

    console.log("✅ ink! smart contract generation completed successfully!\n");
    console.log(`📁 Generated contract in: ${outputDir}`);
    console.log("\n🚀 Next steps:");
    console.log("1. cd " + outputDir);
    console.log("2. cargo contract build");
    console.log("3. cargo test");
    console.log("4. Deploy to a Substrate blockchain with contracts pallet\n");
  } catch (error) {
    console.error("❌ Error during ink! contract generation:", error);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let archivesDir, outputDir;

  if (args.length === 0) {
    // Default behavior - consistent with generate.js
    archivesDir = path.join(__dirname, "..", "archives");
    outputDir = path.join(__dirname, "..", "output");
  } else if (args.length === 1) {
    // Archives dir specified, use default output structure
    archivesDir = path.resolve(args[0]);
    outputDir = path.join(__dirname, "..", "output");
  } else if (args.length === 2) {
    // Both directories specified (backwards compatibility)
    archivesDir = path.resolve(args[0]);
    outputDir = path.resolve(args[1]);
  } else {
    console.log("Usage: node generate-ink.js [archives-dir] [output-dir]");
    console.log("Examples:");
    console.log(
      "  node generate-ink.js                    # Use default directories"
    );
    console.log(
      "  node generate-ink.js archives           # Custom archives, default output"
    );
    console.log(
      "  node generate-ink.js archives my-output # Custom directories"
    );
    process.exit(1);
  }

  await generateInkContract(archivesDir, outputDir);
}

// Export functions for testing
module.exports = {
  generateInkContract,
  extractContractTypes,
  loadModelFiles,
  toInkType,
  toRustFieldName,
  generateContractStorage,
  generateContractEvents,
  generateDataStructures,
  generateContractImplementation,
  createInkCargoToml,
  createInkLibRs,
  createInkReadme,
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}