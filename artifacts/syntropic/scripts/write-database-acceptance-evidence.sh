#!/usr/bin/env bash
set -euo pipefail
umask 077

output_file="${1:?evidence output file is required}"
category="${2:?evidence category is required}"
status="${3:?evidence status is required}"
exit_code="${4:?evidence exit code is required}"
trend_file="${5:-${DATABASE_ACCEPTANCE_TREND_FILE:-}}"

case "$category" in
  connection|migration|seed|test|ownership-check)
    [[ "$status" == "failed" ]] ||
      { printf 'database acceptance evidence: failure category requires failed status\n' >&2; exit 2; }
    ;;
  none)
    [[ "$status" == "passed" ]] ||
      { printf 'database acceptance evidence: none category requires passed status\n' >&2; exit 2; }
    ;;
  *)
    printf 'database acceptance evidence: rejected unknown category\n' >&2
    exit 2
    ;;
esac

[[ "$exit_code" =~ ^[0-9]+$ ]] ||
  { printf 'database acceptance evidence: exit code must be numeric\n' >&2; exit 2; }
if [[ "$status" == "passed" && "$exit_code" != "0" ]] ||
   [[ "$status" == "failed" && "$exit_code" == "0" ]]; then
  printf 'database acceptance evidence: status and exit code disagree\n' >&2
  exit 2
fi

workflow_metadata="${GITHUB_WORKFLOW:-local}"
run_metadata="${GITHUB_RUN_ID:-0}"
run_attempt_metadata="${GITHUB_RUN_ATTEMPT:-1}"
event_metadata="${GITHUB_EVENT_NAME:-local}"
workflow_metadata_pattern='^[A-Za-z0-9][-A-Za-z0-9 ._:/]{0,119}$'
run_metadata_pattern='^[0-9]+$'
event_metadata_pattern='^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
[[ "$workflow_metadata" =~ $workflow_metadata_pattern ]] ||
  { printf 'database acceptance evidence: workflow metadata is invalid\n' >&2; exit 2; }
[[ "$run_metadata" =~ $run_metadata_pattern ]] ||
  { printf 'database acceptance evidence: run metadata is invalid\n' >&2; exit 2; }
[[ "$run_attempt_metadata" =~ $run_metadata_pattern ]] ||
  { printf 'database acceptance evidence: run attempt metadata is invalid\n' >&2; exit 2; }
[[ "$event_metadata" =~ $event_metadata_pattern ]] ||
  { printf 'database acceptance evidence: event metadata is invalid\n' >&2; exit 2; }

write_trend_record() {
  local destination="$1"
  local recorded_at
  recorded_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local output_directory
  output_directory="$(dirname "$destination")"
  mkdir -p "$output_directory"
  chmod 700 "$output_directory"
  local temporary_trend_file
  temporary_trend_file="$(mktemp "$destination.tmp.XXXXXX")"

  if ! TREND_FILE="$temporary_trend_file" \
    TREND_CATEGORY="$category" \
    TREND_STATUS="$status" \
    TREND_EXIT_CODE="$exit_code" \
    TREND_WORKFLOW="$workflow_metadata" \
    TREND_RUN_ID="$run_metadata" \
    TREND_RUN_ATTEMPT="$run_attempt_metadata" \
    TREND_EVENT="$event_metadata" \
    TREND_RECORDED_AT="$recorded_at" \
      node <<'NODE'
const fs = require('node:fs')

const record = {
  category: process.env.TREND_CATEGORY,
  status: process.env.TREND_STATUS,
  exit_code: Number(process.env.TREND_EXIT_CODE),
  workflow: process.env.TREND_WORKFLOW,
  run_id: process.env.TREND_RUN_ID,
  run_attempt: Number(process.env.TREND_RUN_ATTEMPT),
  event: process.env.TREND_EVENT,
  recorded_at: process.env.TREND_RECORDED_AT,
}

if (
  !record.category ||
  !record.status ||
  !Number.isInteger(record.exit_code) ||
  !record.workflow ||
  !record.run_id ||
  !Number.isInteger(record.run_attempt) ||
  !record.event ||
  !record.recorded_at
) {
  process.stderr.write('database acceptance evidence: trend record is incomplete\n')
  process.exit(2)
}

fs.writeFileSync(process.env.TREND_FILE, `${JSON.stringify(record)}\n`)
NODE
  then
    rm -f "$temporary_trend_file"
    exit 2
  fi
  chmod 600 "$temporary_trend_file"
  mv "$temporary_trend_file" "$destination"
  chmod 600 "$destination"
}

output_directory="$(dirname "$output_file")"
mkdir -p "$output_directory"
chmod 700 "$output_directory"
temporary_file="$(mktemp "$output_file.tmp.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT
{
  printf 'category=%s\n' "$category"
  printf 'status=%s\n' "$status"
  printf 'exit_code=%s\n' "$exit_code"
} >"$temporary_file"
chmod 600 "$temporary_file"
mv "$temporary_file" "$output_file"
chmod 600 "$output_file"

if [[ -n "$trend_file" ]]; then
  write_trend_record "$trend_file"
fi
