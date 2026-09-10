---
name: Browser acceptance database
description: Database setup constraints for authenticated browser acceptance in the Syntropic web app.
---

Authenticated browser journeys that exercise newer Prisma models must run against an isolated schema with the complete migration set and seeded login account. The shared development database can intentionally lag the repository and produce missing-table failures even when the application code is correct.

**Why:** Browser coverage against the shared database can fail before exercising the feature, and applying migrations there would couple test verification to shared development state.

**How to apply:** Create a uniquely named disposable schema from the configured PostgreSQL base, deploy all migrations, seed the browser account, run the test server with that schema, and always drop the schema and temporary server artifacts afterward.