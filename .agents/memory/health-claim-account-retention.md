---
name: Health-claim account retention
description: Account-deletion policy for imported health-claim records and review history.
---

Account deletion erases confirmed claim values, review-row payloads, and source objects. It retains each import as an ownership-detached tombstone and retains metadata-only review audit events with user references detached.

**Why:** Privacy erasure must remove health data while preserving enough lifecycle metadata to explain that an import existed and how it was reviewed.

**How to apply:** Any account-deletion path must delete claim rows and source files, redact the stored object key, detach import/audit ownership, and preserve audit fields without claim values. Use the transaction-local deletion marker when detaching immutable audit records.

The allowed tombstone projection is deliberately narrow: kind, status, content type, byte size, and lifecycle timestamps may remain. Filename, source hash, parser field/error metadata, and storage key are redacted; audit changed-fields metadata accepts only the known claim field names or the confirmation marker.

**Why:** Filenames, hashes, parser output, and storage paths can identify or reconstruct a sensitive source even after row values are erased.

**How to apply:** Keep the projection documented beside the Prisma models, enforce audit metadata shape at the database boundary, and make account deletion validate existing audit events before removing private objects.

Detached tombstones may remain readable to the former owner for lifecycle history, but every mutation lookup must require both the owner and a null deletion marker and return the generic not-found response. Mutation routes must not attempt source cleanup.

**Why:** Read-only retention does not grant an old session permission to edit, confirm, or delete a detached record, and cleanup against a redacted storage key could create a second privacy boundary failure.

**How to apply:** Keep GET behavior separate from PATCH/DELETE live-record lookups; test save, confirm, and delete against an account-deletion tombstone and assert storage and audit state are unchanged.

Portable account exports must omit HealthClaimImport, HealthClaimImportRow, and HealthClaimImportAudit models entirely, including detached tombstones.

**Why:** A deleted account's redacted lifecycle record is retained for internal auditability, not for authenticated user export; exporting it could reintroduce source identifiers, parser metadata, storage references, or review history.

**How to apply:** Keep health-claim import models out of the portable export allowlist and verify a post-deletion export contains no deleted-source or claim-value canaries.