#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-recovery}"

fail() {
  echo "GOOGLE AUTH RELEASE CHECK: FAIL: $*" >&2
  exit 1
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "$name must be set for the Google OAuth release check"
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 ||
    fail "$name is required for the Google OAuth release check; install it or add it to PATH"
}

case "$mode" in
  recovery|staging) ;;
  *) fail "mode must be recovery or staging" ;;
esac

base_url="${AUTH_REGRESSION_BASE:-}"
for required_command in node pnpm; do
  require_command "$required_command"
done
if [[ -z "$base_url" ]]; then
  for required_command in setsid curl mktemp sed head sleep rm; do
    require_command "$required_command"
  done
fi

for required_env in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET AUTH_URL; do
  require_env "$required_env"
done

if [[ -z "${AUTH_SECRET:-}" && -z "${SESSION_SECRET:-}" ]]; then
  fail "AUTH_SECRET or SESSION_SECRET must be set for the Google OAuth release check"
fi

export AUTH_REGRESSION_REQUIRED=1

node <<'NODE'
const value = process.env.AUTH_URL
let url
try {
  url = new URL(value)
} catch {
  console.error('GOOGLE AUTH RELEASE CHECK: FAIL: AUTH_URL must be a valid URL')
  process.exit(1)
}
if (url.protocol !== 'https:') {
  console.error('GOOGLE AUTH RELEASE CHECK: FAIL: AUTH_URL must use the public HTTPS origin')
  process.exit(1)
}
if (url.username || url.password || url.search || url.hash) {
  console.error('GOOGLE AUTH RELEASE CHECK: FAIL: AUTH_URL must contain only the public origin')
  process.exit(1)
}
NODE

if [[ "$mode" == "staging" ]]; then
  [[ "${AUTH_REGRESSION_STAGING:-}" == "1" ]] || {
    fail "set AUTH_REGRESSION_STAGING=1 to confirm this is an intentional non-production run"
  }
  [[ -n "$base_url" ]] || fail "AUTH_REGRESSION_BASE must point to the public staging server"
fi

server_pid=""
server_log=""
server_ready=0
max_server_output_chars=12000

print_server_log() {
  [[ -n "$server_log" && -f "$server_log" ]] || return 0
  SERVER_LOG="$server_log" SERVER_BASE_URL="${base_url:-}" MAX_SERVER_OUTPUT_CHARS="$max_server_output_chars" node <<'NODE'
const { readFileSync } = require('node:fs')

let output = readFileSync(process.env.SERVER_LOG, 'utf8')
const sensitiveValues = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.AUTH_SECRET,
  process.env.SESSION_SECRET,
  process.env.AUTH_URL,
  process.env.SERVER_BASE_URL,
].filter((value) => value && value.length > 0)

for (const value of sensitiveValues) {
  output = output.split(value).join('[REDACTED]')
}
output = output.replace(
  /([?&](?:code|state|token|id_token|access_token|refresh_token)=)[^&\s]*/gi,
  '$1[REDACTED]',
)
const maxOutputChars = Number(process.env.MAX_SERVER_OUTPUT_CHARS)
if (output.length > maxOutputChars) {
  const marker = `[server output truncated to ${maxOutputChars} characters]`
  const retainedChars = maxOutputChars - marker.length - 2
  const headChars = Math.ceil(retainedChars / 2)
  const tailChars = Math.floor(retainedChars / 2)
  output = `${output.slice(0, headChars)}\n${marker}\n${output.slice(-tailChars)}`
}
process.stderr.write(output)
if (output.length > 0 && !output.endsWith('\n')) process.stderr.write('\n')
NODE
}

print_server_diagnostics() {
  echo "GOOGLE AUTH RELEASE CHECK: captured server output (sensitive values redacted)" >&2
  print_server_log
}

cleanup() {
  local status=$?
  if [[ -n "$server_pid" ]]; then
    kill -- "-$server_pid" 2>/dev/null || true
    for ((cleanup_attempt = 1; cleanup_attempt <= 20; cleanup_attempt++)); do
      if ! kill -0 -- "-$server_pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    kill -KILL -- "-$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    server_pid=""
  fi
  if [[ "$status" -ne 0 && "$server_ready" == "1" ]]; then
    print_server_diagnostics
  fi
  if [[ -n "$server_log" ]]; then
    rm -f "$server_log"
    server_log=""
  fi
  return "$status"
}
trap cleanup EXIT INT TERM

if [[ -z "$base_url" ]]; then
  port="${AUTH_REGRESSION_PORT:-0}"
  server_log="$(mktemp "${TMPDIR:-/tmp}/syntropic-google-auth.XXXXXX.log")"

  if [[ "$port" == "0" ]]; then
    echo "GOOGLE AUTH RELEASE CHECK: starting Syntropic server on an available local port"
  else
    base_url="http://127.0.0.1:${port}"
    echo "GOOGLE AUTH RELEASE CHECK: starting Syntropic server at $base_url"
  fi
  PORT="$port" setsid pnpm exec next start -H 127.0.0.1 -p "$port" >"$server_log" 2>&1 &
  server_pid=$!

  ready_attempts="${AUTH_REGRESSION_READY_ATTEMPTS:-60}"
  [[ "$ready_attempts" =~ ^[1-9][0-9]*$ ]] || {
    fail "AUTH_REGRESSION_READY_ATTEMPTS must be a positive integer"
  }

  ready=0
  for ((attempt = 1; attempt <= ready_attempts; attempt++)); do
    if [[ -z "$base_url" ]]; then
      assigned_port="$(
        sed -nE 's/^- Local:[[:space:]]+http:\/\/127\.0\.0\.1:([0-9]+).*$/\1/p' \
          "$server_log" | head -n 1
      )"
      if [[ "$assigned_port" =~ ^[1-9][0-9]*$ ]]; then
        base_url="http://127.0.0.1:${assigned_port}"
        echo "GOOGLE AUTH RELEASE CHECK: server assigned available port ${assigned_port}"
      fi
    fi

    if [[ -n "$base_url" ]] && curl --silent --show-error --fail --max-time 3 \
      "$base_url/api/auth/providers" >/dev/null 2>&1; then
      ready=1
      server_ready=1
      break
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      echo "GOOGLE AUTH RELEASE CHECK: server exited before becoming ready" >&2
      print_server_diagnostics
      fail "Syntropic server failed to start"
    fi
    if (( attempt < ready_attempts )); then
      sleep 1
    fi
  done
  [[ "$ready" == "1" ]] || {
    echo "GOOGLE AUTH RELEASE CHECK: server did not become ready at $base_url" >&2
    print_server_diagnostics
    fail "Syntropic server readiness check timed out"
  }
else
  node - "$base_url" "$mode" "$AUTH_URL" <<'NODE'
const [value, mode, authUrlValue] = process.argv.slice(2)
let url
try {
  url = new URL(value)
} catch {
  console.error('GOOGLE AUTH RELEASE CHECK: FAIL: AUTH_REGRESSION_BASE must be a valid URL')
  process.exit(1)
}
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
  console.error('GOOGLE AUTH RELEASE CHECK: FAIL: AUTH_REGRESSION_BASE must be an HTTP(S) URL without credentials')
  process.exit(1)
}
if (mode === 'staging') {
  if (url.protocol !== 'https:') {
    console.error('GOOGLE AUTH STAGING CHECK: FAIL: staging must use the public HTTPS origin')
    process.exit(1)
  }
  const authUrl = new URL(authUrlValue)
  if (authUrl.origin !== url.origin) {
    console.error('GOOGLE AUTH STAGING CHECK: FAIL: AUTH_URL and AUTH_REGRESSION_BASE must have the same public origin')
    process.exit(1)
  }
}
NODE
  if [[ "$mode" == "staging" ]]; then
    echo "GOOGLE AUTH STAGING CHECK: targeting the configured non-production HTTPS origin"
  else
    echo "GOOGLE AUTH RELEASE CHECK: targeting Syntropic server at $base_url"
  fi
fi

if [[ "$mode" == "staging" ]]; then
  export AUTH_REGRESSION_MODE=staging
  for required_calendar_env in CALENDAR_RECOVERY_STAGING CALENDAR_RECOVERY_STAGING_ENVIRONMENT CALENDAR_RECOVERY_STAGING_CONNECTION_ID CALENDAR_RECOVERY_STAGING_LOG_FILE; do
    require_env "$required_calendar_env"
  done
  [[ "$CALENDAR_RECOVERY_STAGING" == "1" ]] || {
    fail "CALENDAR_RECOVERY_STAGING must be 1 for the staging Calendar recovery check"
  }
  [[ "$CALENDAR_RECOVERY_STAGING_ENVIRONMENT" == "NON_PRODUCTION" ]] || {
    fail "CALENDAR_RECOVERY_STAGING_ENVIRONMENT must be NON_PRODUCTION"
  }
  [[ "$CALENDAR_RECOVERY_STAGING_CONNECTION_ID" =~ ^[A-Za-z0-9_-]+$ ]] || {
    fail "CALENDAR_RECOVERY_STAGING_CONNECTION_ID must be a safe connection identifier"
  }
  AUTH_REGRESSION_BASE="$base_url" pnpm exec tsx --test tests/google-auth-staging.test.ts
  echo "GOOGLE AUTH STAGING CHECK: PASS (privacy-safe OAuth and Calendar recovery evidence was written)"
else
  AUTH_REGRESSION_BASE="$base_url" pnpm exec tsx --test tests/google-auth-recovery.test.ts
  echo "GOOGLE AUTH RELEASE CHECK: PASS"
fi
