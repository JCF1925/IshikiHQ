---
name: Mobile capture recovery privacy
description: Privacy and idempotency boundaries for restoring deleted offline captures.
---

Deleted mobile capture payloads may remain in the owner-scoped staging record so an explicit, version-checked restore can recreate the canonical row. They must never be copied into delete sync changes or returned by sync pull; the delete remains a payload-free tombstone until the owner restores it.

**Why:** A recovery payload is needed for restoration, but putting it in the sync log leaks deleted private data to any synchronized device before the user chooses recovery.

**How to apply:** Keep restore mutations owner-scoped, require the reviewed current version, lock the staging row during restore, and make repeated restores no-ops after the first canonical materialisation so medication side effects are not replayed.