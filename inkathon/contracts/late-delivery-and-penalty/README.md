# LateDeliveryAndPenalty - ink! Smart Contract

This ink! smart contract was generated from Concerto models and implements a blockchain-based legal contract with **complete frontend integration**.

## **Working Integration**

This contract is part of a **complete end-to-end system** featuring:

- **React Frontend** with Polkadot.js integration
- **Real-time Document Generation** via draft service
- **Event-driven Architecture** for automatic processing
- **Accord Project Template Processing** for legal documents

**Live Demo**: Start the frontend (`cd ../../frontend && pnpm run dev`) and see contracts generated in real-time!

## Overview

This contract implements the **LateDeliveryAndPenalty** template model with the following properties:

- **forceMajeure**: Boolean
- **penaltyDuration**: Duration
- **penaltyPercentage**: Double
- **capPercentage**: Double
- **termination**: Duration
- **fractionalPart**: TemporalUnit

## **Frontend Integration Features**

- **Draft Requests**: Submit contract generation requests via React UI
- **Real-time Updates**: See document status updates automatically
- **Document Downloads**: Access generated contracts immediately
- **Transaction History**: Track all blockchain interactions
- **Wallet Integration**: Connect with any Polkadot.js compatible wallet

## Contract Features

- **Pausable**: Contract can be paused/unpaused by the owner
- **Access Control**: Owner-based permissions
- **Event Emission**: All important actions emit events for frontend integration
- **Request Processing**: Handles LateDeliveryAndPenaltyRequest requests
- **Response Generation**: Generates LateDeliveryAndPenaltyResponse responses
- **Draft Document Coordination**: Manages document generation workflow

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
- `process_request(request: LateDeliveryAndPenaltyRequest)`: Process a contract request
- `get_force_majeure()`: Get forceMajeure
- `get_penalty_duration()`: Get penaltyDuration
- `get_penalty_percentage()`: Get penaltyPercentage
- `get_cap_percentage()`: Get capPercentage
- `get_termination()`: Get termination
- `get_fractional_part()`: Get fractionalPart

### Events

- `ContractCreated`: Emitted when contract is created
- `ContractPaused`: Emitted when contract is paused
- `ContractUnpaused`: Emitted when contract is unpaused
- `LateDeliveryAndPenaltyRequestSubmitted`: Emitted when a request is submitted
- `LateDeliveryAndPenaltyResponseGenerated`: Emitted when a response is generated

## Generated from Concerto Models

This contract was automatically generated from the following Concerto model files:

- io.clause.latedeliveryandpenalty@0.1.0.LateDeliveryAndPenalty

## License

This contract is licensed under the Apache License 2.0.
