---
name: Release lint boundaries
description: Non-obvious boundaries for keeping the Syntropic release lint signal actionable.
---

Generated Playwright trace bundles and platform-managed client instrumentation are not application source and must stay outside the application lint target. The SSR safety linter also disables inline configuration, so exceptions for legitimate framework-boundary behavior belong in a narrow file-scoped rule override in the normal flat config.

**Why:** Linting generated trace JavaScript produces thousands of third-party findings, while inline suppressions appear as ineffective warnings in the SSR pass and hide whether a real application warning was fixed.

**How to apply:** Add generated output to the global flat-config ignore list, keep SSR safety rules enabled for source files, and use a documented file-specific override only when a framework rule cannot apply to that boundary.