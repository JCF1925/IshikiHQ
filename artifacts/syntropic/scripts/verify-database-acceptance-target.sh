#!/usr/bin/env bash
set -Eeuo pipefail

verify_database_acceptance_target() {
  local configured_target="${1:-}"
  local database_url="${2:-${DATABASE_URL:-}}"
  local database_target=""

  case "$configured_target" in
    disposable|release-validation)
      ;;
    *)
      printf 'database acceptance: DATABASE_ACCEPTANCE_TARGET must be disposable or release-validation\n' >&2
      return 1
      ;;
  esac

  [[ -n "$database_url" ]] || {
    printf 'database acceptance: DATABASE_URL is required to verify target identity\n' >&2
    return 1
  }

  if ! database_target="$(
    psql -X -q -A -t -v ON_ERROR_STOP=1 "$database_url" \
      -c "SELECT split_part(setting, '=', 2)
            FROM pg_db_role_setting
            CROSS JOIN LATERAL unnest(setconfig) AS config(setting)
           WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
             AND setrole = 0
             AND setting LIKE 'syntropic.acceptance_target=%'
           LIMIT 1" \
      2>/dev/null
  )"; then
    printf 'database acceptance: unable to verify database target identity\n' >&2
    return 1
  fi

  if [[ "$database_target" != "$configured_target" ]]; then
    printf 'database acceptance: database target identity does not match the configured target\n' >&2
    return 1
  fi
}