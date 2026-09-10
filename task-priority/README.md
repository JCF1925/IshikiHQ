# Task priority data feed

`TASK_PRIORITY.md` and `register.json` are generated from project-task service exports.
The same refresh writes one focused tester brief per configured release under `briefs/`.
Task-change automation should write an export to a temporary file and run:

```sh
pnpm task-priority:ingest -- /tmp/project-task-export.json
```

The command acquires `task-priority/.update.lock`, rejects stale or incomplete input,
and atomically replaces each generated file before releasing the lock. Manual decisions
from `overrides.json` and prior register annotations are merged after validation.
Each release explicitly curates tester-visible outcomes with `testerOutcomeRefs` in
`config.json`; generation then keeps only completed, triaged, dependency-ready tasks
that remain assigned to that release. Ready outcomes omitted from a checklist are
listed in the generated brief. Maintainers can record an intentional omission with
`testerOutcomeExclusions` (`taskRef` plus a short `reason`). Set
`checklistGapPolicy` to `error` to block refresh/check for unexplained gaps, or
`warn` to keep the release usable while making each gap visible in validation output.

## Export contract

The JSON payload has `schemaVersion: 1`, an ISO `capturedAt`, a human-readable `source`,
and these arrays:

- `activePartitions`: exactly one partition for each of `PROPOSED`, `PENDING`,
  `IN_PROGRESS`, and `MERGING`
- `terminalTasks`: tasks closed since the previous accepted export
- `dependencyTasks`: any additional tasks needed to provide the full dependency closure

Each active partition includes `totalCount`, `truncated`, and `tasks`. Before setting
`truncated` to `false`, the producer must reconcile any shortened task-service response
with exact-reference queries. The number of tasks must equal `totalCount`.

`PENDING` may contain `MAIN_PENDING`; `IN_PROGRESS` may contain `MAIN_IN_PROGRESS`.
Every task has this normalized shape:

```json
{
  "taskRef": "#123",
  "title": "Concrete user outcome",
  "state": "PENDING",
  "displayState": "PENDING",
  "dependsOn": ["#122"],
  "createdAt": "2026-09-09T00:00:00.000Z",
  "updatedAt": "2026-09-09T00:01:00.000Z"
}
```

Exports must arrive in increasing `capturedAt` order. A replayed or older export is
rejected so a delayed event cannot roll the register back.