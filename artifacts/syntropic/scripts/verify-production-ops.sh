#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'Production operations verification failed: %s\n' "$1" >&2
  exit 1
}

require_date_utility() {
  local parsed_date
  local parsed_epoch
  local shifted_epoch

  command -v date >/dev/null 2>&1 ||
    fail "date utility preflight failed: a GNU-compatible date utility is required"

  parsed_date="$(date -u -d '2000-01-02' +%F 2>/dev/null)" ||
    fail "date utility preflight failed: date must support UTC parsing with -u -d and ISO formatting with +%F"
  [[ "$parsed_date" == "2000-01-02" ]] ||
    fail "date utility preflight failed: date must support UTC parsing with -u -d and ISO formatting with +%F"

  parsed_epoch="$(date -u -d '2000-01-02' +%s 2>/dev/null)" ||
    fail "date utility preflight failed: date must support UTC epoch formatting with +%s"
  [[ "$parsed_epoch" =~ ^[0-9]+$ ]] ||
    fail "date utility preflight failed: date must support UTC epoch formatting with +%s"

  shifted_epoch="$(date -u -d '2000-01-02 + 90 days' +%s 2>/dev/null)" ||
    fail "date utility preflight failed: date must support UTC relative-day arithmetic"
  [[ "$shifted_epoch" == "954547200" ]] ||
    fail "date utility preflight failed: date must support UTC relative-day arithmetic"
}

validate_date() {
  local label="$1"
  local value="$2"
  local normalized

  [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
    fail "$label must be an ISO UTC date (YYYY-MM-DD)"
  normalized="$(date -u -d "$value" +%F 2>/dev/null)" ||
    fail "$label must be a valid UTC date"
  [[ "$normalized" == "$value" ]] ||
    fail "$label must be a valid UTC date"
}

check_quarterly_evidence() {
  local label="$1"
  local evidence_date="$2"
  local evidence_status="$3"
  local evidence_role="$4"
  local check_epoch="$5"
  local evidence_epoch
  local expiry_epoch
  local warning_epoch
  local remaining_days

  [[ -n "$evidence_date" && -n "$evidence_status" && -n "$evidence_role" ]] ||
    fail "$label evidence is missing; record its date, pass/fail status, and named operational role"
  validate_date "$label evidence date" "$evidence_date"
  [[ "$evidence_status" == "pass" ]] ||
    fail "$label evidence is not marked pass; remediate it before release"
  [[ "$evidence_role" != *$'\n'* && "$evidence_role" != *$'\r'* ]] ||
    fail "$label evidence role must be a single named operational role"

  evidence_epoch="$(date -u -d "$evidence_date" +%s)"
  (( evidence_epoch <= check_epoch )) ||
    fail "$label evidence date cannot be in the future"
  expiry_epoch="$(date -u -d "$evidence_date + 90 days" +%s)"
  warning_epoch="$((expiry_epoch - 14 * 86400))"

  if (( check_epoch >= expiry_epoch )); then
    fail "$label evidence is overdue; complete a new quarterly check and record a passing result before release"
  fi

  if (( check_epoch >= warning_epoch )); then
    remaining_days="$(( (expiry_epoch - check_epoch + 86399) / 86400 ))"
    printf 'WARNING: %s evidence expires in %s day(s); renew it before the quarterly deadline.\n' \
      "$label" "$remaining_days" >&2
  fi
}

require_date_utility

[[ "${OPS_ENVIRONMENT:-}" == "production" ]] ||
  fail "OPS_ENVIRONMENT must be production"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "${BACKUP_DIR:-}" && -d "$BACKUP_DIR" && -w "$BACKUP_DIR" ]] ||
  fail "BACKUP_DIR must be a writable mounted backup destination"
[[ "${BACKUP_ENCRYPTION_MODE:-}" == "managed_kms" ]] ||
  fail "BACKUP_ENCRYPTION_MODE must be managed_kms"
[[ "${BACKUP_IMMUTABLE:-}" == "true" ]] ||
  fail "BACKUP_IMMUTABLE must be true"
[[ "${BACKUP_DAILY_RETENTION_DAYS:-}" == "35" ]] ||
  fail "BACKUP_DAILY_RETENTION_DAYS must be 35"
[[ "${BACKUP_MONTHLY_RETENTION_MONTHS:-}" == "12" ]] ||
  fail "BACKUP_MONTHLY_RETENTION_MONTHS must be 12"
[[ "${BACKUP_SCHEDULE:-}" == "0 2 * * *" ]] ||
  fail "BACKUP_SCHEDULE must be the documented daily schedule"
[[ "${OPS_RESTORE_DRILL_SCHEDULE:-}" == "quarterly" ]] ||
  fail "OPS_RESTORE_DRILL_SCHEDULE must be quarterly"
[[ "${OPS_EVIDENCE_REMINDER_SCHEDULE:-}" == "daily" ]] ||
  fail "OPS_EVIDENCE_REMINDER_SCHEDULE must be daily"
[[ "${OPS_ALERT_WEBHOOK_URL:-}" =~ ^https://[^[:space:]]+$ ]] ||
  fail "OPS_ALERT_WEBHOOK_URL must be an HTTPS receiver URL"
[[ -n "${OPS_ALERT_OWNER:-}" ]] || fail "OPS_ALERT_OWNER is required"
[[ "${OPS_ALERT_ENVIRONMENT:-}" == "production" ]] ||
  fail "OPS_ALERT_ENVIRONMENT must be production"
[[ "${OPS_ALERT_ACK_WINDOW_MINUTES:-}" == "15" ]] ||
  fail "OPS_ALERT_ACK_WINDOW_MINUTES must be 15"
[[ "${OPS_ALERT_POLL_FAILURE_THRESHOLD:-}" == "3" ]] ||
  fail "OPS_ALERT_POLL_FAILURE_THRESHOLD must be 3"
[[ "${OPS_ALERT_QUEUE_AGE_SECONDS:-}" == "300" ]] ||
  fail "OPS_ALERT_QUEUE_AGE_SECONDS must be 300"

check_date="${OPS_EVIDENCE_CHECK_DATE:-$(date -u +%F)}"
validate_date "OPS_EVIDENCE_CHECK_DATE" "$check_date"
check_epoch="$(date -u -d "$check_date" +%s)"
check_quarterly_evidence \
  "Quarterly restore" \
  "${OPS_RESTORE_EVIDENCE_DATE:-}" \
  "${OPS_RESTORE_EVIDENCE_STATUS:-}" \
  "${OPS_RESTORE_EVIDENCE_ROLE:-}" \
  "$check_epoch"
check_quarterly_evidence \
  "Alert acknowledgement" \
  "${OPS_ALERT_EVIDENCE_DATE:-}" \
  "${OPS_ALERT_EVIDENCE_STATUS:-}" \
  "${OPS_ALERT_EVIDENCE_ROLE:-}" \
  "$check_epoch"

printf 'Production operations configuration is complete; no secrets were printed.\n'
printf 'Quarterly restore and alert acknowledgement evidence is current and passed.\n'