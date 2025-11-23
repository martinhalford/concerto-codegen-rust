# LateDeliveryAndPenalty - ink! v4 Smart Contract (Polymesh Compatible)

This ink! v4 smart contract was generated from Concerto models and implements a blockchain-based legal contract compatible with Polymesh blockchain.

## Overview

This contract implements the **LateDeliveryAndPenalty** template model with the following properties:

- **forceMajeure**: Boolean
- **penaltyDuration**: Duration
- **penaltyPercentage**: Double
- **capPercentage**: Double
- **termination**: Duration
- **fractionalPart**: TemporalUnit


## Contract Features

- **Pausable**: Contract can be paused/unpaused by the owner
- **Access Control**: Owner-based permissions
- **Event Emission**: All important actions emit events
- **Request Processing**: Handles LateDeliveryAndPenaltyRequest requests
- **Response Generation**: Generates LateDeliveryAndPenaltyResponse responses

## Building and Testing

### Prerequisites

1. Install Rust and Cargo
2. Install cargo-contract CLI compatible with ink! v4:
   ```bash
   cargo install cargo-contract --version 3.2.0 --force
   ```

### Build

```bash
cargo contract build --release
```

This will generate:
- `target/ink/[contract_name].contract` - The contract bundle
- `target/ink/[contract_name].wasm` - The compiled WebAssembly
- `target/ink/[contract_name].json` - The contract metadata

### Test

```bash
cargo test
```

### Deploy to Polymesh

1. Ensure you have access to a Polymesh testnet or mainnet node
2. Deploy the contract using the Polymesh portal or CLI:
   ```bash
   cargo contract upload --suri //YourKey --url wss://your-polymesh-node:443
   cargo contract instantiate --suri //YourKey --constructor new --url wss://your-polymesh-node:443
   ```

Note: This contract is built with ink! v4 for Polymesh compatibility.

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
