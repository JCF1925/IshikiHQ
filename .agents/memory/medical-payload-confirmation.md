---
name: External medical payload confirmation
description: Privacy rule for forwarding medical event data to external calendars.
---

Any medical event forwarding confirmation must bind to the exact current preview payload, not merely to a destination or a broad “share details” choice.

**Why:** Event data can change between preview and confirmation. Binding consent to a deterministic preview hash prevents a user from approving one payload while the system sends another.

**How to apply:** Recompute the preview on confirmation and reject stale, missing, or mismatched preview hashes. Keep this per-event and per-destination; never infer ongoing consent.