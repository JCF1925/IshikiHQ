---
name: Mobile auth invalidation race
description: Replacement device sessions must be protected from delayed invalid-session cleanup.
---

When a mobile auth failure invalidates a session, serialize credential cleanup with replacement credential writes and guard the final state update with both the request token and a session generation.

**Why:** A late response can arrive while a replacement login is storing its credential; unguarded asynchronous deletion can remove the replacement token or reset the new account's React session state.

**How to apply:** Capture the token used by each request in the shared fetch layer, ignore failures whose token is no longer active, and make the invalidation path re-check its generation before committing sign-out state.