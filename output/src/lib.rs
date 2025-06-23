#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod latedeliveryandpenalty {
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

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct DraftRequest {
        pub requester: AccountId,
        pub template_data: String,
        pub status: DraftStatus,
        pub ipfs_hash: Option<String>,
        pub error_message: Option<String>,
        pub created_at: u64,
        pub updated_at: u64,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum DraftStatus {
        Pending,
        Processing,
        Ready,
        Failed,
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

    #[ink(storage)]
    pub struct LateDeliveryAndPenalty {
        owner: AccountId,
        paused: bool,
        next_request_id: u64,
        draft_requests: ink::storage::Mapping<u64, DraftRequest>,
        user_drafts: ink::storage::Mapping<AccountId, Vec<u64>>,
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
        owner: AccountId,
    }

    #[ink(event)]
    pub struct ContractPaused {
        #[ink(topic)]
        by: AccountId,
    }

    #[ink(event)]
    pub struct ContractUnpaused {
        #[ink(topic)]
        by: AccountId,
    }

    #[ink(event)]
    pub struct DraftRequested {
        #[ink(topic)]
        requester: AccountId,
        request_id: u64,
        template_data: String, // JSON-serialized template data
        timestamp: u64,
    }

    #[ink(event)]
    pub struct DraftReady {
        #[ink(topic)]
        requester: AccountId,
        request_id: u64,
        ipfs_hash: String,
        timestamp: u64,
    }

    #[ink(event)]
    pub struct DraftError {
        #[ink(topic)]
        requester: AccountId,
        request_id: u64,
        error_message: String,
        timestamp: u64,
    }

    #[ink(event)]
    pub struct LateDeliveryAndPenaltyRequestSubmitted {
        #[ink(topic)]
        submitter: AccountId,
        request_id: u64,
    }

    #[ink(event)]
    pub struct LateDeliveryAndPenaltyResponseGenerated {
        #[ink(topic)]
        request_id: u64,
        success: bool,
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
                next_request_id: 1,
                draft_requests: ink::storage::Mapping::default(),
                user_drafts: ink::storage::Mapping::default(),
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
        pub fn process_request(
            &mut self,
            request: LateDeliveryAndPenaltyRequest,
        ) -> Result<LateDeliveryAndPenaltyResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            // Generate a simple request ID
            let request_id = self.env().block_number() as u64;

            self.env()
                .emit_event(LateDeliveryAndPenaltyRequestSubmitted {
                    submitter: self.env().caller(),
                    request_id,
                });

            // Process the request logic here
            let response = self.execute_contract_logic(request)?;

            self.env()
                .emit_event(LateDeliveryAndPenaltyResponseGenerated {
                    request_id,
                    success: true,
                });

            Ok(response)
        }

        //
        // === EXECUTE CONTRACT LOGIC ===
        //
        fn execute_contract_logic(
            &self,
            request: LateDeliveryAndPenaltyRequest,
        ) -> Result<LateDeliveryAndPenaltyResponse> {
            // If force majeure is active (either contract-level or request-specific), no penalties apply
            if self.force_majeure || request.force_majeure {
                return Ok(LateDeliveryAndPenaltyResponse {
                    penalty: 0,
                    buyer_may_terminate: false,
                });
            }

            // Check if delivery was actually late
            let penalty = match request.delivered_at {
                Some(delivered_timestamp) => {
                    // Calculate delay in seconds - use saturating_sub to prevent underflow
                    let delay_seconds = delivered_timestamp.saturating_sub(request.agreed_delivery);

                    // Apply fractional part rounding to total delay
                    let fractional_unit_seconds = self.get_fractional_unit_seconds();
                    let rounded_delay_units = if fractional_unit_seconds > 0 {
                        // Round UP any fractional part (ceiling division) - use div_ceil to avoid arithmetic side effects
                        delay_seconds.div_ceil(fractional_unit_seconds)
                    } else {
                        // Fallback: treat as 1 unit if fractional_unit_seconds is 0
                        1
                    };

                    // Calculate penalty based on rounded delay units
                    // Each unit of delay incurs the penalty percentage
                    let penalty_per_unit = request
                        .goods_value
                        .checked_mul(self.penalty_percentage)
                        .and_then(|v| v.checked_div(100))
                        .unwrap_or(0);

                    let total_penalty = penalty_per_unit
                        .checked_mul(rounded_delay_units as u128)
                        .unwrap_or(penalty_per_unit);

                    // Apply cap percentage if penalty exceeds it
                    let max_penalty = request
                        .goods_value
                        .checked_mul(self.cap_percentage)
                        .and_then(|v| v.checked_div(100))
                        .unwrap_or(0);

                    total_penalty.min(max_penalty)
                }
                None => {
                    // Never delivered - apply maximum penalty (cap percentage)
                    request
                        .goods_value
                        .checked_mul(self.cap_percentage)
                        .and_then(|v| v.checked_div(100))
                        .unwrap_or(0)
                }
            };

            // Determine if buyer may terminate
            // Buyer may terminate if penalty reaches or exceeds the termination threshold
            let termination_threshold = request
                .goods_value
                .checked_mul(self.termination as u128)
                .and_then(|v| v.checked_div(100))
                .unwrap_or(0);
            let buyer_may_terminate = penalty >= termination_threshold;

            Ok(LateDeliveryAndPenaltyResponse {
                penalty,
                buyer_may_terminate,
            })
        }

        /// Convert fractional_part string to seconds for calculation
        /// This helper function maps common time units to seconds
        fn get_fractional_unit_seconds(&self) -> u64 {
            match self.fractional_part.to_lowercase().as_str() {
                "day" | "days" => 86400,  // 24 * 60 * 60
                "hour" | "hours" => 3600, // 60 * 60
                "minute" | "minutes" => 60,
                "week" | "weeks" => 604800,    // 7 * 24 * 60 * 60
                "month" | "months" => 2592000, // 30 * 24 * 60 * 60 (approximate)
                _ => 86400,                    // Default to day if unrecognized unit
            }
        }

        //
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
        }

        //
        // === CONTRACT CONFIGURATION ===
        //  
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
