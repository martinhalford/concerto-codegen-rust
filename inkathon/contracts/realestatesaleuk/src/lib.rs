#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod propertysale {
    use ink::prelude::format;
    use ink::prelude::string::{String, ToString};
    use ink::prelude::vec::Vec;
    // Note: AccountId32 and Ss58Codec are not needed for no_std builds

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
    pub struct Offer {
        pub offer: Money,
        pub offer_status: OfferStatus,
        pub offer_date: u64,
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

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
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
        pub wallet_address: AccountId,
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
        UnderOffer,
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

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug, Default)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub enum OfferStatus {
        #[default]
        Pending,
        Accepted,
        Rejected,
        Cancelled,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    pub struct FieldChange {
        pub field_name: String,
        pub old_value: String,
        pub new_value: String,
    }

    #[derive(scale::Decode, scale::Encode, Clone, PartialEq, Eq, Debug)]
    #[cfg_attr(
        feature = "std",
        derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout)
    )]
    #[repr(u8)]
    pub enum AuditLogEntry {
        FunctionCall {
            caller: AccountId,
            timestamp: u64,
            function_name: String,
            request_id: u64,
            field_changes: Vec<FieldChange>,
        } = 0,
        DirectFieldChange {
            field_name: String,
            changed_by: AccountId,
            old_value: String,
            new_value: String,
            block_number: u64,
            timestamp: u64,
        } = 1,
    }

    #[ink(storage)]
    pub struct PropertySale {
        owner: AccountId,
        paused: bool,
        audit_log: ink::storage::Mapping<u64, AuditLogEntry>,
        audit_log_count: u64,
        pending_field_changes: Vec<FieldChange>,
        sellers: Vec<Party>,
        buyers: Vec<Party>,
        property_address: PropertyAddress,
        purchase_price: Option<Money>,
        deposit: Option<Money>,
        balance: Option<Money>,
        offer: Option<Offer>,
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
    pub struct AuthorizationAttempt {
        #[ink(topic)]
        pub caller: AccountId,
        #[ink(topic)]
        pub stored_address: AccountId,
        pub match_result: bool,
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
        /// Helper function to validate that a Party has required fields
        fn is_valid_party(party: &Party) -> bool {
            !party.party_id.is_empty() && !party.full_name.is_empty() && !party.email.is_empty()
        }

        /// Helper function to validate that a PropertyAddress has required fields
        fn is_valid_property_address(address: &PropertyAddress) -> bool {
            !address.address_line1.is_empty()
                && !address.city.is_empty()
                && !address.post_code.is_empty()
                && !address.county.is_empty()
        }

        /// Helper function to create a valid default PropertyAddress
        fn default_property_address() -> PropertyAddress {
            PropertyAddress {
                address_line1: "TBD".to_string(),
                address_line2: "TBD".to_string(),
                city: "TBD".to_string(),
                post_code: "TBD".to_string(),
                county: "TBD".to_string(),
                country: Country::UK,
            }
        }

        /// Helper function to validate contract is ready for signing
        fn validate_contract_ready_for_signing(&self) -> core::result::Result<(), String> {
            // Check at least 1 seller
            if self.sellers.is_empty() {
                return Err("Contract must have at least one seller before signing".to_string());
            }

            // Check at least 1 buyer
            if self.buyers.is_empty() {
                return Err("Contract must have at least one buyer before signing".to_string());
            }

            // Check offer exists and is accepted
            match &self.offer {
                Some(offer) => {
                    if offer.offer_status != OfferStatus::Accepted {
                        return Err(format!(
                            "Offer must be accepted before signing. Current status: {:?}",
                            offer.offer_status
                        ));
                    }

                    // Check purchase price exists and matches offer amount
                    match &self.purchase_price {
                        Some(purchase_price) => {
                            if purchase_price.amount != offer.offer.amount {
                                return Err(format!(
                                    "Purchase price ({} {:?}) must equal offer amount ({} {:?})",
                                    purchase_price.amount,
                                    purchase_price.currency_code,
                                    offer.offer.amount,
                                    offer.offer.currency_code
                                ));
                            }
                            if purchase_price.currency_code != offer.offer.currency_code {
                                return Err(format!(
                                    "Purchase price currency ({:?}) must match offer currency ({:?})",
                                    purchase_price.currency_code, offer.offer.currency_code
                                ));
                            }
                        }
                        None => {
                            return Err("Purchase price must be set before signing".to_string());
                        }
                    }
                }
                None => {
                    return Err(
                        "No offer exists to sign - an accepted offer is required".to_string()
                    );
                }
            }

            Ok(())
        }

        /// Helper function to find and update the signing party
        fn find_and_sign_party(&mut self, caller: AccountId) -> Result<()> {
            let current_timestamp = self.env().block_timestamp();

            // First, find the seller index (if any)
            let mut seller_index: Option<usize> = None;
            for (index, seller) in self.sellers.iter().enumerate() {
                if self.is_caller_matching_account(caller, seller.wallet_address) {
                    if seller.signed_at.is_some() {
                        return Err(ContractError::InvalidInput);
                    }
                    seller_index = Some(index);
                    break;
                }
            }

            // If found as seller, update and return
            if let Some(index) = seller_index {
                self.sellers[index].signed_at = Some(current_timestamp);
                return Ok(());
            }

            // If not found as seller, check buyers
            let mut buyer_index: Option<usize> = None;
            for (index, buyer) in self.buyers.iter().enumerate() {
                if self.is_caller_matching_account(caller, buyer.wallet_address) {
                    if buyer.signed_at.is_some() {
                        return Err(ContractError::InvalidInput);
                    }
                    buyer_index = Some(index);
                    break;
                }
            }

            // If found as buyer, update and return
            if let Some(index) = buyer_index {
                self.buyers[index].signed_at = Some(current_timestamp);
                return Ok(());
            }

            // Not found as either seller or buyer
            Err(ContractError::Unauthorized)
        }

        /// Helper function to check if all parties have signed
        fn all_parties_signed(&self) -> bool {
            // Check all sellers have signed
            for seller in &self.sellers {
                if seller.signed_at.is_none() {
                    return false;
                }
            }

            // Check all buyers have signed
            for buyer in &self.buyers {
                if buyer.signed_at.is_none() {
                    return false;
                }
            }

            true
        }

        /// Helper function to check if this is the first signature
        fn is_first_signature(&self) -> bool {
            // Check if any seller has signed
            for seller in &self.sellers {
                if seller.signed_at.is_some() {
                    return false;
                }
            }

            // Check if any buyer has signed
            for buyer in &self.buyers {
                if buyer.signed_at.is_some() {
                    return false;
                }
            }

            true
        }

        /// Filter out invalid/blank parties
        fn filter_valid_parties(parties: Vec<Party>) -> Vec<Party> {
            parties
                .into_iter()
                .filter(|party| Self::is_valid_party(party))
                .collect()
        }

        #[ink(constructor)]
        pub fn new(
            sellers: Vec<Party>,
            buyers: Vec<Party>,
            property_address: PropertyAddress,
            purchase_price: Option<Money>,
            deposit: Option<Money>,
            balance: Option<Money>,
            offer: Option<Offer>,
            agreement_date: Option<u64>,
            status: ContractStatus,
        ) -> Self {
            let caller = Self::env().caller();

            // Filter out blank/invalid parties
            let valid_sellers = Self::filter_valid_parties(sellers);
            let valid_buyers = Self::filter_valid_parties(buyers);

            // Use a valid property address if provided one is invalid
            let valid_property_address = if Self::is_valid_property_address(&property_address) {
                property_address
            } else {
                Self::default_property_address()
            };

            Self::env().emit_event(ContractCreated { owner: caller });

            Self {
                owner: caller,
                paused: false,
                audit_log: ink::storage::Mapping::default(),
                audit_log_count: 0,
                pending_field_changes: Vec::new(),
                sellers: valid_sellers,
                buyers: valid_buyers,
                property_address: valid_property_address,
                purchase_price,
                deposit,
                balance,
                offer,
                agreement_date,
                status,
            }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(
                Vec::new(),
                Vec::new(),
                Self::default_property_address(),
                None,
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

        // Compare caller's AccountId with stored address
        fn is_caller_matching_account(&self, caller: AccountId, stored_address: AccountId) -> bool {
            let match_result = caller == stored_address;

            // Emit debug event for authorization attempts
            self.env().emit_event(AuthorizationAttempt {
                caller,
                stored_address,
                match_result,
            });

            match_result
        }

        // Helper function to check if caller is a buyer
        fn is_caller_buyer(&self, caller: AccountId) -> bool {
            for buyer in &self.buyers {
                if self.is_caller_matching_account(caller, buyer.wallet_address) {
                    return true;
                }
            }
            false
        }

        // Helper function to check if caller is a seller
        fn is_caller_seller(&self, caller: AccountId) -> bool {
            for seller in &self.sellers {
                if self.is_caller_matching_account(caller, seller.wallet_address) {
                    return true;
                }
            }
            false
        }

        #[ink(message)]
        pub fn manage_offer(
            &mut self,
            _request: ManageOfferRequest,
        ) -> Result<ManageOfferResponse> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            let request_id = self.env().block_number() as u64;

            self.env().emit_event(ManageOfferRequestSubmitted {
                submitter: caller,
                request_id,
            });

            // Access control: Check if caller is authorized for the specific action
            match _request.action {
                OfferAction::Submit | OfferAction::Cancel => {
                    if !self.is_caller_buyer(caller) {
                        return Ok(ManageOfferResponse {
                            success: false,
                            error_message: Some(
                                "Only buyers can submit or cancel offers".to_string(),
                            ),
                        });
                    }
                }
                OfferAction::Accept | OfferAction::Reject => {
                    if !self.is_caller_seller(caller) {
                        return Ok(ManageOfferResponse {
                            success: false,
                            error_message: Some(
                                "Only sellers can accept or reject offers".to_string(),
                            ),
                        });
                    }
                }
            }

            // === BEGIN CUSTOM LOGIC ===
            let response = match _request.action {
                OfferAction::Submit => {
                    // For Submit action, we need a new offer amount
                    match _request.offer {
                        Some(offer_money) => {
                            // Create new offer with Pending status and current timestamp
                            let new_offer = Offer {
                                offer: offer_money,
                                offer_status: OfferStatus::Pending,
                                offer_date: self.env().block_timestamp(),
                            };

                            // Log the offer change
                            let old_offer_value = format!("{:?}", self.offer);
                            let new_offer_value_str = format!("{:?}", Some(&new_offer));
                            self.log_direct_field_change(
                                "offer",
                                &old_offer_value,
                                &new_offer_value_str,
                            );

                            // Set the new offer
                            self.offer = Some(new_offer);

                            // Change contract status to UnderOffer when buyer submits an offer
                            let old_status_value = format!("{:?}", self.status);
                            self.status = ContractStatus::UnderOffer;
                            let new_status_value = format!("{:?}", self.status);
                            self.log_direct_field_change(
                                "status",
                                &old_status_value,
                                &new_status_value,
                            );

                            ManageOfferResponse {
                                success: true,
                                error_message: None,
                            }
                        }
                        None => ManageOfferResponse {
                            success: false,
                            error_message: Some(
                                "Offer amount is required for Submit action".to_string(),
                            ),
                        },
                    }
                }
                OfferAction::Accept | OfferAction::Reject | OfferAction::Cancel => {
                    // For other actions, just update the status of existing offer
                    match &self.offer {
                        Some(_) => {
                            // Capture old value before mutable borrow
                            let old_offer_value = format!("{:?}", self.offer);

                            // Now get mutable reference and update status
                            if let Some(ref mut existing_offer) = self.offer {
                                existing_offer.offer_status = match _request.action {
                                    OfferAction::Accept => OfferStatus::Accepted,
                                    OfferAction::Reject => OfferStatus::Rejected,
                                    OfferAction::Cancel => OfferStatus::Cancelled,
                                    OfferAction::Submit => OfferStatus::Pending, // This won't happen due to match above
                                };
                            }

                            let new_offer_value_str = format!("{:?}", self.offer);
                            self.log_direct_field_change(
                                "offer",
                                &old_offer_value,
                                &new_offer_value_str,
                            );

                            // Handle contract status changes based on action
                            match _request.action {
                                OfferAction::Cancel => {
                                    // When buyer cancels offer, set contract status back to Draft
                                    let old_status_value = format!("{:?}", self.status);
                                    self.status = ContractStatus::Draft;
                                    let new_status_value = format!("{:?}", self.status);
                                    self.log_direct_field_change(
                                        "status",
                                        &old_status_value,
                                        &new_status_value,
                                    );
                                }
                                OfferAction::Accept | OfferAction::Reject => {
                                    // Sellers accepting/rejecting offers don't change contract status automatically
                                    // Status changes can be handled separately if needed
                                }
                                OfferAction::Submit => {
                                    // This won't happen due to match above
                                }
                            }

                            ManageOfferResponse {
                                success: true,
                                error_message: None,
                            }
                        }
                        None => ManageOfferResponse {
                            success: false,
                            error_message: Some("No existing offer to update".to_string()),
                        },
                    }
                }
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
            let caller = self.env().caller();

            // Validate contract is ready for signing
            if let Err(error_msg) = self.validate_contract_ready_for_signing() {
                return Ok(SignContractResponse {
                    success: false,
                    error_message: Some(error_msg),
                });
            }

            // Check if this is the first signature (before any changes)
            let is_first = self.is_first_signature();

            // Find and sign the party
            let response = match self.find_and_sign_party(caller) {
                Ok(_) => {
                    // Log the sellers change
                    let sellers_value = format!("{:?}", self.sellers);
                    self.log_direct_field_change("sellers", "sellers_updated", &sellers_value);

                    // Log the buyers change
                    let buyers_value = format!("{:?}", self.buyers);
                    self.log_direct_field_change("buyers", "buyers_updated", &buyers_value);

                    // Handle contract status changes
                    if is_first {
                        // First party to sign - change status to Signing
                        let old_status_value = format!("{:?}", self.status);
                        self.status = ContractStatus::Signing;
                        let new_status_value = format!("{:?}", self.status);
                        self.log_direct_field_change(
                            "status",
                            &old_status_value,
                            &new_status_value,
                        );
                    } else if self.all_parties_signed() {
                        // All parties have signed - change status to Signed
                        let old_status_value = format!("{:?}", self.status);
                        self.status = ContractStatus::Signed;
                        let new_status_value = format!("{:?}", self.status);
                        self.log_direct_field_change(
                            "status",
                            &old_status_value,
                            &new_status_value,
                        );
                    }

                    SignContractResponse {
                        success: true,
                        error_message: None,
                    }
                }
                Err(contract_error) => {
                    let error_msg = match contract_error {
                        ContractError::Unauthorized => {
                            "Only buyers and sellers can sign the contract".to_string()
                        }
                        ContractError::InvalidInput => {
                            "Party has already signed or invalid signing attempt".to_string()
                        }
                        _ => "Signing failed".to_string(),
                    };
                    SignContractResponse {
                        success: false,
                        error_message: Some(error_msg),
                    }
                }
            };
            // === END CUSTOM LOGIC ===

            // Log function call for audit trail
            self.log_function_call("sign_contract", request_id);

            self.env().emit_event(SignContractResponseGenerated {
                request_id,
                success: response.success,
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
        pub fn get_offer(&self) -> Option<Offer> {
            self.offer.clone()
        }

        #[ink(message)]
        pub fn get_agreement_date(&self) -> Option<u64> {
            self.agreement_date
        }

        #[ink(message)]
        pub fn get_status(&self) -> ContractStatus {
            self.status.clone()
        }

        /// Utility function to validate if a string is a valid SS58 address
        #[ink(message)]
        pub fn is_valid_ss58_address(&self, address: String) -> bool {
            // Basic validation: SS58 addresses should be between 47-48 characters
            // and contain only valid base58 characters
            if address.len() < 47 || address.len() > 48 {
                return false;
            }

            // Check if all characters are valid base58 characters
            address.chars().all(|c| {
                matches!(c,
                    '1'..='9' | 'A'..='H' | 'J'..='N' | 'P'..='Z' | 'a'..='k' | 'm'..='z'
                )
            })
        }

        // === SELLERS COLLECTION MANAGEMENT ===

        #[ink(message)]
        pub fn add_seller(&mut self, party: Party) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            // Validate party has required fields
            if !Self::is_valid_party(&party) {
                return Err(ContractError::InvalidInput);
            }

            // Check for duplicate party_id
            if self.sellers.iter().any(|p| p.party_id == party.party_id) {
                return Err(ContractError::InvalidInput);
            }

            let old_value = format!("{:?}", self.sellers);
            self.sellers.push(party.clone());
            let new_value = format!("{:?}", self.sellers);

            self.log_direct_field_change("sellers", &old_value, &new_value);
            Ok(())
        }

        #[ink(message)]
        pub fn remove_seller(&mut self, party_id: String) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            let old_value = format!("{:?}", self.sellers);

            // Find and remove the party
            let initial_len = self.sellers.len();
            self.sellers.retain(|p| p.party_id != party_id);

            // Check if party was actually removed
            if self.sellers.len() == initial_len {
                return Err(ContractError::InvalidInput);
            }

            let new_value = format!("{:?}", self.sellers);
            self.log_direct_field_change("sellers", &old_value, &new_value);
            Ok(())
        }

        // === BUYERS COLLECTION MANAGEMENT ===

        #[ink(message)]
        pub fn add_buyer(&mut self, party: Party) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            // Validate party has required fields
            if !Self::is_valid_party(&party) {
                return Err(ContractError::InvalidInput);
            }

            // Check for duplicate party_id
            if self.buyers.iter().any(|p| p.party_id == party.party_id) {
                return Err(ContractError::InvalidInput);
            }

            let old_value = format!("{:?}", self.buyers);
            self.buyers.push(party.clone());
            let new_value = format!("{:?}", self.buyers);

            self.log_direct_field_change("buyers", &old_value, &new_value);
            Ok(())
        }

        #[ink(message)]
        pub fn remove_buyer(&mut self, party_id: String) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            let old_value = format!("{:?}", self.buyers);

            // Find and remove the party
            let initial_len = self.buyers.len();
            self.buyers.retain(|p| p.party_id != party_id);

            // Check if party was actually removed
            if self.buyers.len() == initial_len {
                return Err(ContractError::InvalidInput);
            }

            let new_value = format!("{:?}", self.buyers);
            self.log_direct_field_change("buyers", &old_value, &new_value);
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

            if !Self::is_valid_property_address(&new_value) {
                return Err(ContractError::InvalidInput);
            }

            let old_value = format!("{:?}", self.property_address);
            let new_value_str = format!("{:?}", new_value);
            self.log_direct_field_change("property_address", &old_value, &new_value_str);
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

            let old_value = if let Some(ref old_price) = self.purchase_price {
                format!("{} {:?}", old_price.amount, old_price.currency_code)
            } else {
                "None".to_string()
            };
            let new_value_str = if let Some(ref new_price) = new_value {
                format!("{} {:?}", new_price.amount, new_price.currency_code)
            } else {
                "None".to_string()
            };
            self.log_direct_field_change("purchase_price", &old_value, &new_value_str);
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

            let old_value = if let Some(ref old_deposit) = self.deposit {
                format!("{} {:?}", old_deposit.amount, old_deposit.currency_code)
            } else {
                "None".to_string()
            };
            let new_value_str = if let Some(ref new_deposit) = new_value {
                format!("{} {:?}", new_deposit.amount, new_deposit.currency_code)
            } else {
                "None".to_string()
            };
            self.log_direct_field_change("deposit", &old_value, &new_value_str);
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

            let old_value = if let Some(ref old_balance) = self.balance {
                format!("{} {:?}", old_balance.amount, old_balance.currency_code)
            } else {
                "None".to_string()
            };
            let new_value_str = if let Some(ref new_balance) = new_value {
                format!("{} {:?}", new_balance.amount, new_balance.currency_code)
            } else {
                "None".to_string()
            };
            self.log_direct_field_change("balance", &old_value, &new_value_str);
            self.balance = new_value;
            Ok(())
        }

        #[ink(message)]
        pub fn set_offer(&mut self, new_value: Option<Offer>) -> Result<()> {
            if self.paused {
                return Err(ContractError::ContractPaused);
            }

            let caller = self.env().caller();
            if caller != self.owner {
                return Err(ContractError::Unauthorized);
            }

            let old_value = format!("{:?}", self.offer);
            let new_value_str = format!("{:?}", new_value);
            self.log_direct_field_change("offer", &old_value, &new_value_str);
            self.offer = new_value;
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

            let old_value = if let Some(old_date) = self.agreement_date {
                old_date.to_string()
            } else {
                "None".to_string()
            };
            let new_value_str = if let Some(new_date) = new_value {
                new_date.to_string()
            } else {
                "None".to_string()
            };
            self.log_direct_field_change("agreement_date", &old_value, &new_value_str);
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

            let old_value = format!("{:?}", self.status);
            let new_value_str = format!("{:?}", new_value);
            self.log_direct_field_change("status", &old_value, &new_value_str);
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

        /// Record a function call in the audit log, including any pending field changes
        fn log_function_call(&mut self, function_name: &str, request_id: u64) {
            let caller = self.env().caller();
            let timestamp = self.env().block_timestamp();

            // Take all pending field changes and include them in this function call entry
            let field_changes = core::mem::take(&mut self.pending_field_changes);

            let log_entry = AuditLogEntry::FunctionCall {
                caller,
                timestamp,
                function_name: function_name.to_string(),
                request_id,
                field_changes: field_changes.clone(),
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

            // Emit individual field change events for each change
            for field_change in field_changes {
                self.env().emit_event(ContractDataChanged {
                    field_name: field_change.field_name,
                    changed_by: caller,
                    old_value: field_change.old_value,
                    new_value: field_change.new_value,
                    block_number: self.env().block_number() as u64,
                    timestamp,
                });
            }
        }

        /// Record a field change - adds to pending changes for inclusion in next function call log
        fn log_field_change(&mut self, field_name: &str, old_value: &str, new_value: &str) {
            let field_change = FieldChange {
                field_name: field_name.to_string(),
                old_value: old_value.to_string(),
                new_value: new_value.to_string(),
            };

            self.pending_field_changes.push(field_change);
        }

        /// Record a direct field change immediately (for setter functions called directly)
        fn log_direct_field_change(&mut self, field_name: &str, old_value: &str, new_value: &str) {
            let caller = self.env().caller();
            let timestamp = self.env().block_timestamp();
            let block_number = self.env().block_number() as u64;

            let log_entry = AuditLogEntry::DirectFieldChange {
                field_name: field_name.to_string(),
                changed_by: caller,
                old_value: old_value.to_string(),
                new_value: new_value.to_string(),
                block_number,
                timestamp,
            };

            self.audit_log.insert(self.audit_log_count, &log_entry);
            self.audit_log_count = self.audit_log_count.saturating_add(1);

            // Emit event
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

        #[ink(message)]
        pub fn get_audit_log_function_calls(&self, start: u64, limit: u64) -> Vec<AuditLogEntry> {
            let mut entries = Vec::new();
            let mut count = 0u64;

            for i in start..self.audit_log_count {
                if count >= limit {
                    break;
                }
                if let Some(entry) = self.audit_log.get(i) {
                    if matches!(entry, AuditLogEntry::FunctionCall { .. }) {
                        entries.push(entry);
                        count = count.saturating_add(1);
                    }
                }
            }

            entries
        }

        #[ink(message)]
        pub fn get_audit_log_field_changes(&self, start: u64, limit: u64) -> Vec<AuditLogEntry> {
            let mut entries = Vec::new();
            let mut count = 0u64;

            for i in start..self.audit_log_count {
                if count >= limit {
                    break;
                }
                if let Some(entry) = self.audit_log.get(i) {
                    match entry {
                        AuditLogEntry::DirectFieldChange { .. } => {
                            entries.push(entry);
                            count = count.saturating_add(1);
                        }
                        AuditLogEntry::FunctionCall {
                            ref field_changes, ..
                        } => {
                            if !field_changes.is_empty() {
                                entries.push(entry);
                                count = count.saturating_add(1);
                            }
                        }
                    }
                }
            }

            entries
        }

        #[ink(message)]
        pub fn get_audit_log_field_changes_by_field(
            &self,
            field_name: String,
        ) -> Vec<AuditLogEntry> {
            let mut matching_entries = Vec::new();

            for i in 0..self.audit_log_count {
                if let Some(entry) = self.audit_log.get(i) {
                    match entry {
                        AuditLogEntry::DirectFieldChange {
                            field_name: ref entry_field_name,
                            ..
                        } => {
                            if entry_field_name == &field_name {
                                matching_entries.push(entry);
                            }
                        }
                        AuditLogEntry::FunctionCall {
                            ref field_changes, ..
                        } => {
                            for field_change in field_changes {
                                if field_change.field_name == field_name {
                                    matching_entries.push(entry.clone());
                                    break; // Only add the entry once even if multiple matching fields
                                }
                            }
                        }
                    }
                }
            }

            matching_entries
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
