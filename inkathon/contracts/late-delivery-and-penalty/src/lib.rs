#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod latedeliveryandpenalty {
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
    pub struct LateDeliveryAndPenaltyRequest {
        pub force_majeure: bool,
        pub agreed_delivery: u64,
        pub delivered_at: Option<u64>,
        pub goods_value: u128,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct LateDeliveryAndPenaltyResponse {
        pub penalty: u128,
        pub buyer_may_terminate: bool,
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
    pub struct Duration {
        pub amount: u128,
        pub unit: String,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct Period {
        pub amount: u128,
        pub unit: u64,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum Month {
        #[default]
        January,
        February,
        March,
        April,
        May,
        June,
        July,
        August,
        September,
        October,
        November,
        December,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum Day {
        #[default]
        Monday,
        Tuesday,
        Wednesday,
        Thursday,
        Friday,
        Saturday,
        Sunday,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum TemporalUnit {
        #[default]
        Seconds,
        Minutes,
        Hours,
        Days,
        Weeks,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum PeriodUnit {
        #[default]
        Days,
        Weeks,
        Months,
        Quarters,
        Years,
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
    pub struct LateDeliveryAndPenalty {
        owner: AccountId,
        paused: bool,
        audit_log: ink::storage::Mapping<u64, AuditLogEntry>,
        audit_log_count: u64,
        force_majeure: bool,
        penalty_duration: u64,
        penalty_percentage: u128,
        cap_percentage: u128,
        termination: u64,
        fractional_part: String,
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
    pub struct LateDeliveryAndPenaltyRequestSubmitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }

    #[ink(event)]
    pub struct LateDeliveryAndPenaltyResponseGenerated {
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

    impl LateDeliveryAndPenalty {
        #[ink(constructor)]
        pub fn new(
            force_majeure: bool,
            penalty_duration: u64,
            penalty_percentage: u128,
            cap_percentage: u128,
            termination: u64,
            fractional_part: String,
        ) -> Self {
            let caller = Self::env().caller();
            
            Self::env().emit_event(ContractCreated { owner: caller });

            Self {
                owner: caller,
                paused: false,
                audit_log: ink::storage::Mapping::default(),
                audit_log_count: 0,
                force_majeure,
                penalty_duration,
                penalty_percentage,
                cap_percentage,
                termination,
                fractional_part,
            }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(
                false,
                0,
                0,
                0,
                0,
                String::new(),
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
        pub fn late_delivery_and_penalty(
            &mut self,
            _request: LateDeliveryAndPenaltyRequest,
        ) -> Result<LateDeliveryAndPenaltyResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(LateDeliveryAndPenaltyRequestSubmitted {
                submitter: self.env().caller(),
                request_id,
            });

            // === BEGIN CUSTOM LOGIC ===
            // TODO: Implement your late delivery and penalty logic here
            let response = LateDeliveryAndPenaltyResponse {
                penalty: 0,
                buyer_may_terminate: false,
            };
            // === END CUSTOM LOGIC ===
            
            // Log function call for audit trail
            self.log_function_call("late_delivery_and_penalty", request_id);
            
            self.env().emit_event(LateDeliveryAndPenaltyResponseGenerated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        #[ink(message)]
        pub fn get_force_majeure(&self) -> bool {
            self.force_majeure
        }

        #[ink(message)]
        pub fn get_penalty_duration(&self) -> u64 {
            self.penalty_duration
        }

        #[ink(message)]
        pub fn get_penalty_percentage(&self) -> u128 {
            self.penalty_percentage
        }

        #[ink(message)]
        pub fn get_cap_percentage(&self) -> u128 {
            self.cap_percentage
        }

        #[ink(message)]
        pub fn get_termination(&self) -> u64 {
            self.termination
        }

        #[ink(message)]
        pub fn get_fractional_part(&self) -> String {
            self.fractional_part.clone()
        }

        #[ink(message)]
        pub fn set_force_majeure(&mut self, new_value: bool) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            if self.force_majeure != new_value {
                let old_value = self.force_majeure.to_string();
                let new_value_str = new_value.to_string();
                self.log_field_change("force_majeure", &old_value, &new_value_str);
                self.force_majeure = new_value;
            } else {
                self.force_majeure = new_value;
            }
            Ok(())
        }

        #[ink(message)]
        pub fn set_penalty_duration(&mut self, new_value: u64) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            if self.penalty_duration != new_value {
                let old_str = self.penalty_duration.to_string();
                let new_str = new_value.to_string();
                self.log_field_change("penalty_duration", &old_str, &new_str);
                self.penalty_duration = new_value;
            } else {
                self.penalty_duration = new_value;
            }
            Ok(())
        }

        #[ink(message)]
        pub fn set_penalty_percentage(&mut self, new_value: u128) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            if self.penalty_percentage != new_value {
                let old_str = self.penalty_percentage.to_string();
                let new_str = new_value.to_string();
                self.log_field_change("penalty_percentage", &old_str, &new_str);
                self.penalty_percentage = new_value;
            } else {
                self.penalty_percentage = new_value;
            }
            Ok(())
        }

        #[ink(message)]
        pub fn set_cap_percentage(&mut self, new_value: u128) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            if self.cap_percentage != new_value {
                let old_str = self.cap_percentage.to_string();
                let new_str = new_value.to_string();
                self.log_field_change("cap_percentage", &old_str, &new_str);
                self.cap_percentage = new_value;
            } else {
                self.cap_percentage = new_value;
            }
            Ok(())
        }

        #[ink(message)]
        pub fn set_termination(&mut self, new_value: u64) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            if self.termination != new_value {
                let old_str = self.termination.to_string();
                let new_str = new_value.to_string();
                self.log_field_change("termination", &old_str, &new_str);
                self.termination = new_value;
            } else {
                self.termination = new_value;
            }
            Ok(())
        }

        #[ink(message)]
        pub fn set_fractional_part(&mut self, new_value: String) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }
            
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }
            
            if self.fractional_part != new_value {
                let old_value = self.fractional_part.clone();
                self.log_field_change("fractional_part", &old_value, &new_value);
                self.fractional_part = new_value;
            } else {
                self.fractional_part = new_value;
            }
            Ok(())
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
            let contract = LateDeliveryAndPenalty::default();
            assert_eq!(contract.is_paused(), false);
        }

        #[ink::test]
        fn pause_works() {
            let mut contract = LateDeliveryAndPenalty::default();
            assert_eq!(contract.pause(), Ok(()));
            assert_eq!(contract.is_paused(), true);
        }

        #[ink::test]
        fn unpause_works() {
            let mut contract = LateDeliveryAndPenalty::default();
            assert_eq!(contract.pause(), Ok(()));
            assert_eq!(contract.unpause(), Ok(()));
            assert_eq!(contract.is_paused(), false);
        }
    }
}
