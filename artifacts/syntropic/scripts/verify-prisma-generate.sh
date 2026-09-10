#!/usr/bin/env bash
set -euo pipefail

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

# Prisma client generation only reads the schema. Keep this release check
# independent from database availability and credentials.
if ! env -u DATABASE_URL pnpm run prisma:generate >"$output_file" 2>&1; then
  cat "$output_file"
  exit 1
fi

cat "$output_file"

if grep -Eiq \
  '((no|default|implicit)[[:space:]]+output([[:space:]]+path)?|output[[:space:]]+path).*(deprecated|will no longer|unsupported|removed)|((deprecated|will no longer|unsupported|removed).*(no|default|implicit)[[:space:]]+output([[:space:]]+path)?|output[[:space:]]+path)' \
  "$output_file"; then
  printf '%s\n' \
    'Prisma release check failed: generation emitted a deprecated implicit output-path warning.' >&2
  exit 1
fi

printf '%s\n' 'Prisma release check passed: generation completed without an implicit output-path warning.'