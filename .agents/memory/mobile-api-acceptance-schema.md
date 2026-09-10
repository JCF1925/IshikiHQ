---
name: Mobile API acceptance schemas
description: Disposable mobile API tests combine Prisma migrations with Drizzle runtime connections.
---

Prisma accepts a disposable schema through the PostgreSQL URL `schema` parameter, but the Drizzle
API process must receive `PGOPTIONS=-c search_path=<schema>` to use that same schema.

**Why:** The API server's Drizzle connection does not interpret Prisma's schema URL parameter as a
search path, so an otherwise migrated acceptance database can appear empty or hit the shared schema.

**How to apply:** Migrate the fixture with the schema-qualified Prisma URL, then run API integration
tests with the original database URL plus a schema-specific `PGOPTIONS` value.

For a real API-process check, let the release database wrapper own the disposable schema lifecycle
and pass its schema-qualified URL and search path into the child process test; standalone runs may
create and clean up their own schema.

**Why:** Reusing the release fixture proves process-boundary routing against the same migrated
schema without adding a second workflow or allowing the child process to touch shared data.

**How to apply:** Keep the wrapper's external-schema mode and standalone mode separate, and make the
process test exercise authentication, deletion, and post-deletion requests only through the API.

When a migration references a table introduced by a later timestamped migration, defer that
foreign key with a guarded post-table migration rather than weakening the disposable acceptance
fixture or skipping migrations.

**Why:** Prisma deploys migrations lexicographically, so a fresh acceptance schema exposes ordering
mistakes that a long-lived database can hide.

**How to apply:** Keep the original migration deployable before its dependency, then add the
relationship in a later migration that safely no-ops when an existing database already has it.

The mobile integration suite shares one bearer token across concurrent subtests, so focused runs
must include the authentication test along with the endpoint test.

**Why:** Filtering to an endpoint test alone leaves the shared token empty and reports an
authentication failure instead of exercising the endpoint.

**How to apply:** Use the disposable-schema wrapper for the full suite, or include the session setup
test when narrowing coverage with a test-name pattern.

Mobile staging and sync entity identifiers are text columns at the SQL boundary even when test
fixtures use UUID-shaped values.

**Why:** Raw acceptance queries that cast those arrays to `uuid[]` fail on a fresh migrated schema
before the behavior under test can finish or clean up.

**How to apply:** Use `text[]` casts for `MobileRecord` and `MobileSyncChange` identifier arrays
in raw acceptance queries; reserve `uuid[]` for columns whose schema is explicitly UUID.