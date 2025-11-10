# AGREEMENT FOR SALE AND PURCHASE OF REAL ESTATE

{{#clause propertyAddress}}
**Property Address:**  
{{addressLine1}}
{{addressLine2}}
{{city}}, {{postCode}}  
{{county}}
{{/clause}}

**Date:** {{agreementDate}}

---

## PARTIES

**THE SELLERS:**  
{{#ulist sellers}}

- **{{fullName}}** \
  email: {{email}}, \
  mobile: {{mobile}}
  {{/ulist}}

**THE BUYERS:**  
{{#ulist buyers}}

- **{{fullName}}** \
  email: {{email}}, \
  mobile: {{mobile}}
  {{/ulist}}

---

## TERMS OF SALE

{{#clause purchasePrice}}
**Purchase Price:** {{currencyCode}} {{amount as "0,0"}}
{{/clause}}

{{#clause deposit}}
**Deposit:** {{currencyCode}} {{amount as "0,0"}}
{{/clause}}

{{#clause balance}}
**Balance:** {{currencyCode}} {{amount as "0,0"}}
{{/clause}}

**Contract Status:** {{status}}

---

## AGREEMENT

{{#clause purchasePrice}}
The Sellers agree to sell and the Buyers agree to purchase the above-described property for the Purchase Price of **{{currencyCode}} {{amount as "0,0"}}**.
{{/clause}}

### 1. DEPOSIT

{{#clause deposit}}
The Buyers shall pay a deposit of **{{currencyCode}} {{amount as "0,0"}}** upon signing this agreement.
{{/clause}}

### 2. BALANCE

{{#clause balance}}
The remaining balance of **{{currencyCode}} {{amount as "0,0"}}** shall be paid on completion.
{{/clause}}

### 3. COMPLETION

Completion shall take place in accordance with the terms set out in the Special Conditions below.

### 4. TITLE

The Sellers shall provide good and marketable title to the property, free from encumbrances except as disclosed.

### 5. RISK

Risk in the property shall pass to the Buyers on completion.

---

## SIGNATURES

**Sellers:**  
{{#ulist sellers}}

- **{{fullName}}** \
   Signed: _{{signedAt as "DD MMM YYYY"}}_ \
   Wallet: _{{walletAddress}}_
  {{/ulist}}

**Buyers:**  
{{#ulist buyers}}

- **{{fullName}}** \
   Signed: _{{signedAt as "DD MMM YYYY"}}_ \
   Wallet: _{{walletAddress}}_
  {{/ulist}}

---

**Agreement Date:** {{agreementDate as "DD MMM YYYY"}}

_This agreement is governed by the laws of England and Wales._
