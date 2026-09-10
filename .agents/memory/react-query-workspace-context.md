---
name: React Query workspace context
description: Preventing split TanStack Query contexts across pnpm workspace packages with different React peer variants.
---

When generated hooks live in a shared workspace package, export `QueryClient` and `QueryClientProvider` from that same package and use those exports in consumers.

**Why:** pnpm can install the same React Query version multiple times for different React peer versions. A provider from one resolved copy does not satisfy hooks from another, causing a runtime “No QueryClient set” error despite correct JSX nesting.

**How to apply:** If provider nesting is visibly correct, compare resolved package paths for the app and shared client. Keep hooks and provider on one module instance rather than globally forcing another artifact’s React version.