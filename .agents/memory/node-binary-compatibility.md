---
name: Node binary compatibility
description: Strict TypeScript compatibility between Node Buffer values and Web/API binary interfaces.
---

Prefer `Uint8Array` for binary data crossing Web APIs, SDKs, hashing, storage, and `Response` boundaries; convert to `Buffer` only at APIs that specifically require Node's Buffer type.

**Why:** With the project's Node 24 runtime and TypeScript dependencies, some `Buffer` values are not assignable to newer generic `Uint8Array`/`ArrayBufferView` signatures even though they work at runtime. Keeping the boundary value as `Uint8Array` avoids release typecheck failures.

**How to apply:** When handling uploaded files or generated response bodies, construct a `Uint8Array` from the Web `ArrayBuffer`, use it for hashing/storage/HTTP responses, and make an explicit `Buffer.from(...)` conversion only for parser APIs typed as `Buffer`.