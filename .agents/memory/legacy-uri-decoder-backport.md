---
name: Legacy URI decoder backport
description: Compatibility constraints for securing the decoder used by query-string 7.
---

The legacy query-string dependency requires a CommonJS URI decoder and expects `+` to normalize to a space before percent decoding. A secure backport must preserve both behaviors while replacing the recursive malformed-input fallback.

**Why:** The upstream patched decoder release is ESM-only and removed plus normalization. Substituting it directly either breaks `require()` or silently changes form/query parsing.

**How to apply:** When changing this dependency chain, test the nested query-string import with plus-encoded spaces and malformed percent sequences, as well as the vulnerability audit.