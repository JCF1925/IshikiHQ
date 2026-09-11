#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=verify-database-acceptance-target.sh
source "$script_dir/verify-database-acceptance-target.sh"

evidence_file="${DATABASE_ACCEPTANCE_EVIDENCE_FILE:-}"
failure_category="connection"
acceptance_focus="${DATABASE_ACCEPTANCE_FOCUS:-}"
schema_created=0

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -n "$evidence_file" ]]; then
    bash scripts/write-database-acceptance-evidence.sh \
      "$evidence_file" connection failed 1
  fi
  printf 'clean database acceptance: DATABASE_URL is required\n' >&2
  exit 1
fi

run_acceptance_step() {
  local category="$1"
  local description="$2"
  shift 2

  failure_category="$category"
  printf 'clean database acceptance: %s\n' "$description"
  local output_file="$fixture_root/acceptance-step-${step_number}.output"
  step_number=$((step_number + 1))
  if ! "$@" >"$output_file" 2>&1; then
    printf 'clean database acceptance: FAILED during %s\n' "$description" >&2
    return 1
  fi
}

run_health_claim_acceptance() {
  run_acceptance_step \
    'test' \
    'account-deletion cleanup database acceptance' \
    env DATABASE_URL="$test_database_url" HEALTH_CLAIM_DATABASE_TESTS=1 HEALTH_FUNDING_SUMMARY_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/health-claims-import.test.ts tests/health-funding-summary.test.ts
}

run_price_watch_acceptance() {
  run_acceptance_step \
    'test' \
    'price-watch privacy database acceptance' \
    env DATABASE_URL="$test_database_url" PRICE_WATCH_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/price-watch-database.test.ts
}

run_storage_label_acceptance() {
  run_acceptance_step \
    'test' \
    'storage label revocation database acceptance' \
    env DATABASE_URL="$test_database_url" STORAGE_LABEL_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/storage-labels-database.test.ts
}

run_appointment_care_acceptance() {
  run_acceptance_step \
    'test' \
    'appointment-care privacy database acceptance' \
    env DATABASE_URL="$test_database_url" APPOINTMENT_CARE_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/appointment-care-db.test.ts
}

run_calendar_connection_acceptance() {
  run_acceptance_step \
    'test' \
    'calendar reconnect database acceptance' \
    env DATABASE_URL="$test_database_url" CALENDAR_CONNECTION_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/calendar-connections-database.test.ts
}

run_calendar_route_acceptance() {
  run_acceptance_step \
    'test' \
    'calendar route privacy database acceptance' \
    env DATABASE_URL="$test_database_url" CALENDAR_ROUTE_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/calendar-provider.test.ts
}

run_calendar_event_lifecycle_acceptance() {
  run_acceptance_step \
    'test' \
    'calendar event lifecycle database acceptance' \
    env DATABASE_URL="$test_database_url" CALENDAR_EVENT_LIFECYCLE_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/calendar-event-lifecycle.test.ts
}

run_interpersonal_debt_acceptance() {
  run_acceptance_step \
    'test' \
    'interpersonal debt database acceptance' \
    env DATABASE_URL="$test_database_url" INTERPERSONAL_DEBT_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/interpersonal-debt-db.test.ts
}

run_pharmacy_refill_acceptance() {
  run_acceptance_step \
    'test' \
    'pharmacy refill database acceptance' \
    env DATABASE_URL="$test_database_url" PHARMACY_REFILL_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/pharmacy-refill-db.test.ts
}

run_referral_usage_acceptance() {
  run_acceptance_step \
    'test' \
    'referral usage database acceptance' \
    env DATABASE_URL="$test_database_url" REFERRAL_DATABASE_TESTS=1 \
    pnpm exec tsx --test --experimental-test-module-mocks tests/referral-usage-database.test.ts
}

run_signup_destination_acceptance() {
  run_acceptance_step \
    'test' \
    'signup protected-destination browser acceptance' \
    env DATABASE_URL="$test_database_url" CI=1 \
    SIGNUP_DESTINATION_ACCEPTANCE=1 \
    SIGNUP_DESTINATION_ACCEPTANCE_SCHEMA="$schema" \
    pnpm exec playwright test --project=signup-destination
}

schema="acceptance_$(date +%s)_$$"
[[ "$schema" =~ ^[a-z0-9_]+$ ]]
fixture_root="$(mktemp -d)"
step_number=1
# Set this before CREATE so an interrupted or failed CREATE is still followed
# by a safe DROP IF EXISTS for this unique schema name.
schema_created=1

cleanup() {
  local exit_status="$1"

  if ! rm -rf "$fixture_root"; then
    printf 'clean database acceptance: failed to remove temporary migration fixture\n' >&2
    exit_status=1
  fi

  if [[ "$schema_created" -eq 1 ]] && ! psql "$DATABASE_URL" \
    -c "DROP SCHEMA IF EXISTS \"$schema\" CASCADE" >/dev/null 2>&1; then
    printf 'clean database acceptance: failed to remove disposable schema\n' >&2
    exit_status=1
  fi

  printf '%s' "$exit_status"
}

finish() {
  local exit_status=$?
  local result_category="$failure_category"
  local result_status="failed"

  exit_status="$(cleanup "$exit_status")"
  if [[ "$exit_status" -eq 0 ]]; then
    result_category="none"
    result_status="passed"
  fi
  if [[ -n "$evidence_file" ]]; then
    bash scripts/write-database-acceptance-evidence.sh \
      "$evidence_file" "$result_category" "$result_status" "$exit_status"
  fi
  exit "$exit_status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

run_acceptance_step \
  'test' \
  'Prisma client generation' \
  pnpm run prisma:generate

failure_category="connection"
verify_database_acceptance_target "${DATABASE_ACCEPTANCE_TARGET:-}"
psql "$DATABASE_URL" -c "CREATE SCHEMA \"$schema\"" >/dev/null
test_database_url="$(
  SCHEMA="$schema" node -e '
    const url = new URL(process.env.DATABASE_URL)
    url.searchParams.set("schema", process.env.SCHEMA)
    process.stdout.write(url.toString())
  '
)"

# Build a migration directory that stops before the fingerprint uniqueness and
# ownership protections existed. This lets the fixture insert the kind of rows
# that can only be present in a legacy database, before the complete migration
# set is applied below.
legacy_schema="$fixture_root/schema.prisma"
cp prisma/schema.prisma "$legacy_schema"
mkdir "$fixture_root/migrations"
cp prisma/migrations/migration_lock.toml "$fixture_root/migrations/"
for migration in prisma/migrations/*; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" > "20261010000000_health_claim_fingerprint_uniqueness" ]]; then
    continue
  fi
  case "$migration_name" in
    20260908060000_health_claim_import_row_owner_integrity|20261006000000_health_claim_import_row_ownership_immutable|20261006000002_health_claim_import_row_owner_updates|20261006000003_health_claim_import_owner_updates|20261010000000_health_claim_fingerprint_uniqueness)
      continue
      ;;
  esac
  [[ "$migration_name" == "migration_lock.toml" ]] || cp -R "$migration" "$fixture_root/migrations/"
done

run_acceptance_step \
  'migration' \
  'legacy migration deployment in disposable schema' \
  env DATABASE_URL="$test_database_url" pnpm exec prisma migrate deploy --schema "$legacy_schema"

legacy_owner_id="legacy_health_claim_owner_${schema}"
legacy_other_user_id="legacy_health_claim_other_${schema}"
legacy_import_id="legacy_health_claim_import_${schema}"
legacy_row_id="legacy_health_claim_row_${schema}"
legacy_owner_email="legacy-health-owner-${schema}@example.test"
legacy_other_email="legacy-health-other-${schema}@example.test"
legacy_claim_payload="legacy-health-claim-payload-${schema}"
legacy_storage_key="legacy-health-source-${schema}"
legacy_policy_id="legacy_health_claim_policy_${schema}"
legacy_other_policy_id="legacy_health_claim_other_policy_${schema}"
legacy_medicare_first_id="legacy_health_claim_medicare_first_${schema}"
legacy_medicare_second_id="legacy_health_claim_medicare_second_${schema}"
legacy_other_medicare_first_id="legacy_health_claim_other_medicare_first_${schema}"
legacy_other_medicare_second_id="legacy_health_claim_other_medicare_second_${schema}"
legacy_medicare_tie_a_id="legacy_health_claim_medicare_tie_a_${schema}"
legacy_medicare_tie_b_id="legacy_health_claim_medicare_tie_b_${schema}"
legacy_phi_first_id="legacy_health_claim_phi_first_${schema}"
legacy_phi_second_id="legacy_health_claim_phi_second_${schema}"
legacy_other_phi_first_id="legacy_health_claim_other_phi_first_${schema}"
legacy_other_phi_second_id="legacy_health_claim_other_phi_second_${schema}"
legacy_phi_tie_a_id="legacy_health_claim_phi_tie_a_${schema}"
legacy_phi_tie_b_id="legacy_health_claim_phi_tie_b_${schema}"
legacy_medicare_fingerprint="legacy-medicare-fingerprint-${schema}"
legacy_phi_fingerprint="legacy-phi-fingerprint-${schema}"
legacy_medicare_tie_fingerprint="legacy-medicare-tie-fingerprint-${schema}"
legacy_phi_tie_fingerprint="legacy-phi-tie-fingerprint-${schema}"

# Insert the mismatch while the legacy schema has no ownership trigger. Keep
# all values private markers so the assertions below can prove the check does
# not print payloads or user identifiers.
PGOPTIONS="-c search_path=$schema" psql \
  --no-psqlrc \
  --quiet \
  --set=ON_ERROR_STOP=1 \
  --variable="owner_id=$legacy_owner_id" \
  --variable="other_user_id=$legacy_other_user_id" \
  --variable="import_id=$legacy_import_id" \
  --variable="row_id=$legacy_row_id" \
  --variable="owner_email=$legacy_owner_email" \
  --variable="other_email=$legacy_other_email" \
  --variable="claim_payload=$legacy_claim_payload" \
  --variable="storage_key=$legacy_storage_key" \
  --variable="policy_id=$legacy_policy_id" \
  --variable="other_policy_id=$legacy_other_policy_id" \
  --variable="medicare_first_id=$legacy_medicare_first_id" \
  --variable="medicare_second_id=$legacy_medicare_second_id" \
  --variable="other_medicare_first_id=$legacy_other_medicare_first_id" \
  --variable="other_medicare_second_id=$legacy_other_medicare_second_id" \
  --variable="medicare_tie_a_id=$legacy_medicare_tie_a_id" \
  --variable="medicare_tie_b_id=$legacy_medicare_tie_b_id" \
  --variable="phi_first_id=$legacy_phi_first_id" \
  --variable="phi_second_id=$legacy_phi_second_id" \
  --variable="other_phi_first_id=$legacy_other_phi_first_id" \
  --variable="other_phi_second_id=$legacy_other_phi_second_id" \
  --variable="phi_tie_a_id=$legacy_phi_tie_a_id" \
  --variable="phi_tie_b_id=$legacy_phi_tie_b_id" \
  --variable="medicare_fingerprint=$legacy_medicare_fingerprint" \
  --variable="phi_fingerprint=$legacy_phi_fingerprint" \
  --variable="medicare_tie_fingerprint=$legacy_medicare_tie_fingerprint" \
  --variable="phi_tie_fingerprint=$legacy_phi_tie_fingerprint" \
  "$DATABASE_URL" >/dev/null 2>&1 <<'SQL'
INSERT INTO "User" ("id", "email", "updatedAt")
VALUES
  (:'owner_id', :'owner_email', CURRENT_TIMESTAMP),
  (:'other_user_id', :'other_email', CURRENT_TIMESTAMP);

INSERT INTO "HealthClaimImport" (
  "id",
  "userId",
  "kind",
  "fileName",
  "contentType",
  "byteSize",
  "sha256",
  "storageKey",
  "status",
  "detectedFields",
  "updatedAt"
)
VALUES (
  :'import_id',
  :'owner_id',
  'medicare',
  'legacy-health-claim.csv',
  'text/csv',
  128,
  repeat('a', 64),
  :'storage_key',
  'review',
  '["description"]'::jsonb,
  CURRENT_TIMESTAMP
);

INSERT INTO "HealthClaimImportRow" (
  "id",
  "importId",
  "userId",
  "rowNumber",
  "fingerprint",
  "data",
  "status",
  "updatedAt"
)
VALUES (
  :'row_id',
  :'import_id',
  :'other_user_id',
  1,
  'legacy-health-claim-fingerprint',
  jsonb_build_object('description', :'claim_payload'),
  'valid',
  CURRENT_TIMESTAMP
);

INSERT INTO "PhiPolicy" (
  "id",
  "userId",
  "policyName",
  "updatedAt"
)
VALUES (
  :'policy_id',
  :'owner_id',
  'Legacy private health policy',
  CURRENT_TIMESTAMP
);

INSERT INTO "PhiPolicy" (
  "id",
  "userId",
  "policyName",
  "updatedAt"
)
VALUES (
  :'other_policy_id',
  :'other_user_id',
  'Legacy private health policy for second user',
  CURRENT_TIMESTAMP
);

INSERT INTO "MedicareClaim" (
  "id",
  "userId",
  "serviceDate",
  "description",
  "importFingerprint",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    :'medicare_first_id',
    :'owner_id',
    TIMESTAMP '2026-01-01 09:00:00',
    'Legacy Medicare claim retained first',
    :'medicare_fingerprint',
    TIMESTAMP '2026-01-01 09:00:00',
    TIMESTAMP '2026-01-01 09:00:00'
  ),
  (
    :'medicare_second_id',
    :'owner_id',
    TIMESTAMP '2026-01-02 09:00:00',
    'Legacy Medicare claim retained as history',
    :'medicare_fingerprint',
    TIMESTAMP '2026-01-02 09:00:00',
    TIMESTAMP '2026-01-02 09:00:00'
   ),
   (
     :'other_medicare_first_id',
     :'other_user_id',
     TIMESTAMP '2026-01-03 09:00:00',
     'Legacy Medicare claim for second user retained first',
     :'medicare_fingerprint',
     TIMESTAMP '2026-01-03 09:00:00',
     TIMESTAMP '2026-01-03 09:00:00'
   ),
   -- These claims have the same timestamp; the migration must use the
   -- lexicographically lowest ID as the stable fingerprint owner.
   (
     :'medicare_tie_a_id',
     :'owner_id',
     TIMESTAMP '2026-01-03 09:00:00',
     'Legacy Medicare claim tied on creation time A',
     :'medicare_tie_fingerprint',
     TIMESTAMP '2026-01-03 09:00:00',
     TIMESTAMP '2026-01-03 09:00:00'
   ),
   (
     :'other_medicare_second_id',
     :'other_user_id',
     TIMESTAMP '2026-01-04 09:00:00',
     'Legacy Medicare claim for second user retained as history',
     :'medicare_fingerprint',
     TIMESTAMP '2026-01-04 09:00:00',
     TIMESTAMP '2026-01-04 09:00:00'
   ),
   (
     :'medicare_tie_b_id',
     :'owner_id',
     TIMESTAMP '2026-01-03 09:00:00',
     'Legacy Medicare claim tied on creation time B',
     :'medicare_tie_fingerprint',
     TIMESTAMP '2026-01-03 09:00:00',
     TIMESTAMP '2026-01-03 09:00:00'
  );

INSERT INTO "PhiClaim" (
  "id",
  "userId",
  "policyId",
  "serviceDate",
  "description",
  "importFingerprint",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    :'phi_first_id',
    :'owner_id',
    :'policy_id',
    TIMESTAMP '2026-02-01 09:00:00',
    'Legacy private health claim retained first',
    :'phi_fingerprint',
    TIMESTAMP '2026-02-01 09:00:00',
    TIMESTAMP '2026-02-01 09:00:00'
  ),
  (
    :'phi_second_id',
    :'owner_id',
    :'policy_id',
    TIMESTAMP '2026-02-02 09:00:00',
    'Legacy private health claim retained as history',
    :'phi_fingerprint',
    TIMESTAMP '2026-02-02 09:00:00',
    TIMESTAMP '2026-02-02 09:00:00'
   ),
   (
     :'other_phi_first_id',
     :'other_user_id',
     :'other_policy_id',
     TIMESTAMP '2026-02-03 09:00:00',
     'Legacy private health claim for second user retained first',
     :'phi_fingerprint',
     TIMESTAMP '2026-02-03 09:00:00',
     TIMESTAMP '2026-02-03 09:00:00'
   ),
   (
     :'phi_tie_a_id',
     :'owner_id',
     :'policy_id',
     TIMESTAMP '2026-02-03 09:00:00',
     'Legacy private health claim tied on creation time A',
     :'phi_tie_fingerprint',
     TIMESTAMP '2026-02-03 09:00:00',
     TIMESTAMP '2026-02-03 09:00:00'
   ),
   (
     :'other_phi_second_id',
     :'other_user_id',
     :'other_policy_id',
     TIMESTAMP '2026-02-04 09:00:00',
     'Legacy private health claim for second user retained as history',
     :'phi_fingerprint',
     TIMESTAMP '2026-02-04 09:00:00',
     TIMESTAMP '2026-02-04 09:00:00'
   ),
   (
     :'phi_tie_b_id',
     :'owner_id',
     :'policy_id',
     TIMESTAMP '2026-02-03 09:00:00',
     'Legacy private health claim tied on creation time B',
     :'phi_tie_fingerprint',
     TIMESTAMP '2026-02-03 09:00:00',
     TIMESTAMP '2026-02-03 09:00:00'
  );
SQL

# Apply the real migration set, including the fingerprint uniqueness migration.
# The duplicate claim rows must survive while later rows lose their
# fingerprints, leaving exactly one deduplication owner for each user and
# fingerprint.
run_acceptance_step \
  'migration' \
  'committed migration deployment in disposable schema' \
  env DATABASE_URL="$test_database_url" pnpm exec prisma migrate deploy

run_acceptance_step \
  'test' \
  'historical health claim fingerprint migration acceptance' \
  env PGOPTIONS="-c search_path=$schema" psql \
  --no-psqlrc \
  --quiet \
  --set=ON_ERROR_STOP=1 \
  --variable="owner_id=$legacy_owner_id" \
  --variable="other_user_id=$legacy_other_user_id" \
  --variable="policy_id=$legacy_policy_id" \
  --variable="other_policy_id=$legacy_other_policy_id" \
  --variable="medicare_first_id=$legacy_medicare_first_id" \
  --variable="medicare_second_id=$legacy_medicare_second_id" \
  --variable="other_medicare_first_id=$legacy_other_medicare_first_id" \
  --variable="other_medicare_second_id=$legacy_other_medicare_second_id" \
  --variable="medicare_tie_a_id=$legacy_medicare_tie_a_id" \
  --variable="medicare_tie_b_id=$legacy_medicare_tie_b_id" \
  --variable="phi_first_id=$legacy_phi_first_id" \
  --variable="phi_second_id=$legacy_phi_second_id" \
  --variable="other_phi_first_id=$legacy_other_phi_first_id" \
  --variable="other_phi_second_id=$legacy_other_phi_second_id" \
  --variable="phi_tie_a_id=$legacy_phi_tie_a_id" \
  --variable="phi_tie_b_id=$legacy_phi_tie_b_id" \
  --variable="medicare_fingerprint=$legacy_medicare_fingerprint" \
  --variable="phi_fingerprint=$legacy_phi_fingerprint" \
   --variable="medicare_tie_fingerprint=$legacy_medicare_tie_fingerprint" \
   --variable="phi_tie_fingerprint=$legacy_phi_tie_fingerprint" \
  "$DATABASE_URL" <<SQL

DO \$\$
DECLARE
  medicare_total INTEGER;
  other_medicare_total INTEGER;
  phi_total INTEGER;
  other_phi_total INTEGER;
  medicare_owned INTEGER;
  other_medicare_owned INTEGER;
  phi_owned INTEGER;
  other_phi_owned INTEGER;
  medicare_first_fingerprint TEXT;
  medicare_second_fingerprint TEXT;
  other_medicare_first_fingerprint TEXT;
  other_medicare_second_fingerprint TEXT;
  medicare_tie_a_fingerprint TEXT;
  medicare_tie_b_fingerprint TEXT;
  phi_first_fingerprint TEXT;
  phi_second_fingerprint TEXT;
  other_phi_first_fingerprint TEXT;
  other_phi_second_fingerprint TEXT;
  phi_tie_a_fingerprint TEXT;
  phi_tie_b_fingerprint TEXT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE "importFingerprint" IS NOT NULL)
    INTO medicare_total, medicare_owned
    FROM "MedicareClaim"
   WHERE "userId" = '$legacy_owner_id'
     AND "id" IN ('$legacy_medicare_first_id', '$legacy_medicare_second_id');
  SELECT count(*), count(*) FILTER (WHERE "importFingerprint" IS NOT NULL)
    INTO other_medicare_total, other_medicare_owned
    FROM "MedicareClaim"
   WHERE "userId" = '$legacy_other_user_id'
     AND "id" IN ('$legacy_other_medicare_first_id', '$legacy_other_medicare_second_id');
  SELECT count(*), count(*) FILTER (WHERE "importFingerprint" IS NOT NULL)
    INTO phi_total, phi_owned
    FROM "PhiClaim"
   WHERE "userId" = '$legacy_owner_id'
     AND "id" IN ('$legacy_phi_first_id', '$legacy_phi_second_id');
  SELECT count(*), count(*) FILTER (WHERE "importFingerprint" IS NOT NULL)
    INTO other_phi_total, other_phi_owned
    FROM "PhiClaim"
   WHERE "userId" = '$legacy_other_user_id'
     AND "id" IN ('$legacy_other_phi_first_id', '$legacy_other_phi_second_id');

  IF medicare_total <> 2 OR medicare_owned <> 1
     OR other_medicare_total <> 2 OR other_medicare_owned <> 1 THEN
    RAISE EXCEPTION 'Medicare historical claims were not preserved with one fingerprint owner per user';
  END IF;
  IF phi_total <> 2 OR phi_owned <> 1
     OR other_phi_total <> 2 OR other_phi_owned <> 1 THEN
    RAISE EXCEPTION 'private-health historical claims were not preserved with one fingerprint owner per user';
  END IF;

  SELECT "importFingerprint" INTO medicare_first_fingerprint
    FROM "MedicareClaim" WHERE "id" = '$legacy_medicare_first_id';
  SELECT "importFingerprint" INTO medicare_second_fingerprint
    FROM "MedicareClaim" WHERE "id" = '$legacy_medicare_second_id';
  SELECT "importFingerprint" INTO other_medicare_first_fingerprint
    FROM "MedicareClaim" WHERE "id" = '$legacy_other_medicare_first_id';
  SELECT "importFingerprint" INTO other_medicare_second_fingerprint
    FROM "MedicareClaim" WHERE "id" = '$legacy_other_medicare_second_id';
  SELECT "importFingerprint" INTO phi_first_fingerprint
    FROM "PhiClaim" WHERE "id" = '$legacy_phi_first_id';
  SELECT "importFingerprint" INTO phi_second_fingerprint
    FROM "PhiClaim" WHERE "id" = '$legacy_phi_second_id';
  SELECT "importFingerprint" INTO other_phi_first_fingerprint
    FROM "PhiClaim" WHERE "id" = '$legacy_other_phi_first_id';
  SELECT "importFingerprint" INTO other_phi_second_fingerprint
    FROM "PhiClaim" WHERE "id" = '$legacy_other_phi_second_id';

  IF medicare_first_fingerprint IS DISTINCT FROM '$legacy_medicare_fingerprint'
     OR medicare_second_fingerprint IS NOT NULL
     OR other_medicare_first_fingerprint IS DISTINCT FROM '$legacy_medicare_fingerprint'
     OR other_medicare_second_fingerprint IS NOT NULL THEN
    RAISE EXCEPTION 'Medicare fingerprint ownership was not retained independently per user';
  END IF;
  IF phi_first_fingerprint IS DISTINCT FROM '$legacy_phi_fingerprint'
     OR phi_second_fingerprint IS NOT NULL
     OR other_phi_first_fingerprint IS DISTINCT FROM '$legacy_phi_fingerprint'
     OR other_phi_second_fingerprint IS NOT NULL THEN
    RAISE EXCEPTION 'private-health fingerprint ownership was not retained independently per user';
  END IF;

  IF (SELECT count(*) FROM "MedicareClaim"
       WHERE "importFingerprint" = '$legacy_medicare_fingerprint'
         AND "userId" IN ('$legacy_owner_id', '$legacy_other_user_id')) <> 2
     OR (SELECT count(*) FROM "PhiClaim"
       WHERE "importFingerprint" = '$legacy_phi_fingerprint'
         AND "userId" IN ('$legacy_owner_id', '$legacy_other_user_id')) <> 2 THEN
    RAISE EXCEPTION 'cross-user claim fingerprints were not accepted by the unique indexes';
  END IF;

  SELECT "importFingerprint" INTO medicare_tie_a_fingerprint
    FROM "MedicareClaim" WHERE "id" = '$legacy_medicare_tie_a_id';
  SELECT "importFingerprint" INTO medicare_tie_b_fingerprint
    FROM "MedicareClaim" WHERE "id" = '$legacy_medicare_tie_b_id';
  SELECT "importFingerprint" INTO phi_tie_a_fingerprint
    FROM "PhiClaim" WHERE "id" = '$legacy_phi_tie_a_id';
  SELECT "importFingerprint" INTO phi_tie_b_fingerprint
    FROM "PhiClaim" WHERE "id" = '$legacy_phi_tie_b_id';

  IF medicare_tie_a_fingerprint IS DISTINCT FROM '$legacy_medicare_tie_fingerprint'
     OR medicare_tie_b_fingerprint IS NOT NULL THEN
    RAISE EXCEPTION 'Medicare tied fingerprint ownership was not retained by the lowest ID';
  END IF;
  IF phi_tie_a_fingerprint IS DISTINCT FROM '$legacy_phi_tie_fingerprint'
     OR phi_tie_b_fingerprint IS NOT NULL THEN
    RAISE EXCEPTION 'private-health tied fingerprint ownership was not retained by the lowest ID';
  END IF;
END
\$\$;

DO \$\$
BEGIN
  BEGIN
    INSERT INTO "MedicareClaim" (
      "id",
      "userId",
      "serviceDate",
      "description",
      "importFingerprint",
      "updatedAt"
    )
    VALUES (
      'migration_duplicate_medicare_$schema',
      '$legacy_owner_id',
      CURRENT_TIMESTAMP,
      'Should be rejected',
      '$legacy_medicare_fingerprint',
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Medicare unique index accepted a duplicate fingerprint';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "MedicareClaim" (
      "id",
      "userId",
      "serviceDate",
      "description",
      "importFingerprint",
      "updatedAt"
    )
    VALUES (
      'migration_duplicate_other_medicare_$schema',
      '$legacy_other_user_id',
      CURRENT_TIMESTAMP,
      'Should be rejected',
      '$legacy_medicare_fingerprint',
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Medicare unique index accepted a duplicate fingerprint for the second user';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "PhiClaim" (
      "id",
      "userId",
      "policyId",
      "serviceDate",
      "description",
      "importFingerprint",
      "updatedAt"
    )
    VALUES (
      'migration_duplicate_phi_$schema',
      '$legacy_owner_id',
      '$legacy_policy_id',
      CURRENT_TIMESTAMP,
      'Should be rejected',
      '$legacy_phi_fingerprint',
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'private-health unique index accepted a duplicate fingerprint';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "PhiClaim" (
      "id",
      "userId",
      "policyId",
      "serviceDate",
      "description",
      "importFingerprint",
      "updatedAt"
    )
    VALUES (
      'migration_duplicate_other_phi_$schema',
      '$legacy_other_user_id',
      '$legacy_other_policy_id',
      CURRENT_TIMESTAMP,
      'Should be rejected',
      '$legacy_phi_fingerprint',
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'private-health unique index accepted a duplicate fingerprint for the second user';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END
\$\$;
SQL

# Seed the rest of the acceptance fixture after all migrations have applied.
run_acceptance_step \
  'seed' \
  'seeding disposable schema' \
  env DATABASE_URL="$test_database_url" pnpm exec prisma db seed
if [[ "$acceptance_focus" == "health-claims" ]]; then
  run_health_claim_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "price-watches" ]]; then
  run_price_watch_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "storage-labels" ]]; then
  run_storage_label_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "appointment-care" ]]; then
  run_appointment_care_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "calendar-connections" ]]; then
  run_calendar_connection_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "calendar-routes" ]]; then
  run_calendar_route_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "calendar-event-lifecycle" ]]; then
  run_calendar_event_lifecycle_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "interpersonal-debts" ]]; then
  run_interpersonal_debt_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "pharmacy-refills" ]]; then
  run_pharmacy_refill_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "referral-usage" ]]; then
  run_referral_usage_acceptance
  exit 0
fi
if [[ "$acceptance_focus" == "signup-destination" ]]; then
  run_signup_destination_acceptance
  exit 0
fi
run_price_watch_acceptance
run_appointment_care_acceptance
run_calendar_connection_acceptance
run_interpersonal_debt_acceptance
run_pharmacy_refill_acceptance
run_referral_usage_acceptance
run_acceptance_step \
  'test' \
  'calendar OAuth database acceptance' \
  env DATABASE_URL="$test_database_url" pnpm exec tsx scripts/calendar-oauth-acceptance.ts
run_calendar_route_acceptance
run_calendar_event_lifecycle_acceptance
run_acceptance_step \
  'test' \
  'calendar worker database acceptance' \
  env DATABASE_URL="$test_database_url" \
  pnpm exec tsx --test --experimental-test-module-mocks tests/calendar-worker.test.ts
run_acceptance_step \
  'test' \
  'real mobile API process account-deletion acceptance' \
  env DATABASE_URL="$DATABASE_URL" \
  MOBILE_API_ACCEPTANCE_DATABASE_URL="$test_database_url" \
  MOBILE_API_ACCEPTANCE_SCHEMA="$schema" \
  bash scripts/run-mobile-api-acceptance.sh
run_acceptance_step \
  'test' \
  'pay review database acceptance' \
  env DATABASE_URL="$test_database_url" PAY_REVIEW_DATABASE_TESTS=1 \
  pnpm exec tsx --test --experimental-test-module-mocks tests/work.test.ts
run_health_claim_acceptance
run_signup_destination_acceptance
run_acceptance_step \
  'test' \
  'recreated-account health dashboard browser acceptance' \
  env DATABASE_URL="$test_database_url" CI=1 RECREATED_ACCOUNT_ACCEPTANCE=1 \
  RECREATED_ACCOUNT_ACCEPTANCE_SCHEMA="$schema" GOOGLE_OAUTH_FIXTURE=1 \
  GOOGLE_OAUTH_FIXTURE_EMAIL="recreated-google-health-${schema}@example.test" \
  pnpm exec playwright test --project=recreated-account

failure_category="test"
PGOPTIONS="-c search_path=$schema" psql "$DATABASE_URL" -Atc \
  'SELECT (SELECT count(*) FROM "User"), (SELECT count(*) FROM "FinAccount"), (SELECT count(*) FROM "Transaction")' |
  awk -F'|' '{
    if ($1 < 1 || $2 < 1 || $3 < 1) exit 1
    printf "clean database acceptance: users=%s accounts=%s transactions=%s\n", $1, $2, $3
  }'

set +e
failure_category="ownership-check"
ownership_output="$(
  DATABASE_URL="$test_database_url" pnpm run ops:check-health-claims 2>&1
)"
ownership_status=$?
set -e

[[ "$ownership_status" -ne 0 ]] ||
  { printf 'health claim ownership acceptance: expected the release check to fail\n' >&2; exit 1; }
grep -Fq 'Health claim import ownership check: FAIL (1 mismatched row across 1 import)' <<<"$ownership_output" ||
  { printf 'health claim ownership acceptance: expected one aggregate mismatch\n' >&2; exit 1; }
for private_marker in \
  "$legacy_claim_payload" \
  "$legacy_storage_key" \
  "$legacy_owner_id" \
  "$legacy_other_user_id" \
  "$legacy_owner_email" \
  "$legacy_other_email"; do
  if grep -Fq -- "$private_marker" <<<"$ownership_output"; then
    printf 'health claim ownership acceptance: private fixture output detected\n' >&2
    exit 1
  fi
done
printf 'health claim ownership acceptance: legacy mismatch blocked release without private output\n'