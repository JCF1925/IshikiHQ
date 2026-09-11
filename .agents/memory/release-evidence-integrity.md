---
name: Release evidence integrity
description: Tamper detection for retained sign-in acceptance evidence.
---

Each retained sign-in evidence file must be bound to its exact byte content by a
privacy-safe SHA-256 digest in the release record. Recompute the digest during
approval, reject changed files, duplicate content at another retained path, and
approved metadata that no longer matches the accepted attempt.

**Why:** A passed evidence file can be edited after review without changing its
path or redacted assertions. Path-only approval does not preserve the
relationship between the reviewer and the bytes that were reviewed.

**How to apply:** Version the release-record schema when adding integrity
metadata, keep failure output aggregate-only, and test mode changes, content
changes, duplicate files, and approved-digest mismatches.