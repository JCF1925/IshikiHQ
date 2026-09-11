---
name: Authenticated Expo preview checks
description: Managed Expo handoff checks do not prove authenticated mobile queue flows without a disposable test account.
---

Use the managed Expo handoff check and a rendered preview to validate launcher, bundle, and unauthenticated startup behavior. Do not bypass the mobile login or seed a session token merely to exercise an authenticated queue.

**Why:** The preview can launch successfully while the protected queue remains untestable without account credentials; bypassing authentication would make the evidence misleading and could expose private data.

**How to apply:** For authenticated physical-device acceptance, arrange a disposable test account and record the device interaction separately. Otherwise report the handoff and privacy-contract checks, plus the missing authenticated-device evidence.