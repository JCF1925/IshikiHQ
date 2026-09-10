---
name: Calendar identity migration
description: Testing guidance for provider identity constraints on Calendar connections.
---

When tightening nullable provider identity rules, a fresh migrated schema only proves the final constraint exists. The legacy repair path needs a separate upgrade fixture that inserts an old null-identity row before the forward migration and verifies its post-migration state.

**Why:** Fresh-schema checks cannot expose whether existing Calendar rows, credentials, or dependent sync data are handled safely during rollout.

**How to apply:** Keep fresh-schema constraint coverage and an upgrade-path fixture separate; the latter should assert both the retired legacy row and the preservation of related Calendar data.