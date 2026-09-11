---
name: Mobile API acceptance authentication
description: Targeted mobile API integration runs must preserve the suite's authenticated device setup.
---

When filtering the mobile API integration suite by test name, include the existing device-session login case or seed the shared access token through an equivalent setup before exercising protected routes.

**Why:** The suite's later tests reuse a token initialized by the login test; filtering only a protected replay test otherwise produces a misleading 401 before reaching the behavior under test.

**How to apply:** Run the login bootstrap together with a targeted test, or run the full suite, when validating authenticated mobile API acceptance against a disposable migrated schema.