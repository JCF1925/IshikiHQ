---
name: Node test mocking under tsx
description: The repository's isolated integration tests use node:test module mocking that may not run through the current tsx loader.
---

The mobile API integration suite can fail before collection when invoked through the repository's `tsx` command if the active Node runtime does not expose `node:test.mock.module`.

**Why:** This is a runtime/tooling compatibility issue, not an application failure; treating it as a product regression can lead to unnecessary code changes.

**How to apply:** When validating those tests, confirm the Node/test-loader capability first and report this as a validation limitation if the suite cannot start. Continue with package typechecks and focused route or unit checks.