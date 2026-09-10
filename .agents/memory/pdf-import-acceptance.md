---
name: PDF import acceptance
description: How to substantiate machine-readable PDF import support without relying on unrealistic fixtures.
---

PDF import acceptance must use a structurally valid document with compressed content streams and standard font encoding, parsed by the same proven extractor used in production. Plaintext surrounded by PDF header and footer markers is not evidence that real generated statements work.

**Why:** A raw-byte text scanner passed synthetic fixtures but could not read ordinary machine-readable PDFs whose text lived in compressed streams.

**How to apply:** For any PDF import change, keep a valid compressed fixture in focused parser coverage and exercise it through upload, review, and confirmation on a migrated disposable database.