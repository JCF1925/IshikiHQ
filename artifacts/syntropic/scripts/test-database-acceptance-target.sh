#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-database-target-wrapper.XXXXXX")"
fake_bin="$test_root/bin"
call_log="$test_root/calls.log"
output_file="$test_root/output.log"
mkdir -p "$fake_bin"
touch "$call_log"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

cat >"$fake_bin/psql" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'psql %s\n' "$*" >>"${DATABASE_TARGET_WRAPPER_CALL_LOG:?}"
printf '%s\n' "${DATABASE_TARGET_WRAPPER_DATABASE_TARGET:-}"
SH
chmod +x "$fake_bin/psql"

run_check() {
  local configured_target="$1"
  local database_target="$2"
  local status=0

  : >"$call_log"
  (
    DATABASE_URL='postgresql://user:password@database.example.test/syntropic_acceptance' \
      DATABASE_TARGET_WRAPPER_CALL_LOG="$call_log" \
      DATABASE_TARGET_WRAPPER_DATABASE_TARGET="$database_target" \
      PATH="$fake_bin:$PATH" \
      bash -c "
        source '$script_dir/verify-database-acceptance-target.sh'
        verify_database_acceptance_target '$configured_target'
      " >"$output_file" 2>&1
  ) || status=$?
  printf '%s\n' "$status"
}

[[ "$(run_check disposable disposable)" == "0" ]] ||
  { printf 'matching database target was rejected\n' >&2; exit 1; }
[[ "$(run_check release-validation release-validation)" == "0" ]] ||
  { printf 'matching release target was rejected\n' >&2; exit 1; }

for configured_target in "" shared-development invalid; do
  status="$(run_check "$configured_target" disposable)"
  [[ "$status" -ne 0 ]] ||
    { printf 'invalid configured target was accepted\n' >&2; exit 1; }
done
status="$(run_check disposable '')"
[[ "$status" -ne 0 ]] ||
  { printf 'missing database target was accepted\n' >&2; exit 1; }
status="$(run_check disposable shared-development)"
[[ "$status" -ne 0 ]] ||
  { printf 'shared database target was accepted\n' >&2; exit 1; }

if grep -Eq 'postgresql://|disposable|release-validation|shared-development' "$output_file"; then
  printf 'target wrapper exposed connection or identity details\n' >&2
  exit 1
fi

printf 'Database acceptance target identity wrapper regression: PASS\n'