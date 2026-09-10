#!/usr/bin/env bash
set -Eeuo pipefail

# This is a shell-level test for run-google-auth-regression.sh. It deliberately
# replaces only the two pnpm commands used by the wrapper:
#   - next start is a tiny loopback HTTP server that emits Next's "- Local:"
#     readiness line and answers /api/auth/providers.
#   - tsx --test records AUTH_REGRESSION_BASE and checks that endpoint.
#
# No Next build, database, Google credentials, or staging callback is needed.

pnpm exec tsx --test \
  tests/google-auth-staging-evidence.test.ts \
  tests/calendar-recovery-staging-evidence.test.ts

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
wrapper="$script_dir/run-google-auth-regression.sh"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/syntropic-google-auth-wrapper.XXXXXX")"
fake_bin="$test_dir/bin"
observations="$test_dir/observations"
mkdir -p "$fake_bin"
touch "$observations"

cleanup() {
  rm -rf "$test_dir"
}
trap cleanup EXIT INT TERM

cat >"$fake_bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" != "exec" ]]; then
  echo "fake pnpm only supports 'pnpm exec ...'" >&2
  exit 2
fi
shift

case "${1:-}" in
  next)
    shift
    exec node "$FAKE_NEXT_SERVER" "$@"
    ;;
  tsx)
    shift
    exec node "$FAKE_AUTH_TEST" "$@"
    ;;
  *)
    echo "unexpected fake pnpm command: $*" >&2
    exit 2
    ;;
esac
FAKE_PNPM

cat >"$fake_bin/fake-next-server.mjs" <<'FAKE_NEXT'
import http from 'node:http'
import { appendFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const portIndex = args.indexOf('-p')
const port = Number(portIndex >= 0 ? args[portIndex + 1] : NaN)
const mode = process.env.FAKE_NEXT_MODE ?? 'ready'

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('fake Next server received an invalid port')
  process.exit(2)
}

if (process.env.FAKE_NEXT_PID_FILE) {
  appendFileSync(process.env.FAKE_NEXT_PID_FILE, `parent ${process.pid}\n`)
}

if (mode === 'unavailable-with-child') {
  const child = spawn(
    process.execPath,
    ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1_000)'],
    { stdio: 'ignore' },
  )
  if (process.env.FAKE_NEXT_PID_FILE) {
    appendFileSync(process.env.FAKE_NEXT_PID_FILE, `child ${child.pid}\n`)
  }
}

if (mode === 'exit-before-ready') {
  console.error('fake Next server exited before readiness')
  if (process.env.FAKE_NEXT_NOISY_OUTPUT === '1') {
    console.error(
      `noisy startup output ${'x'.repeat(20_000)} ${process.env.GOOGLE_CLIENT_ID} ${process.env.GOOGLE_CLIENT_SECRET} ${process.env.AUTH_SECRET} ${process.env.AUTH_URL}`,
    )
    console.error(
      'startup callback marker /api/auth/callback/google?code=fixture-callback-code&state=fixture-callback-state',
    )
    console.error('latest startup diagnostic marker')
  }
  process.exit(17)
}

if (mode === 'unavailable' || mode === 'unavailable-with-child') {
  console.log(`- Local: http://127.0.0.1:${port}`)
  if (process.env.FAKE_NEXT_NOISY_OUTPUT === '1') {
    console.log(
      `noisy timeout output ${'x'.repeat(20_000)} ${process.env.GOOGLE_CLIENT_ID} ${process.env.GOOGLE_CLIENT_SECRET} ${process.env.AUTH_SECRET} ${process.env.AUTH_URL}`,
    )
    console.log(
      'timeout callback marker /api/auth/callback/google?code=fixture-callback-code&state=fixture-callback-state',
    )
    console.log('latest timeout diagnostic marker')
  }
  setInterval(() => {}, 1_000)
}

if (mode !== 'unavailable' && mode !== 'unavailable-with-child') {
  const server = http.createServer((request, response) => {
    if (request.url === '/api/auth/providers') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{}')
      return
    }
    response.writeHead(404)
    response.end()
  })

  server.listen(port, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
      console.error('fake Next server did not receive a TCP address')
      process.exit(2)
    }
    console.log(`- Local: http://127.0.0.1:${address.port}`)
    console.log(`diagnostic marker ${process.env.GOOGLE_CLIENT_ID} ${process.env.GOOGLE_CLIENT_SECRET} ${process.env.AUTH_SECRET} ${process.env.AUTH_URL}`)
    console.log('callback marker /api/auth/callback/google?code=fixture-callback-code&state=fixture-callback-state')
    if (process.env.FAKE_NEXT_NOISY_OUTPUT === '1') {
      console.log(`international diagnostic marker 国际认证诊断 sesión inválida ${process.env.GOOGLE_CLIENT_SECRET}`)
      console.log(`noisy server output ${'诊断'.repeat(10_000)}`)
      console.log('latest server diagnostic marker 最新服务器诊断')
    }
  })
}
FAKE_NEXT

cat >"$fake_bin/fake-auth-test.mjs" <<'FAKE_AUTH_TEST'
import { appendFileSync } from 'node:fs'

const baseUrl = process.env.AUTH_REGRESSION_BASE
if (!baseUrl) {
  console.error('fake auth test did not receive AUTH_REGRESSION_BASE')
  process.exit(1)
}

const response = await fetch(new URL('/api/auth/providers', baseUrl))
if (response.status !== 200) {
  console.error(`fake auth test received HTTP ${response.status}`)
  process.exit(1)
}

appendFileSync(process.env.AUTH_REGRESSION_OBSERVATIONS, `${baseUrl}\n`)
if (process.env.FAKE_AUTH_ASSERTION_FAILURE === '1') {
  console.error('fake auth assertion failed after readiness')
  process.exit(23)
}
FAKE_AUTH_TEST

chmod +x "$fake_bin/pnpm"
export PATH="$fake_bin:$PATH"
export FAKE_NEXT_SERVER="$fake_bin/fake-next-server.mjs"
export FAKE_AUTH_TEST="$fake_bin/fake-auth-test.mjs"
export AUTH_REGRESSION_OBSERVATIONS="$observations"
mkdir -p "$test_dir/tmp"
export TMPDIR="$test_dir/tmp"

common_env=(
  GOOGLE_CLIENT_ID=fixture-client-id
  GOOGLE_CLIENT_SECRET=fixture-client-secret
  AUTH_SECRET=fixture-auth-secret
  AUTH_URL=https://auth.example.test
)

run_wrapper() {
  env \
    -u AUTH_REGRESSION_BASE \
    -u AUTH_REGRESSION_PORT \
    "${common_env[@]}" \
    bash "$wrapper"
}

first_log="$test_dir/first.log"
second_log="$test_dir/second.log"
run_wrapper >"$first_log" 2>&1 &
first_pid=$!
run_wrapper >"$second_log" 2>&1 &
second_pid=$!

first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?

if [[ "$first_status" -ne 0 || "$second_status" -ne 0 ]]; then
  echo "parallel wrapper runs failed" >&2
  echo "--- first run ---" >&2
  cat "$first_log" >&2
  echo "--- second run ---" >&2
  cat "$second_log" >&2
  exit 1
fi

mapfile -t parallel_bases <"$observations"
if [[ "${#parallel_bases[@]}" -ne 2 ]]; then
  echo "expected two parallel observations, got ${#parallel_bases[@]}" >&2
  cat "$observations" >&2
  exit 1
fi

parallel_first_port="${parallel_bases[0]##*:}"
parallel_second_port="${parallel_bases[1]##*:}"
if [[ ! "$parallel_first_port" =~ ^[1-9][0-9]*$ ||
  ! "$parallel_second_port" =~ ^[1-9][0-9]*$ ||
  "$parallel_first_port" == "$parallel_second_port" ]]; then
  echo "parallel wrapper runs did not receive distinct assigned ports" >&2
  cat "$observations" >&2
  exit 1
fi

fixed_port="$(
  node -e '
    const net = require("node:net")
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port)
      server.close()
    })
  '
)"
fixed_start="$(
  wc -l <"$observations"
)"
env \
  -u AUTH_REGRESSION_BASE \
  "${common_env[@]}" \
  AUTH_REGRESSION_PORT="$fixed_port" \
  bash "$wrapper" >"$test_dir/fixed.log" 2>&1

mapfile -t all_bases <"$observations"
if [[ "${#all_bases[@]}" -ne "$((fixed_start + 1))" ||
  "${all_bases[$fixed_start]}" != "http://127.0.0.1:${fixed_port}" ]]; then
  echo "AUTH_REGRESSION_PORT was not honored" >&2
  cat "$test_dir/fixed.log" >&2
  cat "$observations" >&2
  exit 1
fi

required_local_commands=(node pnpm setsid curl mktemp sed head sleep rm)
for missing_command in "${required_local_commands[@]}"; do
  missing_prerequisite_bin="$test_dir/missing-prerequisite-$missing_command"
  mkdir -p "$missing_prerequisite_bin"
  ln -s "$(command -v bash)" "$missing_prerequisite_bin/bash"
  for available_command in "${required_local_commands[@]}"; do
    [[ "$available_command" == "$missing_command" ]] && continue
    ln -s "$(command -v "$available_command")" "$missing_prerequisite_bin/$available_command"
  done

  missing_prerequisite_log="$test_dir/missing-prerequisite-$missing_command.log"
  missing_prerequisite_status=0
  observation_count_before="$(wc -l <"$observations")"
  env \
    -u AUTH_REGRESSION_BASE \
    -u AUTH_REGRESSION_PORT \
    "${common_env[@]}" \
    PATH="$missing_prerequisite_bin" \
    bash "$wrapper" >"$missing_prerequisite_log" 2>&1 || missing_prerequisite_status=$?

  if [[ "$missing_prerequisite_status" -eq 0 ]]; then
    echo "missing $missing_command prerequisite unexpectedly passed" >&2
    cat "$missing_prerequisite_log" >&2
    exit 1
  fi
  if ! grep -Fq \
    "$missing_command is required for the Google OAuth release check; install it or add it to PATH" \
    "$missing_prerequisite_log" ||
    grep -q "starting Syntropic server" "$missing_prerequisite_log"; then
    echo "missing $missing_command prerequisite did not produce an actionable preflight error" >&2
    cat "$missing_prerequisite_log" >&2
    exit 1
  fi
  if [[ "$(wc -l <"$observations")" -ne "$observation_count_before" ]]; then
    echo "missing $missing_command prerequisite started or completed a server check" >&2
    cat "$observations" >&2
    exit 1
  fi
done

if compgen -G "$test_dir/tmp/syntropic-google-auth.*.log" >/dev/null; then
  echo "successful auth checks left temporary server logs behind" >&2
  ls -la "$test_dir/tmp" >&2
  exit 1
fi

assertion_log="$test_dir/assertion-failure.log"
assertion_status=0
env \
  -u AUTH_REGRESSION_BASE \
  -u AUTH_REGRESSION_PORT \
  "${common_env[@]}" \
  FAKE_AUTH_ASSERTION_FAILURE=1 \
  bash "$wrapper" >"$assertion_log" 2>&1 || assertion_status=$?

if [[ "$assertion_status" -eq 0 ]]; then
  echo "fake auth assertion failure unexpectedly passed" >&2
  cat "$assertion_log" >&2
  exit 1
fi
if ! grep -q "fake auth assertion failed after readiness" "$assertion_log" ||
  ! grep -q "captured server output (sensitive values redacted)" "$assertion_log" ||
  ! grep -q "diagnostic marker" "$assertion_log"; then
  echo "auth assertion failure did not include captured server diagnostics" >&2
  cat "$assertion_log" >&2
  exit 1
fi
for sensitive_value in "${common_env[@]}"; do
  sensitive_value="${sensitive_value#*=}"
  if grep -Fq "$sensitive_value" "$assertion_log"; then
    echo "auth assertion diagnostics exposed a sensitive value" >&2
    cat "$assertion_log" >&2
    exit 1
  fi
done
for callback_value in fixture-callback-code fixture-callback-state; do
  if grep -Fq "$callback_value" "$assertion_log"; then
    echo "auth assertion diagnostics exposed a callback value" >&2
    cat "$assertion_log" >&2
    exit 1
  fi
done
if compgen -G "$test_dir/tmp/syntropic-google-auth.*.log" >/dev/null; then
  echo "failed auth check left temporary server logs behind" >&2
  ls -la "$test_dir/tmp" >&2
  exit 1
fi

oversized_log="$test_dir/oversized-assertion-failure.log"
oversized_status=0
env \
  -u AUTH_REGRESSION_BASE \
  -u AUTH_REGRESSION_PORT \
  "${common_env[@]}" \
  FAKE_AUTH_ASSERTION_FAILURE=1 \
  FAKE_NEXT_NOISY_OUTPUT=1 \
  bash "$wrapper" >"$oversized_log" 2>&1 || oversized_status=$?

if [[ "$oversized_status" -eq 0 ]]; then
  echo "oversized fake auth assertion failure unexpectedly passed" >&2
  cat "$oversized_log" >&2
  exit 1
fi
if ! grep -q "server output truncated to 12000 characters" "$oversized_log" ||
  ! grep -q "international diagnostic marker 国际认证诊断 sesión inválida" "$oversized_log" ||
  ! grep -q "latest server diagnostic marker 最新服务器诊断" "$oversized_log"; then
  echo "oversized auth assertion failure did not retain bounded diagnostics" >&2
  cat "$oversized_log" >&2
  exit 1
fi
captured_output="$(
  sed -n '/captured server output (sensitive values redacted)/,$p' "$oversized_log" |
    tail -n +2
)"
captured_output_chars="$(
  CAPTURED_OUTPUT="$captured_output" node -e 'process.stdout.write(String(process.env.CAPTURED_OUTPUT.length))'
)"
if [[ "$captured_output_chars" -gt 12001 ]]; then
  echo "oversized auth assertion diagnostics exceeded the output bound" >&2
  printf 'JavaScript string characters: %s\n' "$captured_output_chars" >&2
  wc -c "$oversized_log" >&2
  exit 1
fi
for sensitive_value in "${common_env[@]}"; do
  sensitive_value="${sensitive_value#*=}"
  if grep -Fq "$sensitive_value" "$oversized_log"; then
    echo "oversized auth assertion diagnostics exposed a sensitive value" >&2
    cat "$oversized_log" >&2
    exit 1
  fi
done
for callback_value in fixture-callback-code fixture-callback-state; do
  if grep -Fq "$callback_value" "$oversized_log"; then
    echo "oversized auth assertion diagnostics exposed a callback value" >&2
    cat "$oversized_log" >&2
    exit 1
  fi
done
if compgen -G "$test_dir/tmp/syntropic-google-auth.*.log" >/dev/null; then
  echo "oversized failed auth check left temporary server logs behind" >&2
  ls -la "$test_dir/tmp" >&2
  exit 1
fi

failure_log="$test_dir/early-exit.log"
early_status=0
env \
  -u AUTH_REGRESSION_BASE \
  -u AUTH_REGRESSION_PORT \
  "${common_env[@]}" \
  FAKE_NEXT_MODE=exit-before-ready \
  FAKE_NEXT_NOISY_OUTPUT=1 \
  bash "$wrapper" >"$failure_log" 2>&1 || early_status=$?

if [[ "$early_status" -eq 0 ]]; then
  echo "early server exit unexpectedly passed" >&2
  cat "$failure_log" >&2
  exit 1
fi
if ! grep -q "server exited before becoming ready" "$failure_log" ||
  ! grep -q "Syntropic server failed to start" "$failure_log" ||
  ! grep -q "fake Next server exited before readiness" "$failure_log" ||
  ! grep -q "server output truncated to 12000 characters" "$failure_log" ||
  ! grep -q "latest startup diagnostic marker" "$failure_log"; then
  echo "early server exit did not produce actionable startup diagnostics" >&2
  cat "$failure_log" >&2
  exit 1
fi
early_captured_output="$(
  awk '
    /captured server output \(sensitive values redacted\)/ { capture = 1; next }
    capture && /^GOOGLE AUTH RELEASE CHECK: FAIL:/ { exit }
    capture { print }
  ' "$failure_log"
)"
if [[ "${#early_captured_output}" -gt 12001 ]]; then
  echo "early startup diagnostics exceeded the output bound" >&2
  wc -c "$failure_log" >&2
  exit 1
fi
for sensitive_value in "${common_env[@]}"; do
  sensitive_value="${sensitive_value#*=}"
  if grep -Fq "$sensitive_value" "$failure_log"; then
    echo "early startup diagnostics exposed a sensitive value" >&2
    cat "$failure_log" >&2
    exit 1
  fi
done
for callback_value in fixture-callback-code fixture-callback-state; do
  if grep -Fq "$callback_value" "$failure_log"; then
    echo "early startup diagnostics exposed a callback value" >&2
    cat "$failure_log" >&2
    exit 1
  fi
done

unavailable_pid_file="$test_dir/unavailable.pid"
unavailable_log="$test_dir/unavailable.log"
unavailable_port="$(
  node -e '
    const net = require("node:net")
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port)
      server.close()
    })
  '
)"
timeout_status=0
env \
  -u AUTH_REGRESSION_BASE \
  "${common_env[@]}" \
  AUTH_REGRESSION_PORT="$unavailable_port" \
  AUTH_REGRESSION_READY_ATTEMPTS=2 \
  FAKE_NEXT_MODE=unavailable-with-child \
  FAKE_NEXT_NOISY_OUTPUT=1 \
  FAKE_NEXT_PID_FILE="$unavailable_pid_file" \
  bash "$wrapper" >"$unavailable_log" 2>&1 || timeout_status=$?

if [[ "$timeout_status" -eq 0 ]]; then
  echo "unavailable server unexpectedly passed" >&2
  cat "$unavailable_log" >&2
  exit 1
fi
if ! grep -q "server did not become ready at http://127.0.0.1:${unavailable_port}" \
  "$unavailable_log" ||
  ! grep -q "Syntropic server readiness check timed out" "$unavailable_log" ||
  ! grep -q "server output truncated to 12000 characters" "$unavailable_log" ||
  ! grep -q "latest timeout diagnostic marker" "$unavailable_log"; then
  echo "readiness timeout did not produce actionable diagnostics" >&2
  cat "$unavailable_log" >&2
  exit 1
fi
timeout_captured_output="$(
  awk '
    /captured server output \(sensitive values redacted\)/ { capture = 1; next }
    capture && /^GOOGLE AUTH RELEASE CHECK: FAIL:/ { exit }
    capture { print }
  ' "$unavailable_log"
)"
if [[ "${#timeout_captured_output}" -gt 12001 ]]; then
  echo "readiness timeout diagnostics exceeded the output bound" >&2
  wc -c "$unavailable_log" >&2
  exit 1
fi
for sensitive_value in "${common_env[@]}"; do
  sensitive_value="${sensitive_value#*=}"
  if grep -Fq "$sensitive_value" "$unavailable_log"; then
    echo "readiness timeout diagnostics exposed a sensitive value" >&2
    cat "$unavailable_log" >&2
    exit 1
  fi
done
for callback_value in fixture-callback-code fixture-callback-state; do
  if grep -Fq "$callback_value" "$unavailable_log"; then
    echo "readiness timeout diagnostics exposed a callback value" >&2
    cat "$unavailable_log" >&2
    exit 1
  fi
done
if [[ ! -s "$unavailable_pid_file" ]]; then
  echo "unavailable server did not record its process ids" >&2
  cat "$unavailable_log" >&2
  exit 1
fi
mapfile -t unavailable_processes <"$unavailable_pid_file"
if [[ "${#unavailable_processes[@]}" -ne 2 ||
  "${unavailable_processes[0]}" != parent\ * ||
  "${unavailable_processes[1]}" != child\ * ]]; then
  echo "unavailable server did not record both parent and descendant process ids" >&2
  cat "$unavailable_pid_file" >&2
  exit 1
fi
for unavailable_process in "${unavailable_processes[@]}"; do
  read -r process_role unavailable_pid <<<"$unavailable_process"
  for ((attempt = 1; attempt <= 20; attempt++)); do
    if ! kill -0 "$unavailable_pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  if kill -0 "$unavailable_pid" 2>/dev/null; then
    echo "readiness timeout left $process_role process $unavailable_pid behind" >&2
    cat "$unavailable_log" >&2
    exit 1
  fi
done

echo "Google auth evidence privacy, wrapper startup, and readiness failure regression: PASS"