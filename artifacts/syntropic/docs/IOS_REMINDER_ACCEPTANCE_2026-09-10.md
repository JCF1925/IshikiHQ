# Physical iPhone reminder acceptance

## Scope and identification

- Acceptance date: 2026-09-10 (Australia/Melbourne; exact time not recorded)
- Device: physical iPhone 16 Pro Max
- Operating system: iOS 26.6.1
- Ishiki app version reported by tester: 1.0.0
- Native build number: not displayed or reported
- Source revision at evidence capture:
  `1205c97876cae8d83c39f904e5977beba9316ba2`
- Tester identity: not recorded in repository
- Release scope decision: iOS only

The tester confirmed all five required iPhone outcomes after following the
physical-device checklist. This record intentionally excludes medication names,
schedule identifiers, account details, notification payload identifiers,
screenshots, and dose contents.

## Results

| Check | Result |
| --- | --- |
| A reminder arrived while Ishiki was closed and used generic lock-screen text by default | PASS |
| The medication name appeared only after explicit lock-screen reveal opt-in | PASS |
| Restoring notification permission in iOS Settings restored reminder delivery | PASS |
| Tapping after a cold start and unlock opened the correct medication schedule | PASS |
| Repeated reminder actions produced exactly one dose record | PASS |

## Decision

The physical-device reminder privacy and recovery gate passes for the iOS-only
release scope. Android is not release-ready and is not being distributed at this
stage. Tracked follow-up #483 must pass on a real Android device before Android
distribution is enabled.