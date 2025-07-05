#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod propertysale {
    use ink::prelude::string::{String, ToString};
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

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct AmendContractRequest {
        pub sellers: Option<Vec<Party>>,
        pub buyers: Option<Vec<Party>>,
        pub property_address: Option<PropertyAddress>,
        pub purchase_price: Option<Money>,
        pub deposit: Option<Money>,
        pub balance: Option<Money>,
        pub agreement_date: Option<u64>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ChangeStatusRequest {
        pub new_status: ContractStatus,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ManageOfferRequest {
        pub action: OfferAction,
        pub offer: Option<Money>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct SignContractRequest {}

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct AmendContractResponse {
        pub success: bool,
        pub error_message: Option<String>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ChangeStatusResponse {
        pub success: bool,
        pub error_message: Option<String>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ManageOfferResponse {
        pub success: bool,
        pub error_message: Option<String>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct SignContractResponse {
        pub success: bool,
        pub error_message: Option<String>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct DotNetNamespace {
        pub namespace: String,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct Money {
        pub amount: u128,
        pub currency_code: CurrencyCode,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct PropertyAddress {
        pub address_line1: String,
        pub address_line2: String,
        pub city: String,
        pub post_code: String,
        pub county: String,
        pub country: Country,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct Party {
        pub party_id: String,
        pub full_name: String,
        pub email: String,
        pub mobile: String,
        pub address: PropertyAddress,
        pub wallet_address: String,
        pub signed_at: Option<u64>,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum ContractStatus {
        #[default]
        Draft,
        Signing,
        Signed,
        Superseded,
        Cancelled,
        Paused,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum CurrencyCode {
        #[default]
        EUR,
        GBP,
        USD,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum Country {
        #[default]
        UK,
        USA,
        AUSTRALIA,
        FRANCE,
        GERMANY,
        ITALY,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum OfferAction {
        #[default]
        Submit,
        Accept,
        Reject,
        Cancel,
    }


    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct AuditLogEntry {
        pub caller: AccountId,
        pub timestamp: u64,
        pub function_name: String,
        pub request_id: u64,
    }

    #[ink(storage)]
    pub struct PropertySale {
        owner: AccountId,
        paused: bool,
        audit_log: ink::storage::Mapping<u64, AuditLogEntry>,
        audit_log_count: u64,
        sellers: Vec<Party>,
        buyers: Vec<Party>,
        property_address: PropertyAddress,
        purchase_price: Option<Money>,
        deposit: Option<Money>,
        balance: Option<Money>,
        agreement_date: Option<u64>,
        status: ContractStatus,
    }

    #[ink(event)]
    pub struct ContractCreated {
        #[ink(topic)]
        pub owner: AccountId,
    }

    #[ink(event)]
    pub struct ContractPaused {
        #[ink(topic)]
        pub by: AccountId,
    }

    #[ink(event)]
    pub struct ContractUnpaused {
        #[ink(topic)]
        pub by: AccountId,
    }

    #[ink(event)]
    pub struct AmendContractRequestSubmitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }

    #[ink(event)]
    pub struct ChangeStatusRequestSubmitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }

    #[ink(event)]
    pub struct ManageOfferRequestSubmitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }

    #[ink(event)]
    pub struct SignContractRequestSubmitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }

    #[ink(event)]
    pub struct AmendContractResponseGenerated {
        #[ink(topic)]
        pub request_id: u64,
        pub success: bool,
    }

    #[ink(event)]
    pub struct ChangeStatusResponseGenerated {
        #[ink(topic)]
        pub request_id: u64,
        pub success: bool,
    }

    #[ink(event)]
    pub struct ManageOfferResponseGenerated {
        #[ink(topic)]
        pub request_id: u64,
        pub success: bool,
    }

    #[ink(event)]
    pub struct SignContractResponseGenerated {
        #[ink(topic)]
        pub request_id: u64,
        pub success: bool,
    }


    #[ink(event)]
    pub struct FunctionCalled {
        #[ink(topic)]
        pub caller: AccountId,
        #[ink(topic)]
        pub function_name: String,
        pub request_id: u64,
        pub timestamp: u64,
    }

    #[ink(event)]
    pub struct ContractDataChanged {
        #[ink(topic)]
        pub field_name: String,
        #[ink(topic)]
        pub changed_by: AccountId,
        pub old_value: String,
        pub new_value: String,
        pub block_number: u64,
        pub timestamp: u64,
    }

    impl PropertySale {
        #[ink(constructor)]
        pub fn new(
            sellers: Vec<Party>,
            buyers: Vec<Party>,
            property_address: PropertyAddress,
            purchase_price: Option<Money>,
            deposit: Option<Money>,
            balance: Option<Money>,
            agreement_date: Option<u64>,
            status: ContractStatus,
        ) -> Self {
            let caller = Self::env().caller();
            
            Self::env().emit_event(ContractCreated { owner: caller });

            Self {
                owner: caller,
                paused: false,
                audit_log: ink::storage::Mapping::default(),
                audit_log_count: 0,
                sellers,
                buyers,
                property_address,
                purchase_price,
                deposit,
                balance,
                agreement_date,
                status,
            }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(
                Vec::new(),
                Vec::new(),
                Default::default(),
                None,
                None,
                None,
                None,
                ContractStatus::Draft,
            )
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
        }

        #[ink(message)]
        pub fn amend_contract(
            &mut self,
            _request: AmendContractRequest,
        ) -> Result<AmendContractResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(AmendContractRequestSubmitted {
                submitter: self.env().caller(),
                request_id,
            });

            // === BEGIN CUSTOM LOGIC ===
            // TODO: Implement your amend contract logic here
            let response = AmendContractResponse {
                success: false,
                error_message: None,
            };
            // === END CUSTOM LOGIC ===
            
            // Log function call for audit trail
            self.log_function_call("amend_contract", request_id);
            
            self.env().emit_event(AmendContractResponseGenerated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        #[ink(message)]
        pub fn change_status(
            &mut self,
            _request: ChangeStatusRequest,
        ) -> Result<ChangeStatusResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(ChangeStatusRequestSubmitted {
                submitter: self.env().caller(),
                request_id,
            });

            // === BEGIN CUSTOM LOGIC ===
            // TODO: Implement your change status logic here
            let response = ChangeStatusResponse {
                success: false,
                error_message: None,
            };
            // === END CUSTOM LOGIC ===
            
            // Log function call for audit trail
            self.log_function_call("change_status", request_id);
            
            self.env().emit_event(ChangeStatusResponseGenerated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        #[ink(message)]
        pub fn manage_offer(
            &mut self,
            _request: ManageOfferRequest,
        ) -> Result<ManageOfferResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(ManageOfferRequestSubmitted {
                submitter: self.env().caller(),
                request_id,
            });

            // === BEGIN CUSTOM LOGIC ===
            // TODO: Implement your manage offer logic here
            let response = ManageOfferResponse {
                success: false,
                error_message: None,
            };
            // === END CUSTOM LOGIC ===
            
            // Log function call for audit trail
            self.log_function_call("manage_offer", request_id);
            
            self.env().emit_event(ManageOfferResponseGenerated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        #[ink(message)]
        pub fn sign_contract(
            &mut self,
            _request: SignContractRequest,
        ) -> Result<SignContractResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(SignContractRequestSubmitted {
                submitter: self.env().caller(),
                request_id,
            });

            // === BEGIN CUSTOM LOGIC ===
            // TODO: Implement your sign contract logic here
            let response = SignContractResponse {
                success: false,
                error_message: None,
            };
            // === END CUSTOM LOGIC ===
            
            // Log function call for audit trail
            self.log_function_call("sign_contract", request_id);
            
            self.env().emit_event(SignContractResponseGenerated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        #[ink(message)]
        pub fn get_sellers(&self) -> Vec<Party> {
            self.sellers.clone()
        }

        #[ink(message)]
        pub fn get_buyers(&self) -> Vec<Party> {
            self.buyers.clone()
        }

        #[ink(message)]
        pub fn get_property_address(&self) -> PropertyAddress {
            self.property_address.clone()
        }

        #[ink(message)]
        pub fn get_purchase_price(&self) -> Option<Money> {
            self.purchase_price.clone()
        }

        #[ink(message)]
        pub fn get_deposit(&self) -> Option<Money> {
            self.deposit.clone()
        }

        #[ink(message)]
        pub fn get_balance(&self) -> Option<Money> {
            self.balance.clone()
        }

        #[ink(message)]
        pub fn get_agreement_date(&self) -> Option<u64> {
            self.agreement_date
        }

        #[ink(message)]
        pub fn get_status(&self) -> ContractStatus {
            self.status.clone()
        }

        #[ink(message)]
        pub fn set_sellers(&mut self, new_value: Vec<Party>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            self.log_field_change("sellers", "party_info_list_updated", "party_info_list_modified");
            self.sellers = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_buyers(&mut self, new_value: Vec<Party>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            self.log_field_change("buyers", "party_info_list_updated", "party_info_list_modified");
            self.buyers = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_property_address(&mut self, new_value: PropertyAddress) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            self.log_field_change("property_address", "address_updated", "address_modified");
            self.property_address = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_purchase_price(&mut self, new_value: Option<Money>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            let old_value = if self.purchase_price.is_some() { "Some(value)" } else { "None" };
            let new_value_str = if new_value.is_some() { "Some(value)" } else { "None" };
            if old_value != new_value_str {
                self.log_field_change("purchase_price", old_value, new_value_str);
            }
            self.purchase_price = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_deposit(&mut self, new_value: Option<Money>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            let old_value = if self.deposit.is_some() { "Some(value)" } else { "None" };
            let new_value_str = if new_value.is_some() { "Some(value)" } else { "None" };
            if old_value != new_value_str {
                self.log_field_change("deposit", old_value, new_value_str);
            }
            self.deposit = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_balance(&mut self, new_value: Option<Money>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            let old_value = if self.balance.is_some() { "Some(value)" } else { "None" };
            let new_value_str = if new_value.is_some() { "Some(value)" } else { "None" };
            if old_value != new_value_str {
                self.log_field_change("balance", old_value, new_value_str);
            }
            self.balance = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_agreement_date(&mut self, new_value: Option<u64>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            let old_value = if self.agreement_date.is_some() { "Some(value)" } else { "None" };
            let new_value_str = if new_value.is_some() { "Some(value)" } else { "None" };
            if old_value != new_value_str {
                self.log_field_change("agreement_date", old_value, new_value_str);
            }
            self.agreement_date = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_status(&mut self, new_value: ContractStatus) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            self.log_field_change("status", "status_updated", "status_modified");
            self.status = new_value;
            Ok(())
        }


        // === SELLERS COLLECTION UTILITIES ===

        #[ink(message)]
        pub fn get_sellers_count(&self) -> u32 {
            #[allow(clippy::cast_possible_truncation)]
            {
                self.sellers.len() as u32
            }
        }
        // === BUYERS COLLECTION UTILITIES ===

        #[ink(message)]
        pub fn get_buyers_count(&self) -> u32 {
            #[allow(clippy::cast_possible_truncation)]
            {
                self.buyers.len() as u32
            }
        }


        // === AUDIT LOG FUNCTIONALITY ===
        
        /// Record a function call in the audit log
        fn log_function_call(&mut self, function_name: &str, request_id: u64) {
            let caller = self.env().caller();
            let timestamp = self.env().block_timestamp();
            
            let log_entry = AuditLogEntry {
                caller,
                timestamp,
                function_name: function_name.to_string(),
                request_id,
            };
            
            // Store with current count as index, then increment
            self.audit_log.insert(self.audit_log_count, &log_entry);
            self.audit_log_count = self.audit_log_count.saturating_add(1);
            
            self.env().emit_event(FunctionCalled {
                caller,
                function_name: function_name.to_string(),
                request_id,
                timestamp,
            });
        }

        /// Record a field change with before/after values
        fn log_field_change(&mut self, field_name: &str, old_value: &str, new_value: &str) {
            let caller = self.env().caller();
            let timestamp = self.env().block_timestamp();
            let block_number = self.env().block_number() as u64;
            
            self.env().emit_event(ContractDataChanged {
                field_name: field_name.to_string(),
                changed_by: caller,
                old_value: old_value.to_string(),
                new_value: new_value.to_string(),
                block_number,
                timestamp,
            });
        }



        #[ink(message)]
        pub fn get_audit_log_count(&self) -> u64 {
            self.audit_log_count
        }

        #[ink(message)]
        pub fn get_audit_log(&self, start: u64, limit: u64) -> Vec<AuditLogEntry> {
            let mut entries = Vec::new();
            let end = start.saturating_add(limit).min(self.audit_log_count);
            
            for i in start..end {
                if let Some(entry) = self.audit_log.get(i) {
                    entries.push(entry);
                }
            }
            
            entries
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn default_works() {
            let contract = PropertySale::default();
            assert_eq!(contract.is_paused(), false);
        }

        #[ink::test]
        fn pause_works() {
            let mut contract = PropertySale::default();
            assert_eq!(contract.pause(), Ok(()));
            assert_eq!(contract.is_paused(), true);
        }

        #[ink::test]
        fn unpause_works() {
            let mut contract = PropertySale::default();
            assert_eq!(contract.pause(), Ok(()));
            assert_eq!(contract.unpause(), Ok(()));
            assert_eq!(contract.is_paused(), false);
        }
    }
}
