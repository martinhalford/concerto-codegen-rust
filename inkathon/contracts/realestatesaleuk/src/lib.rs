#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod propertysale {
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
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct SaleRequest {
        pub request_id: String,
        pub requester: Party,
        pub purchase_price: Money,
        pub property_address: Address
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct SaleResponse {
        pub request_id: String,
        pub success: bool,
        pub document_url: Option<String>,
        pub error_message: Option<String>
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct DotNetNamespace {
        pub namespace: String
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct Money {
        pub amount: u128,
        pub currency_code: String
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct Signature {
        pub signatory: Party,
        pub role: String,
        pub signed_at: u64
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct Address {
        pub address_line1: String,
        pub address_line2: Option<String>,
        pub city: String,
        pub post_code: String,
        pub county: String
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct Party {
        pub party_id: String,
        pub full_name: String,
        pub email: String,
        pub mobile: String,
        pub address: Address
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
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

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum DraftStatus {
        Pending,
        Processing,
        Ready,
        Failed,
    }

    #[ink(storage)]
    pub struct PropertySale {
        owner: AccountId,
        paused: bool,
        next_request_id: u64,
        draft_requests: ink::storage::Mapping<u64, DraftRequest>,
        user_drafts: ink::storage::Mapping<AccountId, Vec<u64>>,
        seller: Party,
        buyer: Party,
        property_address: Address,
        purchase_price: Money,
        deposit: Money,
        balance: Money,
        agreement_date: u64,
        signatures: Vec<Signature>,
        status: ContractStatus
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
    pub struct SaleRequestSubmitted {
        #[ink(topic)]
        pub submitter: AccountId,
        #[ink(topic)]
        pub request_id: u64,
    }

    #[ink(event)]
    pub struct SaleResponseGenerated {
        #[ink(topic)]
        pub request_id: u64,
        pub success: bool,
    }

    #[ink(event)]
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
    }

    impl PropertySale {
        #[ink(constructor)]
        pub fn new(seller: Party,
            buyer: Party,
            property_address: Address,
            purchase_price: Money,
            deposit: Money,
            balance: Money,
            agreement_date: u64,
            signatures: Vec<Signature>,
            status: ContractStatus) -> Self {
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
            seller,
            buyer,
            property_address,
            purchase_price,
            deposit,
            balance,
            agreement_date,
            signatures,
            status
            }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(Default::default(), Default::default(), Default::default(), Default::default(), Default::default(), Default::default(), 0, Vec::new(), 0)
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
        pub fn process_request(&mut self, request: SaleRequest) -> Result<SaleResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            // Generate a simple request ID
            let request_id = self.env().block_number() as u64;
            
            self.env().emit_event(SaleRequestSubmitted {
                submitter: self.env().caller(),
                request_id,
            });

            // Process the request logic here
            let response = self.execute_contract_logic(request)?;
            
            self.env().emit_event(SaleResponseGenerated {
                request_id,
                success: true,
            });

            Ok(response)
        }

        //
        // === CONTRACT LOGIC FUNCTIONALITY ===
        //
        fn execute_contract_logic(&self, _request: SaleRequest) -> Result<SaleResponse> {
            // Implement your contract logic here
            // This is a placeholder implementation
            Ok(SaleResponse {
                request_id: String::new(),
                success: false,
                document_url: None,
                error_message: None
            })
        }

        #[ink(message)]
        pub fn get_seller(&self) -> Party {
            self.seller.clone()
        }

        #[ink(message)]
        pub fn get_buyer(&self) -> Party {
            self.buyer.clone()
        }

        #[ink(message)]
        pub fn get_property_address(&self) -> Address {
            self.property_address.clone()
        }

        #[ink(message)]
        pub fn get_purchase_price(&self) -> Money {
            self.purchase_price.clone()
        }

        #[ink(message)]
        pub fn get_deposit(&self) -> Money {
            self.deposit.clone()
        }

        #[ink(message)]
        pub fn get_balance(&self) -> Money {
            self.balance.clone()
        }

        #[ink(message)]
        pub fn get_agreement_date(&self) -> u64 {
            self.agreement_date.clone()
        }

        #[ink(message)]
        pub fn get_signatures(&self) -> Vec<Signature> {
            self.signatures.clone()
        }

        #[ink(message)]
        pub fn get_status(&self) -> ContractStatus {
            self.status.clone()
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
