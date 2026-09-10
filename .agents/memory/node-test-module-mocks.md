---
name: Node test module mocks
description: Node 24 invocation behavior for tests that use node:test module mocking.
---

Tests using `mock.module` from `node:test` need Node's `--experimental-test-module-mocks` flag passed directly to the Node process. Node 24 rejects this flag when it is supplied through `NODE_OPTIONS`.

**Why:** The mobile API acceptance suite imports `mock.module` before its database skip gate, so an otherwise disabled suite fails at startup without the direct flag.

**How to apply:** Use `node --experimental-test-module-mocks --import tsx --test ...` when running TypeScript acceptance tests that use module mocking. Keep the suite's own database gate disabled for read-only validation.