---
name: Release evidence privacy tests
description: Keep privacy regression fixtures from introducing sensitive labels through wrapper-generated output paths.
---

When testing redacted release evidence, use neutral fixture paths, capture acceptance subprocess output, and assert the evidence file separately from wrapper summary output. Never stream assertion failures from private fixtures.

Any disposable database runner that can publish CI evidence must use the shared
allowlisted category/status/exit-code writer. Keep command output in a
mode-0600 temporary log and delete it before the runner exits; do not add
fixture counts, identifiers, URLs, or payloads to the shared artifact.

**Why:** Acceptance wrappers commonly print the configured evidence destination on failure; a fixture path containing a test target or identifier can look like a privacy leak even when the JSON is correctly redacted.

**How to apply:** Keep labels, targets, identifiers, and payload markers out of temporary evidence paths, suppress raw child-process output on failure, then inspect the serialized evidence for forbidden values and the original command status independently.