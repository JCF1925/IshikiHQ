---
name: Medication stock reconciliation
description: Recovery semantics for historical medication stock mismatches.
---

The signed quantity changes in a medication's operational stock ledger are the recoverable balance for reconciliation; historical `balanceAfter` values may be inconsistent after older concurrent writes. A historical reconciliation row remains an append-only audit record, but its correction delta is not replayed into the operational balance because the stock level is aligned to the balance it documents.

**Why:** Older stock writes could leave the cached StockLevel and ledger disagreeing, while changing old entries would destroy the evidence needed to understand the correction.

**How to apply:** Diagnose from user-owned operational ledger rows, require the client's reviewed current and ledger values to still match inside the stock lock, align the cached stock to the reviewed ledger, and record the before/after context in the new adjustment entry.