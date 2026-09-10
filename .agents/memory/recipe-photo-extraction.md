---
name: Recipe photo extraction
description: Recipe-card imports need a bounded vision path with local OCR fallback and no persisted source bytes.
---

Recipe-card extraction should remain a review-only transformation: validate image type, size, and magic bytes, prefer the configured vision service, and keep a constrained local OCR fallback for service outages. Never persist the source image or extracted preview before the user confirms it.

**Why:** Hosted AI configuration and package installation can be unavailable in development or during an outage, but household members still need a safe failure/recovery path without exposing process errors.

**How to apply:** Keep OCR limited to recipe-card imports, normalize failures to user-safe messages, and route confirmation through the existing household recipe create/audit transaction.