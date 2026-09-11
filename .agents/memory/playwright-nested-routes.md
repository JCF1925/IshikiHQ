---
name: Playwright nested route interception
description: Route-glob behavior for browser mocks that must cover secondary requests after a primary mutation.
---

A single `*` segment in a Playwright route glob does not cross `/`, so a handler for a resource item does not intercept deeper subresource endpoints.

**Why:** A browser edit can complete its primary mutation and then appear to fail when a required follow-up request escapes the mock and reaches the real server.

**How to apply:** When a UI mutation triggers nested follow-up requests, register explicit handlers for each endpoint depth and verify the complete request sequence, not only the primary write.