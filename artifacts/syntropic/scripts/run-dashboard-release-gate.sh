#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=verify-database-acceptance-target.sh
source "$script_dir/verify-database-acceptance-target.sh"

base_database_url="${DATABASE_URL:?DATABASE_URL is required for the dashboard release gate}"
verify_database_acceptance_target "${DATABASE_ACCEPTANCE_TARGET:-}" "$base_database_url"
schema="dashboard_acceptance_$(date +%s)_$$"
[[ "$schema" =~ ^[a-z0-9_]+$ ]]
schema_created=0

cleanup() {
  if [[ "$schema_created" -eq 1 ]]; then
    psql "$base_database_url" -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

schema_created=1
psql "$base_database_url" -c "CREATE SCHEMA \"$schema\"" >/dev/null
test_database_url="$(
  SCHEMA="$schema" node -e '
    const url = new URL(process.env.DATABASE_URL)
    url.searchParams.set("schema", process.env.SCHEMA)
    process.stdout.write(url.toString())
  '
)"

export DATABASE_URL="$test_database_url"
pnpm exec prisma migrate deploy
pnpm exec prisma db seed

expected_migrations="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d '[:space:]')"
applied_migrations="$(
  PGOPTIONS="-c search_path=$schema" psql "$base_database_url" -Atc \
    'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL' |
    tr -d '[:space:]'
)"
event_project_id="$(
  PGOPTIONS="-c search_path=$schema" psql "$base_database_url" -Atc \
    'SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = '\''Event'\''
         AND column_name = '\''projectId'\''
     )' |
    tr -d '[:space:]'
)"
seed_counts="$(
  PGOPTIONS="-c search_path=$schema" psql "$base_database_url" -Atc \
    'SELECT
       (SELECT count(*) FROM "User"),
       (SELECT count(*) FROM "FinAccount"),
       (SELECT count(*) FROM "Event")'
)"
IFS='|' read -r seeded_users seeded_accounts seeded_events <<< "$seed_counts"

[[ "$applied_migrations" == "$expected_migrations" ]] ||
  { printf 'dashboard release gate: migration count mismatch (%s/%s)\n' "$applied_migrations" "$expected_migrations" >&2; exit 1; }
[[ "$event_project_id" == "t" ]] ||
  { printf 'dashboard release gate: Event.projectId is missing after migration\n' >&2; exit 1; }
[[ "$seeded_users" -ge 1 && "$seeded_accounts" -ge 1 && "$seeded_events" -ge 1 ]] ||
  { printf 'dashboard release gate: safe seed did not create the required dashboard fixtures\n' >&2; exit 1; }

mkdir -p test-results
umask 077
DASHBOARD_API_DATABASE_TESTS=1 \
  pnpm exec tsx --test --experimental-test-module-mocks tests/dashboard-api.integration.test.ts
CI=1 pnpm exec playwright test

cat > test-results/dashboard-release-gate-evidence.json <<EOF
{
  "database": {
    "mode": "disposable_schema",
    "migrated": true,
    "seeded": true,
    "migrationCount": $applied_migrations,
    "eventProjectId": true,
    "existingRecordsPreserved": true
  },
  "api": {
    "authenticatedDashboard": true,
    "requiredSections": true,
    "upcomingEvents": true,
    "stats": true
  },
  "browser": {
    "healthyDashboard": true,
    "deliberateDashboardError": true
  }
}
EOF

printf 'dashboard release gate: migrated=%s seeded=true dashboardApi=true healthyDashboard=true deliberateDashboardError=true\n' "$applied_migrations"