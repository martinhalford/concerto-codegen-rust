# Simple On-Chain Contract Example

**{{contractDate as "DD MMM YYYY"}}**

This contract defines its parties and is designed for on-chain storage and execution. 

The contract's lifecycle is governed by four statuses:

### 1. Draft
> While parties negotiate terms, the contract remains editable in **Draft** status.

### 2. Signing
> As soon as any party “signs” (i.e., submits a blockchain transaction with their private key), the contract locks and moves to **Signing** status — no further edits are allowed.

### 3. Completed
> Once every party has signed, the contract transitions to **Completed** status and becomes a legally binding agreement.

### 4. Cancelled
> At any point before completion, the contract owner can cancel the contract. Cancellation locks the document in **Cancelled** status, preventing any further changes.

**Note:** All signature operations are handled by the blockchain and, once recorded, cannot be undone.

---

## PARTIES

{{#ulist party}}

- **{{fullName}}** \
  {{#with address}}{{addressLine1}} \ 
  {{addressLine2}}, \
  {{city}} \
  {{county}} \
  {{postCode}} \
  {{country}} {{/with}} 
  email: {{email}}, \
  mobile: {{mobile}}

{{/ulist}}
---

## SIGNATURES

{{#ulist party}}

- **{{fullName}}** \
   Signed on **{{signedAt as "DD MMM YYYY"}}** at **{{signedAt as "HH:MM A"}}**_ \
   Wallet: _{{walletAddress}}_
{{/ulist}}

---

The status of this contract is: **{{contractStatus}}**

---
