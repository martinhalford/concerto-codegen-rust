# PropertySale - ink! Smart Contract

This ink! smart contract was generated from Concerto models and implements a blockchain-based legal contract.

## Overview

This contract implements the **PropertySale** template model with the following properties:

- **sellers**: Party
- **buyers**: Party
- **propertyAddress**: Address
- **purchasePrice**: Money
- **deposit**: Money
- **balance**: Money
- **offer**: Offer
- **agreementDate**: DateTime
- **status**: ContractStatus


## Contract Features

- **Pausable**: Contract can be paused/unpaused by the owner
- **Access Control**: Owner-based permissions
- **Event Emission**: All important actions emit events
- **Request Processing**: Handles ManageOfferRequest requests
- **Response Generation**: Generates ManageOfferResponse responses

## Building and Testing

### Prerequisites

1. Install Rust and Cargo
2. Install ink! CLI:
   ```bash
   cargo install cargo-contract --force
   ```

### Build

```bash
cargo contract build
```

### Test

```bash
cargo test
```

### Deploy

1. Start a local Substrate node with contracts pallet
2. Deploy the contract:
   ```bash
   cargo contract upload --suri //Alice
   cargo contract instantiate --suri //Alice --constructor new
   ```

## Contract API

### Messages

- `get_owner()`: Returns the contract owner
- `is_paused()`: Returns whether the contract is paused
- `pause()`: Pause the contract (owner only)
- `unpause()`: Unpause the contract (owner only)
- `process_request(request: ManageOfferRequest)`: Process a contract request
- `get_sellers()`: Get sellers
- `get_buyers()`: Get buyers
- `get_property_address()`: Get propertyAddress
- `get_purchase_price()`: Get purchasePrice
- `get_deposit()`: Get deposit
- `get_balance()`: Get balance
- `get_offer()`: Get offer
- `get_agreement_date()`: Get agreementDate
- `get_status()`: Get status

### Events

- `ContractCreated`: Emitted when contract is created
- `ContractPaused`: Emitted when contract is paused
- `ContractUnpaused`: Emitted when contract is unpaused
- `ManageOfferRequestSubmitted`: Emitted when a request is submitted
- `ManageOfferResponseGenerated`: Emitted when a response is generated

## Generated from Concerto Models

This contract was automatically generated from the following Concerto model files:
- realestatesaleuk@1.0.0.PropertySale

## License

This contract is licensed under the Apache License 2.0.
