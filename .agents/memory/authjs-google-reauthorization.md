---
name: Auth.js Google reauthorization
description: OAuth grant persistence behavior for already-linked Google accounts.
---

Auth.js may complete OAuth for an already-linked Google account without updating the adapter Account token fields. Calendar scope upgrades and reconnects must explicitly persist the newly returned grant during the verified Google sign-in callback.

**Why:** Otherwise an identity-only account never gains usable Calendar scopes, and a disconnected account whose local tokens were cleared cannot reconnect even after successful Google consent.

**How to apply:** For explicit incremental Google authorization, validate the verified identity and requested scopes, preserve or replace the refresh token safely, and update only the owned existing Account. Leave first-time account creation to the adapter.