---
name: Health-claim ownership alerts
description: Operational alerting constraints for database-enforced health-claim ownership violations.
---

Observe health-claim audit ownership-trigger failures at the Prisma boundary and report only an aggregate, sanitized operations event. Keep alert delivery asynchronous so an unavailable receiver cannot replace or materially delay the original database error; group repeated violations within a short process-local window.

**Why:** The database guard is the privacy boundary, while the application is the existing operational-alert delivery point. Alert payloads must not become a second path for claim contents, request bodies, credentials, or record identifiers.

**How to apply:** Extend the shared operations alert type and preserve the centralized database observer when adding related ownership guards. If deployment becomes multi-instance, replace the process-local grouping with a shared counter or receiver-side deduplication before relying on alert counts globally.