#!/usr/bin/env bash
set -u

mode="${1:-start}"

cleanup() {
  trap - EXIT INT TERM
  kill "${web_pid:-}" "${calendar_worker_pid:-}" "${redbark_worker_pid:-}" 2>/dev/null || true
  wait "${web_pid:-}" "${calendar_worker_pid:-}" "${redbark_worker_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ "$mode" == "dev" ]]; then
  next dev -H 0.0.0.0 -p "$PORT" &
else
  next start -H 0.0.0.0 -p "$PORT" &
fi
web_pid=$!

tsx --require dotenv/config scripts/calendar-worker.ts &
calendar_worker_pid=$!

tsx --require dotenv/config scripts/redbark-worker.ts &
redbark_worker_pid=$!

set +e
wait -n "$web_pid" "$calendar_worker_pid" "$redbark_worker_pid"
status=$?
set -e
exit "$status"