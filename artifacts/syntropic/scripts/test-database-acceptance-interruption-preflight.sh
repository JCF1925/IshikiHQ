#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="$project_root/scripts/test-clean-database-acceptance-interruption.sh"
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

restricted_bin="$test_root/bin"
mkdir -p "$restricted_bin"
ln -s "$(command -v bash)" "$restricted_bin/bash"

side_effect_marker="$test_root/interruption-check-started"
cat >"$restricted_bin/mktemp" <<SH
#!/usr/bin/env bash
: >"$side_effect_marker"
exit 1
SH
chmod +x "$restricted_bin/mktemp"

output_file="$test_root/output.log"
status=0
PATH="$restricted_bin" \
  DATABASE_URL='postgresql://test.invalid/isolation_preflight' \
  bash "$runner" >"$output_file" 2>&1 || status=$?

if [[ "$status" -eq 0 ]]; then
  printf 'missing setsid prerequisite unexpectedly passed\n' >&2
  cat "$output_file" >&2
  exit 1
fi

expected='acceptance interruption test: setsid is required to isolate database acceptance interruption checks; install it or add it to PATH'
if ! grep -Fxq "$expected" "$output_file"; then
  printf 'missing setsid prerequisite did not produce the actionable preflight error\n' >&2
  cat "$output_file" >&2
  exit 1
fi

if [[ -e "$side_effect_marker" ]]; then
  printf 'missing setsid prerequisite allowed interruption setup to begin\n' >&2
  cat "$output_file" >&2
  exit 1
fi

if grep -Eq 'DATABASE_URL is required|migration did not start|health claim test did not start' "$output_file"; then
  printf 'missing setsid prerequisite failed after another interruption check began\n' >&2
  cat "$output_file" >&2
  exit 1
fi

printf 'acceptance interruption preflight test: missing process isolation failed before interruption setup\n'