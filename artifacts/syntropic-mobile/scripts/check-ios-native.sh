#!/usr/bin/env bash

set -Eeuo pipefail

readonly expected_module="SyntropicHealthKitModule"
readonly app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ios_root="${app_root}/ios"
readonly log_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/syntropic-ios-native"
readonly autolinking_log="${log_root}/autolinking.json"
readonly pod_log="${log_root}/pod-install.log"
readonly xcode_log="${log_root}/xcodebuild.log"
generated_ios=false

fail() {
  printf 'iOS native validation failed: %s\n' "$*" >&2
  exit 1
}

print_native_diagnostics() {
  local log_file="$1"

  if [[ ! -f "$log_file" ]]; then
    return
  fi

  printf '\nRelevant Swift, HealthKit, CocoaPods, and Xcode diagnostics:\n' >&2
  grep -E -i \
    '(^|[[:space:]])error:|fatal error|Swift|HealthKit|SyntropicHealthKit|ExpoModulesCore|CocoaPods|podspec' \
    "$log_file" | tail -n 200 >&2 || true
}

cleanup() {
  if [[ "$generated_ios" == true ]]; then
    rm -rf "$ios_root"
  fi
}
trap cleanup EXIT

[[ "$(uname -s)" == "Darwin" ]] ||
  fail "this check requires macOS with Xcode and CocoaPods"

for command_name in pnpm pod xcodebuild ruby grep find tee; do
  command -v "$command_name" >/dev/null 2>&1 ||
    fail "required command is unavailable: ${command_name}"
done

[[ ! -e "$ios_root" ]] ||
  fail "${ios_root} already exists; run this check from a clean checkout so generated native files cannot overwrite local work"

mkdir -p "$log_root"
generated_ios=true

printf 'Using %s\n' "$(xcodebuild -version | tr '\n' ' ')"
printf 'Using CocoaPods %s\n' "$(pod --version)"

printf 'Generating the Ishiki iOS project without installing pods...\n'
(
  cd "$app_root"
  CI=1 pnpm exec expo prebuild --platform ios --no-install
)

printf 'Resolving Expo Apple modules...\n'
(
  cd "$app_root"
  pnpm exec expo-modules-autolinking resolve \
    --platform apple \
    --project-root "$app_root" \
    --json
) >"$autolinking_log"

grep -Fq "$expected_module" "$autolinking_log" ||
  fail "Expo autolinking did not resolve ${expected_module}; inspect ${autolinking_log}"

printf 'Installing CocoaPods dependencies...\n'
if ! (
  cd "$ios_root"
  pod install 2>&1 | tee "$pod_log"
); then
  print_native_diagnostics "$pod_log"
  fail "CocoaPods could not integrate the local HealthKit module; inspect ${pod_log}"
fi

provider_file="$(
  find "$ios_root" -type f -name '*ExpoModulesProvider*.swift' \
    -exec grep -l -F "$expected_module" {} + 2>/dev/null |
    head -n 1 || true
)"
[[ -n "$provider_file" ]] ||
  fail "the generated Expo modules provider does not include ${expected_module}"

workspace_count="$(
  find "$ios_root" -maxdepth 2 -type d -name '*.xcworkspace' -print |
    wc -l |
    tr -d '[:space:]'
)"
[[ "$workspace_count" == "1" ]] ||
  fail "expected exactly one generated Xcode workspace, found ${workspace_count}"
workspace="$(
  find "$ios_root" -maxdepth 2 -type d -name '*.xcworkspace' -print |
    head -n 1
)"
expected_scheme="$(basename "$workspace" .xcworkspace)"

workspace_json="${log_root}/workspace.json"
workspace_log="${log_root}/workspace-list.log"
if ! xcodebuild -workspace "$workspace" -list -json \
  >"$workspace_json" 2>"$workspace_log"; then
  print_native_diagnostics "$workspace_log"
  fail "Xcode could not inspect the generated workspace; inspect ${workspace_log}"
fi
scheme="$(
  ruby -rjson -e '
    data = JSON.parse(File.read(ARGV.fetch(0)))
    schemes = data.fetch("workspace", {}).fetch("schemes", [])
    expected = ARGV.fetch(1)
    abort "expected app scheme #{expected.inspect}; available schemes: #{schemes.join(", ")}" unless schemes.include?(expected)
    puts expected
  ' "$workspace_json" "$expected_scheme"
)" || fail "could not determine the generated Xcode scheme"

printf 'Compiling scheme %s for the iOS Simulator...\n' "$scheme"
if ! xcodebuild \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build 2>&1 | tee "$xcode_log"; then
  print_native_diagnostics "$xcode_log"
  fail "Xcode could not compile the generated Ishiki iOS target; inspect ${xcode_log}"
fi

printf 'iOS native validation passed: %s is linked and the generated Xcode target compiles.\n' \
  "$expected_module"