#!/usr/bin/env bash
set -euo pipefail

if ! command -v setsid >/dev/null 2>&1; then
  printf 'acceptance interruption test: setsid is required to isolate database acceptance interruption checks; install it or add it to PATH\n' >&2
  exit 1
fi

[[ -n "${DATABASE_URL:-}" ]] ||
  { printf 'acceptance interruption test: DATABASE_URL is required\n' >&2; exit 1; }

test_root="$(mktemp -d)"
runner_pid=""

cleanup() {
  local exit_status=$?

  if [[ -n "$runner_pid" ]] && kill -0 "$runner_pid" 2>/dev/null; then
    kill -TERM -- "-$runner_pid" 2>/dev/null || true
    wait "$runner_pid" 2>/dev/null || true
  fi
  rm -rf "$test_root"
  return "$exit_status"
}
trap cleanup EXIT

real_pnpm="$(command -v pnpm)"
cat >"$test_root/pnpm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "exec" && "${2:-}" == "prisma" && "${3:-}" == "migrate" ]]; then
  printf 'migration-started\n' >"$ACCEPTANCE_INTERRUPT_MARKER"
  trap 'exit 143' TERM INT
  while true; do
    sleep 1
  done
fi

exec "$ACCEPTANCE_REAL_PNPM" "$@"
SH
chmod +x "$test_root/pnpm"

output_file="$test_root/acceptance-output.log"
marker_file="$test_root/migration-started"

PATH="$test_root:$PATH" \
  ACCEPTANCE_REAL_PNPM="$real_pnpm" \
  ACCEPTANCE_INTERRUPT_MARKER="$marker_file" \
  setsid bash scripts/clean-database-acceptance.sh >"$output_file" 2>&1 &
runner_pid=$!

deadline=$((SECONDS + 30))
schema_name=""
while (( SECONDS < deadline )); do
  schema_name="$(
    psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align \
      --set=ON_ERROR_STOP=1 \
      -c "SELECT nspname FROM pg_namespace WHERE nspname ~ '^acceptance_[0-9]+_${runner_pid}$' LIMIT 1"
  )"
  if [[ -f "$marker_file" && -n "$schema_name" ]]; then
    break
  fi
  sleep 0.1
done

if [[ ! -f "$marker_file" || -z "$schema_name" ]]; then
  printf 'acceptance interruption test: migration did not start in time\n' >&2
  exit 1
fi
[[ "$schema_name" =~ ^acceptance_[0-9]+_"$runner_pid"$ ]] ||
  { printf 'acceptance interruption test: disposable schema name was invalid\n' >&2; exit 1; }

kill -TERM -- "-$runner_pid"
set +e
wait "$runner_pid"
runner_status=$?
set -e
runner_pid=""

[[ "$runner_status" -ne 0 ]] ||
  { printf 'acceptance interruption test: cancelled run unexpectedly succeeded\n' >&2; exit 1; }

remaining_schema_count="$(
  psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM pg_namespace WHERE nspname = '$schema_name'"
)"
[[ "$remaining_schema_count" == "0" ]] ||
  { printf 'acceptance interruption test: cancelled run left its disposable schema behind\n' >&2; exit 1; }

if grep -Eq 'legacy_health_claim_|legacy-health-' "$output_file"; then
  printf 'acceptance interruption test: private fixture marker appeared in command output\n' >&2
  exit 1
fi

health_output_file="$test_root/health-claims-acceptance-output.log"
health_marker_file="$test_root/health-claims-test-started"
HEALTH_CLAIM_DATABASE_INTERRUPT_MARKER="$health_marker_file" \
HEALTH_CLAIM_DATABASE_INTERRUPT_DELAY_MS=30000 \
DATABASE_ACCEPTANCE_FOCUS=health-claims \
  setsid bash scripts/clean-database-acceptance.sh >"$health_output_file" 2>&1 &
runner_pid=$!

deadline=$((SECONDS + 60))
schema_name=""
while (( SECONDS < deadline )); do
  schema_name="$(
    psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align \
      --set=ON_ERROR_STOP=1 \
      -c "SELECT nspname FROM pg_namespace WHERE nspname ~ '^acceptance_[0-9]+_${runner_pid}$' LIMIT 1"
  )"
  if [[ -f "$health_marker_file" && -n "$schema_name" ]]; then
    break
  fi
  sleep 0.1
done

if [[ ! -f "$health_marker_file" || -z "$schema_name" ]]; then
  printf 'acceptance interruption test: health claim test did not start in time\n' >&2
  exit 1
fi
[[ "$schema_name" =~ ^acceptance_[0-9]+_"$runner_pid"$ ]] ||
  { printf 'acceptance interruption test: health claim schema name was invalid\n' >&2; exit 1; }

kill -TERM -- "-$runner_pid"
set +e
wait "$runner_pid"
runner_status=$?
set -e
runner_pid=""

[[ "$runner_status" -ne 0 ]] ||
  { printf 'acceptance interruption test: cancelled health claim run unexpectedly succeeded\n' >&2; exit 1; }

remaining_schema_count="$(
  psql "$DATABASE_URL" --no-psqlrc --quiet --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM pg_namespace WHERE nspname = '$schema_name'"
)"
[[ "$remaining_schema_count" == "0" ]] ||
  { printf 'acceptance interruption test: cancelled health claim run left its disposable schema behind\n' >&2; exit 1; }

if grep -Eq 'legacy_health_claim_|legacy-health-|health-audit-[ab]-|legacy-private-claim|private parser metadata canary|legacy private diagnosis' "$health_output_file"; then
  printf 'acceptance interruption test: private health fixture marker appeared in command output\n' >&2
  exit 1
fi

printf 'acceptance interruption test: cancelled migration and health claim runs exited nonzero and removed their disposable schemas\n'
