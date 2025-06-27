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
 * Load all .cto files from a specific template archive
 * @param {string} archivesDir - Directory containing template archives
 * @param {string} templateName - Specific template name to load
 * @returns {Array<{filename: string, content: string, archiveName: string}>} Array of model files
 */
function loadModelFiles(archivesDir, templateName) {
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
  const availableTemplates = archiveEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // Check if the requested template exists
  if (!availableTemplates.includes(templateName)) {
    console.error(
      `❌ Template '${templateName}' not found in archives directory.`
    );
    console.log(
      `Available templates: ${availableTemplates.join(", ") || "none"}`
    );
    return modelFiles;
  }

  console.log(`🎯 Loading template: ${templateName}`);

  // Process the specified template archive
  const archivePath = path.join(archivesDir, templateName);
  const modelDir = path.join(archivePath, "model");

  if (!fs.existsSync(modelDir)) {
    console.error(`❌ No model directory found in template '${templateName}'`);
    return modelFiles;
  }

  console.log(`Processing template archive: ${templateName}`);

  // Load all .cto files from the model directory
  const files = fs.readdirSync(modelDir);

  for (const file of files) {
    if (file.endsWith(".cto")) {
      const filePath = path.join(modelDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      modelFiles.push({
        filename: file,
        content: content,
        archiveName: templateName,
      });
      console.log(`  Loaded model file: ${file} from ${templateName}`);
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
    enums: [],
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
        console.log(
          `  📝 Found concept: ${typeName} in namespace: ${namespace}`
        );
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

      // Check for enums - try multiple detection methods
      const declarationType = declaration.constructor
        ? declaration.constructor.name
        : "unknown";

      if (
        (declaration.isEnum && declaration.isEnum()) ||
        declarationType.includes("EnumDeclaration") ||
        (declaration.getType && declaration.getType() === "Enum")
      ) {
        console.log(`  🔢 Found enum: ${typeName} in namespace: ${namespace}`);
        contractTypes.enums.push({
          name: typeName,
          fullyQualifiedName,
          namespace,
          declaration,
          values: extractEnumValues(declaration),
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
 * Extract enum values from an enum declaration
 * @param {Object} declaration - Concerto enum declaration
 * @returns {Array} Array of enum value strings
 */
function extractEnumValues(declaration) {
  const values = [];

  if (declaration.getOwnProperties) {
    const ownProperties = declaration.getOwnProperties();
    for (const property of ownProperties) {
      values.push(property.getName());
    }
  }

  return values;
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
      // But add prefix for types that might conflict with Substrate built-ins
      if (concertoType === "Address") {
        rustType = "PropertyAddress";
      } else {
        rustType = concertoType;
      }
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

  // Add draft functionality storage
  storageFields.push("        next_request_id: u64");
  storageFields.push(
    "        draft_requests: ink::storage::Mapping<u64, DraftRequest>"
  );
  storageFields.push(
    "        user_drafts: ink::storage::Mapping<AccountId, Vec<u64>>"
  );

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

  // Generate concept structures
  for (const concept of contractTypes.concepts) {
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
      const structName =
        concept.name === "Address" ? "PropertyAddress" : concept.name;
      structures.push(`    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct ${structName} {
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
 * Generate enum data structures
 * @param {Object} contractTypes - Contract type information
 * @returns {string} Generated enum structures
 */
function generateEnumStructures(contractTypes) {
  let enumStructures = [];

  // Generate business enums (filter out Concerto metamodel enums)
  const businessEnums = contractTypes.enums.filter(
    (enumDef) =>
      !enumDef.namespace.startsWith("concerto") &&
      !enumDef.namespace.includes("concerto.decorator")
  );

  for (const enumDef of businessEnums) {
    const enumVariants = enumDef.values
      .map((value) => `        ${value}`)
      .join(",\n");

    enumStructures.push(`    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum ${enumDef.name} {
        #[default]
        ${enumDef.values[0]},
${enumDef.values
  .slice(1)
  .map((value) => `        ${value}`)
  .join(",\n")}
    }`);
  }

  return enumStructures.join("\n\n");
}

/**
 * Generate draft functionality data structures
 * @returns {string} Draft-related data structures
 */
function generateDraftDataStructures() {
  return `    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct DraftRequest {
        pub requester: AccountId,
        pub template_data: String,
        pub status: DraftStatus,
        pub ipfs_hash: Option<String>,
        pub error_message: Option<String>,
        pub created_at: u64,
        pub updated_at: u64,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum DraftStatus {
        #[default]
        Pending,
        Processing,
        Ready,
        Failed,
    }`;
}

/**
 * Generate draft functionality events
 * @returns {string} Draft-related events
 */
function generateDraftEvents() {
  return `    #[ink(event)]
    pub struct DraftRequested {
        #[ink(topic)]
        pub requester: AccountId,
        pub request_id: u64,
        pub template_data: String,
        pub timestamp: u64,
    }

    #[ink(event)]
    pub struct DraftReady {
        #[ink(topic)]
        pub requester: AccountId,
        pub request_id: u64,
        pub ipfs_hash: String,
        pub timestamp: u64,
    }

    #[ink(event)]
    pub struct DraftError {
        #[ink(topic)]
        pub requester: AccountId,
        pub request_id: u64,
        pub error_message: String,
        pub timestamp: u64,
    }`;
}

/**
 * Generate draft functionality implementation
 * @returns {string} Draft-related contract methods
 */
function generateDraftImplementation() {
  return `        //
        // === DRAFT REQUEST FUNCTIONALITY ===
        //
        #[ink(message)]
        pub fn request_draft(&mut self, template_data: String) -> Result<u64> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            let request_id = self.next_request_id;
            let timestamp = self.env().block_timestamp();

            let draft_request = DraftRequest {
                requester: caller,
                template_data: template_data.clone(),
                status: DraftStatus::Pending,
                ipfs_hash: None,
                error_message: None,
                created_at: timestamp,
                updated_at: timestamp,
            };

            // Store the draft request
            self.draft_requests.insert(request_id, &draft_request);

            // Add to user's draft list
            let mut user_drafts = self.user_drafts.get(caller).unwrap_or_default();
            user_drafts.push(request_id);
            self.user_drafts.insert(caller, &user_drafts);

            // Increment request ID for next request (with overflow protection)
            self.next_request_id = self.next_request_id.saturating_add(1);

            // Emit event for off-chain service to pick up
            self.env().emit_event(DraftRequested {
                requester: caller,
                request_id,
                template_data,
                timestamp,
            });

            Ok(request_id)
        }

        #[ink(message)]
        pub fn submit_draft_result(&mut self, request_id: u64, ipfs_hash: String) -> Result<()> {
            // Only owner (or authorized service) can submit results
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            let mut draft_request = self
                .draft_requests
                .get(request_id)
                .ok_or(ContractError::InvalidInput)?;

            draft_request.status = DraftStatus::Ready;
            draft_request.ipfs_hash = Some(ipfs_hash.clone());
            draft_request.updated_at = self.env().block_timestamp();

            self.draft_requests.insert(request_id, &draft_request);

            self.env().emit_event(DraftReady {
                requester: draft_request.requester,
                request_id,
                ipfs_hash,
                timestamp: draft_request.updated_at,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn submit_draft_error(&mut self, request_id: u64, error_message: String) -> Result<()> {
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            let mut draft_request = self
                .draft_requests
                .get(request_id)
                .ok_or(ContractError::InvalidInput)?;

            draft_request.status = DraftStatus::Failed;
            draft_request.error_message = Some(error_message.clone());
            draft_request.updated_at = self.env().block_timestamp();

            self.draft_requests.insert(request_id, &draft_request);

            self.env().emit_event(DraftError {
                requester: draft_request.requester,
                request_id,
                error_message,
                timestamp: draft_request.updated_at,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn get_draft_request(&self, request_id: u64) -> Option<DraftRequest> {
            self.draft_requests.get(request_id)
        }

        #[ink(message)]
        pub fn get_user_drafts(&self, user: AccountId) -> Vec<u64> {
            self.user_drafts.get(user).unwrap_or_default()
        }

        #[ink(message)]
        pub fn get_my_drafts(&self) -> Vec<u64> {
            let caller = self.env().caller();
            self.user_drafts.get(caller).unwrap_or_default()
        }`;
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
  if (rustType.includes("TemporalUnit") || rustType.includes("PeriodUnit")) {
    return "String"; // Time units as strings
  }
  // Handle Address type collision with Substrate built-ins
  if (rustType === "Address") {
    return "PropertyAddress";
  }
  if (rustType.includes("Vec<Address>")) {
    return rustType.replace("Address", "PropertyAddress");
  }
  if (rustType.includes("Option<Address>")) {
    return rustType.replace("Address", "PropertyAddress");
  }
  // Keep enum types as-is (including CurrencyCode, ContractStatus, etc.)
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
                next_request_id: 1,
                draft_requests: ink::storage::Mapping::default(),
                user_drafts: ink::storage::Mapping::default(),
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
                      generateDefaultValue(
                        mapTypeForInkStorage(prop.rustType),
                        contractTypes
                      )
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

        //
        // === CONTRACT LOGIC FUNCTIONALITY ===
        //
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
                        mapTypeForInkStorage(prop.rustType),
                        contractTypes
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
            ${generateGetterReturn(
              mapTypeForInkStorage(prop.rustType),
              prop.rustName
            )}
        }`;
    }
  }

  // Add draft functionality
  implementation += `

${generateDraftImplementation()}`;

  implementation += `
    }`;

  return implementation;
}

/**
 * Check if a Rust type implements Copy trait (doesn't need .clone())
 * @param {string} rustType - Rust type to check
 * @returns {boolean} True if type implements Copy
 */
function isCopyType(rustType) {
  // Primitive copy types
  const copyTypes = [
    "bool",
    "char",
    "i8",
    "i16",
    "i32",
    "i64",
    "i128",
    "isize",
    "u8",
    "u16",
    "u32",
    "u64",
    "u128",
    "usize",
    "f32",
    "f64",
  ];

  return copyTypes.includes(rustType) || /^[ui]\d+$/.test(rustType);
}

/**
 * Generate appropriate return expression for getter methods
 * @param {string} rustType - Rust type
 * @param {string} fieldName - Field name
 * @returns {string} Return expression
 */
function generateGetterReturn(rustType, fieldName) {
  if (isCopyType(rustType)) {
    return `self.${fieldName}`;
  } else {
    return `self.${fieldName}.clone()`;
  }
}

/**
 * Generate default value for a Rust type
 * @param {string} rustType - Rust type
 * @param {Object} contractTypes - Contract types for enum handling
 * @returns {string} Default value
 */
function generateDefaultValue(rustType, contractTypes = null) {
  if (rustType.startsWith("Option<")) {
    return "None";
  } else if (rustType.startsWith("Vec<")) {
    return "Vec::new()";
  } else if (rustType === "String") {
    return "String::new()";
  } else if (rustType === "bool") {
    return "false";
  } else if (/^[ui]\d+$/.test(rustType)) {
    return "0";
  } else if (contractTypes && contractTypes.enums) {
    // Check if this is an enum type
    const enumDef = contractTypes.enums.find((e) => e.name === rustType);
    if (enumDef && enumDef.values.length > 0) {
      return `${rustType}::${enumDef.values[0]}`;
    }
  }
  // For other custom types (structs, etc.), use Default::default()
  return "Default::default()";
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
  const enumStructures = generateEnumStructures(contractTypes);
  const draftDataStructures = generateDraftDataStructures();
  const contractStorage = generateContractStorage(contractTypes, contractName);
  const contractEvents = generateContractEvents(contractTypes);
  const draftEvents = generateDraftEvents();
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

${enumStructures}

${draftDataStructures}

${contractStorage}

${contractEvents}

${draftEvents}

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
async function generateInkContract(archivesDir, outputDir, templateName) {
  try {
    console.log("🦑 Starting ink! smart contract generation...\n");
    console.log(`📁 Archives directory: ${archivesDir}`);
    console.log(`📤 Output directory: ${outputDir}`);
    console.log("\n");

    // Load model files
    const modelFiles = loadModelFiles(archivesDir, templateName);

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
      `🔍 Found ${contractTypes.participants.length} participant types`
    );
    console.log(`🔍 Found ${contractTypes.enums.length} enum types`);

    // Debug enum details
    if (contractTypes.enums.length > 0) {
      console.log("📋 Enum details:");
      contractTypes.enums.forEach((enumDef) => {
        console.log(`  - ${enumDef.name}: [${enumDef.values.join(", ")}]`);
      });
    }
    console.log("");

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
 * Parse command line arguments
 * @param {Array} args - Command line arguments
 * @returns {Object} Parsed configuration
 */
function parseArguments(args) {
  const config = {
    archivesDir: path.join(__dirname, "..", "archives"),
    outputDir: path.join(__dirname, "..", "output"),
    templateName: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      config.help = true;
      return config;
    } else if (arg === "--template" || arg === "-t") {
      if (i + 1 < args.length) {
        config.templateName = args[i + 1];
        i++; // Skip next argument since we consumed it
      } else {
        throw new Error("--template requires a template name");
      }
    } else if (arg.startsWith("--template=")) {
      config.templateName = arg.split("=")[1];
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      // Positional arguments (backwards compatibility)
      if (
        !config.archivesDir ||
        config.archivesDir === path.join(__dirname, "..", "archives")
      ) {
        config.archivesDir = path.resolve(arg);
      } else if (
        !config.outputDir ||
        config.outputDir === path.join(__dirname, "..", "output")
      ) {
        config.outputDir = path.resolve(arg);
      } else {
        throw new Error("Too many positional arguments");
      }
    }
  }

  // Validate that template is specified
  if (!config.templateName) {
    throw new Error(
      "Template name is required. Use --template <name> to specify which template to generate."
    );
  }

  return config;
}

/**
 * Display help message
 */
function showHelp() {
  console.log(
    "Usage: node generate-ink.js --template <name> [archives-dir] [output-dir]"
  );
  console.log("");
  console.log("Required Options:");
  console.log(
    "  --template, -t <name>  Template name to generate smart contract from"
  );
  console.log("");
  console.log("Optional:");
  console.log("  --help, -h             Show this help message");
  console.log("");
  console.log("Examples:");
  console.log(
    "  node generate-ink.js --template real-estate-sale-uk                  # Generate real estate template"
  );
  console.log(
    "  node generate-ink.js -t real-estate-sale-uk archives                # Use custom archives directory"
  );
  console.log(
    "  node generate-ink.js -t late-delivery archives/ldp output/ldp       # Full custom paths"
  );
  console.log("");
  console.log("Template Selection:");
  console.log(
    "  Each run generates a smart contract for exactly one template archive."
  );
  console.log("  This ensures focused, predictable smart contract generation.");
  console.log("  To combine multiple templates, run the tool multiple times.");
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    const config = parseArguments(args);

    if (config.help) {
      showHelp();
      return;
    }

    await generateInkContract(
      config.archivesDir,
      config.outputDir,
      config.templateName
    );
  } catch (error) {
    if (
      error.message.includes("Unknown option") ||
      error.message.includes("requires") ||
      error.message.includes("Too many")
    ) {
      console.error(`❌ ${error.message}`);
      console.log("");
      showHelp();
      process.exit(1);
    } else {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  }
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
