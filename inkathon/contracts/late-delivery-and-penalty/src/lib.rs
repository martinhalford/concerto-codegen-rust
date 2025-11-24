#![cfg_attr(not(feature = "std"), no_std, no_main)]
#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_sign_loss)]
#![allow(clippy::cast_possible_wrap)]
#![allow(unused_imports)]
#![allow(dead_code)]

#[ink::contract]
mod latedeliveryandpenalty {
    use ink::prelude::format;
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
    pub struct TransactionRecord {
        pub field_name: String,
        pub old_value: String,
        pub new_value: String,
        pub changed_by: AccountId,
        pub timestamp: u64,
        pub block_number: u64,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct ActivitySummary {
        pub total_transactions: u32,
        pub latest_field_name: String,
        pub latest_changed_by: AccountId,
        pub latest_block_number: u64,
        pub has_transactions: bool,
    }

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

    #[ink(storage)]
    pub struct LateDeliveryAndPenalty {
        owner: AccountId,
        paused: bool,
        transaction_history: Vec<TransactionRecord>,
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
                transaction_history: Vec::new(),
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
            Self::new(false, 0, 0, 0, 0, String::new())
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
            self.log_method_call("pause", "contract paused");
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
            self.log_method_call("unpause", "contract unpaused");
            self.env().emit_event(ContractUnpaused { by: caller });
            Ok(())
        }

        #[ink(message)]
        pub fn late_delivery_and_penalty(
            &mut self,
            request: LateDeliveryAndPenaltyRequest,
        ) -> Result<LateDeliveryAndPenaltyResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            // Only owner can update contract state via request
            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            let request_id = self.env().block_number() as u64;

            self.env()
                .emit_event(LateDeliveryAndPenaltyRequestSubmitted {
                    submitter: self.env().caller(),
                    request_id,
                });

            // === BEGIN CUSTOM LOGIC ===

            // UPDATE CONTRACT STATE from request
            // The request updates the contract's force majeure state
            if self.force_majeure != request.force_majeure {
                let old_value = self.force_majeure.to_string();
                let new_value = request.force_majeure.to_string();
                self.log_field_change("force_majeure", &old_value, &new_value);
                self.force_majeure = request.force_majeure;
            }

            // If force majeure is now true, no penalty applies
            if self.force_majeure {
                let response = LateDeliveryAndPenaltyResponse {
                    penalty: 0,
                    buyer_may_terminate: false,
                };

                self.log_method_call("late_delivery_and_penalty", "force majeure - no penalty");

                self.env()
                    .emit_event(LateDeliveryAndPenaltyResponseGenerated {
                        request_id,
                        success: true,
                    });

                return Ok(response);
            }

            // Get the delivery timestamp (or current time if not delivered)
            let delivered_at = match request.delivered_at {
                Some(timestamp) => timestamp,
                None => self.env().block_timestamp(),
            };

            // Calculate if delivery is late
            if delivered_at <= request.agreed_delivery {
                // Delivered on time or early - no penalty
                let response = LateDeliveryAndPenaltyResponse {
                    penalty: 0,
                    buyer_may_terminate: false,
                };

                self.log_method_call("late_delivery_and_penalty", "on-time delivery - no penalty");

                self.env()
                    .emit_event(LateDeliveryAndPenaltyResponseGenerated {
                        request_id,
                        success: true,
                    });

                return Ok(response);
            }

            // Calculate how late the delivery was (in seconds)
            let delay_seconds = delivered_at.saturating_sub(request.agreed_delivery);

            // Calculate penalty
            // Formula: (delay_seconds / penalty_duration) * (penalty_percentage / 100) * goods_value
            let penalty_duration_seconds = self.penalty_duration;

            if penalty_duration_seconds == 0 {
                return Err(ContractError::InvalidInput);
            }

            // Calculate the penalty ratio: delay_seconds / penalty_duration
            // Multiply by penalty_percentage, then divide by 100 to get percentage
            // Apply to goods_value
            let delay_periods = (delay_seconds as u128) / (penalty_duration_seconds as u128);
            let penalty_before_cap =
                (delay_periods * self.penalty_percentage * request.goods_value) / 100;

            // Apply cap: penalty cannot exceed cap_percentage of goods_value
            let max_penalty = (self.cap_percentage * request.goods_value) / 100;
            let penalty = if penalty_before_cap > max_penalty {
                max_penalty
            } else {
                penalty_before_cap
            };

            // Determine if buyer may terminate
            // Buyer can terminate if delay exceeds the termination threshold
            let buyer_may_terminate = delay_seconds >= self.termination;

            let response = LateDeliveryAndPenaltyResponse {
                penalty,
                buyer_may_terminate,
            };

            // === END CUSTOM LOGIC ===

            self.log_method_call("late_delivery_and_penalty", "penalty calculated");

            self.env()
                .emit_event(LateDeliveryAndPenaltyResponseGenerated {
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

        // === FIELD CHANGE LOGGING ===

        /// Record a field change with before/after values
        fn log_field_change(&mut self, field_name: &str, old_value: &str, new_value: &str) {
            let caller = self.env().caller();
            let timestamp = self.env().block_timestamp();
            let block_number = self.env().block_number() as u64;

            // Store in complete transaction history
            let transaction_record = TransactionRecord {
                field_name: field_name.to_string(),
                old_value: old_value.to_string(),
                new_value: new_value.to_string(),
                changed_by: caller,
                timestamp,
                block_number,
            };

            // Add to complete transaction history (no limit)
            self.transaction_history.push(transaction_record);

            // Emit event for external monitoring
            self.env().emit_event(ContractDataChanged {
                field_name: field_name.to_string(),
                changed_by: caller,
                old_value: old_value.to_string(),
                new_value: new_value.to_string(),
                block_number,
                timestamp,
            });
        }

        /// Record a method call in transaction history
        fn log_method_call(&mut self, method_name: &str, description: &str) {
            let caller = self.env().caller();
            let timestamp = self.env().block_timestamp();
            let block_number = self.env().block_number() as u64;

            // Store method call in transaction history
            let transaction_record = TransactionRecord {
                field_name: method_name.to_string(),
                old_value: "method_call".to_string(),
                new_value: description.to_string(),
                changed_by: caller,
                timestamp,
                block_number,
            };

            // Add to complete transaction history (no limit)
            self.transaction_history.push(transaction_record);
        }

        // === TRANSACTION HISTORY QUERY METHODS ===

        #[ink(message)]
        pub fn get_transaction_history(&self, limit: Option<u32>) -> Vec<TransactionRecord> {
            let mut history = self.transaction_history.clone();

            // Reverse to get most recent first
            history.reverse();

            // Apply limit if specified
            if let Some(max_count) = limit {
                #[allow(clippy::cast_possible_truncation)]
                let max_count_usize = max_count as usize;
                if history.len() > max_count_usize {
                    history.truncate(max_count_usize);
                }
            }

            history
        }

        #[ink(message)]
        pub fn get_transaction_count(&self) -> u32 {
            #[allow(clippy::cast_possible_truncation)]
            {
                self.transaction_history.len() as u32
            }
        }

        #[ink(message)]
        pub fn get_contract_activity_summary(&self) -> ActivitySummary {
            if self.transaction_history.is_empty() {
                return ActivitySummary {
                    total_transactions: 0,
                    latest_field_name: "none".to_string(),
                    latest_changed_by: self.owner,
                    latest_block_number: 0,
                    has_transactions: false,
                };
            }

            // Get the most recent transaction (last in the vector)
            let latest_transaction =
                &self.transaction_history[self.transaction_history.len().saturating_sub(1)];
            ActivitySummary {
                #[allow(clippy::cast_possible_truncation)]
                total_transactions: self.transaction_history.len() as u32,
                latest_field_name: latest_transaction.field_name.clone(),
                latest_changed_by: latest_transaction.changed_by,
                latest_block_number: latest_transaction.block_number,
                has_transactions: true,
            }
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
