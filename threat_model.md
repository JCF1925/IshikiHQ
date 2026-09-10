# Threat Model

## Project Overview

Ishiki is a private personal operating system for Australian users managing financial,
health, calendar, study, work, mobile-sync, and household information. The production
application is a Next.js/TypeScript service backed by PostgreSQL through Prisma, with
NextAuth credential and optional Google authentication. It integrates with S3-compatible
object storage, Google Calendar, banking/provider adapters, mobile clients, and Apple
Health imports.

## Assets

- **Identity and sessions** — password hashes, OAuth tokens, session/JWT material, email
  addresses, and provider account identifiers permit impersonation if disclosed.
- **Health and financial data** — pathology reports, medication and health observations,
  bank transactions, tax records, account details, and uploaded documents are highly
  sensitive personal information.
- **Private workspace and shared household data** — tasks, events, study/work records, and
  household resources must retain correct ownership and membership boundaries.
- **Integration and mobile credentials** — provider credential references, sync cursors,
  device session hashes, and push tokens grant capabilities outside the web application.
- **Audit and consent evidence** — append-only financial, calendar, pathology, mobile,
  household, export, and deletion records support user control and repudiation resistance.
- **Application secrets and storage objects** — database, auth, provider, and object-storage
  secrets plus private object keys must remain server-side.

## Trust Boundaries

- **Browser/mobile to API** — all bodies, identifiers, file metadata, sync payloads, and
  authorization claims from clients are untrusted. Authentication never substitutes for
  record- or household-level authorization.
- **Public to authenticated routes** — login/signup and provider callbacks are public;
  personal, export, upload, integration, and destructive APIs require a validated identity.
- **Bearer token to private resource** — calendar feeds, QR lookups, invitations, and
  OAuth state may bypass a conventional session and therefore require high-entropy,
  purpose-bound, expiring or revocable tokens.
- **Private user to household** — membership conveys only explicit household capabilities;
  health, tax, integration credentials, and private workspace records never cross it.
- **Application to PostgreSQL/object storage** — the server has broad authority. Queries
  must be owner-scoped, uploaded objects private and bounded, and deletion coordinated
  across both stores.
- **Application to providers** — Calendar, banking, email, push, and object-storage calls
  cross into independently operated systems. Credentials and health/financial payloads
  must not enter logs or user-visible errors.
- **Development to production** — feedback and test/seed surfaces are development-only and
  must not become reachable production capabilities.
- **Private deployment boundary** — platform access controls reduce public exposure but
  never replace application-layer authentication and authorization for allowed users.

## Scan Anchors

- Production entry points: `artifacts/syntropic/app`, `artifacts/syntropic/auth.ts`, and
  `artifacts/syntropic/middleware.ts`.
- Highest-risk areas: `app/api/account`, `app/api/upload`, `app/api/mobile`,
  `app/api/households`, `lib/s3.ts`, calendar/Redbark provider services, and
  `prisma/schema.prisma`.
- Public surfaces are auth/signup and OAuth callbacks; `/api` personal data routes are
  authenticated; household administration is capability-based rather than a global admin.
- `artifacts/api-server/src` currently exposes health only; `artifacts/mockup-sandbox`
  should be treated as development-only unless a production entry point proves otherwise.
- `tests`, seed code, and development feedback facilities are non-production unless an
  entry point proves otherwise.

## Threat Categories

### Spoofing

Stolen sessions, provider callbacks, or mobile device tokens could impersonate a user.
Protected routes MUST validate server-side authentication, provider callbacks MUST bind
state and verified identities, mobile tokens MUST be hashed/revocable/expiring, and
destructive account deletion MUST require authentication established within the recent
step-up window.

### Tampering

Client-controlled IDs, status changes, recurrence/provider payloads, and file metadata
could corrupt private or shared data. Every write MUST use bounded schema validation and
owner/capability checks. Presigned uploads MUST bind an allowed content type, declared
positive size, SHA-256 checksum, private encryption headers, safe owner-scoped key, and
short expiry; completion consumers MUST verify stored metadata before trust.

### Repudiation

Financial state transitions, sharing, consent, exports, and deletion are consequential.
They MUST create privacy-safe audit records with actor, action, status, and timestamp.
Deletion audit evidence MUST survive deletion without retaining email, payloads,
credentials, or reversible personal identifiers. Audit records MUST not be silently
discarded when cleanup fails.

### Information Disclosure

Owner-ID mistakes, shared-resource overreach, public objects, exports, logs, or verbose
provider failures could reveal financial or health data. Queries MUST enforce ownership
or active household capabilities. Objects MUST be private by default and downloaded with
short-lived URLs. Account exports MUST be no-store, enumerate their scope, and exclude
password/session/OAuth/provider credentials, push tokens, and raw binary payloads.
Production diagnostics MUST use identifiers and status metadata, never secrets or private
payloads.

### Denial of Service

Unbounded uploads, imports, sync batches, expensive exports, and provider retries can
exhaust storage or workers. Request schemas MUST impose count/size limits, presigned
uploads MUST declare a bounded content length, public/auth endpoints MUST be rate-limited,
and provider work MUST have timeouts, bounded retries, idempotency, and dead-letter states.

### Elevation of Privilege

Guessable record IDs, stale household memberships, client-only role checks, unsafe object
keys, or leaked provider credentials could expand authority. Authorization MUST be applied
at each data access, removed memberships MUST revoke access immediately, server-side
credentials MUST never be returned, and object keys MUST reject absolute/traversal
segments. Account deletion MUST explicitly block unresolved shared ownership rather than
implicitly cascading into other users' records.