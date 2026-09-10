import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertTaskExportIsNewer,
  enforceReleaseCapacities,
  getChecklistCoverage,
  mergeRegister,
  rankScore,
  renderMarkdown,
  renderTesterBrief,
  snapshotFromTaskServiceExport,
  validateRegister,
  withExclusiveLock,
  type Register,
  type Snapshot,
  type TaskServiceExport,
} from "./task-priority-register.js";

const config = {
  schemaVersion: 1 as const,
  recentCompletedLimit: 5,
  releases: [{
    id: "R1",
    name: "Test release",
    status: "testing-next" as const,
    capacity: 2,
    stabilizationReserve: 0,
    testerOutcomeLimit: 2,
    testerOutcomeRefs: ["#1", "#6", "#7"],
    testingGoal: "Test one coherent outcome.",
    entryDependencies: [],
    releaseGate: "Acceptance passes.",
    feedbackFocus: "Recovery.",
    knownExclusions: ["Later work is excluded."],
  }],
};

const task = (taskRef: string, title: string, state = "PENDING", dependsOn: string[] = []) => ({
  taskRef,
  title,
  state,
  displayState: state,
  dependsOn,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
});

const snapshot = (tasks: ReturnType<typeof task>[]): Snapshot => ({
  schemaVersion: 1,
  capturedAt: "2026-09-09T01:00:00.000Z",
  source: "test",
  activeTaskCount: tasks.filter((item) => item.state === "PENDING").length,
  complete: true,
  tasks,
});

const serviceExport = (overrides: Partial<TaskServiceExport> = {}): TaskServiceExport => ({
  schemaVersion: 1,
  capturedAt: "2026-09-09T02:00:00.000Z",
  source: "test task service",
  activePartitions: [
    { state: "PROPOSED", totalCount: 1, truncated: false, tasks: [task("#2", "New task", "PROPOSED", ["#1"])] },
    { state: "PENDING", totalCount: 0, truncated: false, tasks: [] },
    { state: "IN_PROGRESS", totalCount: 0, truncated: false, tasks: [] },
    { state: "MERGING", totalCount: 0, truncated: false, tasks: [] },
  ],
  terminalTasks: [],
  dependencyTasks: [task("#1", "Completed dependency", "MERGED")],
  ...overrides,
});

describe("versioned task priority register", () => {
  it("bootstraps existing work but leaves newly observed work untriaged", () => {
    const initial = mergeRegister(snapshot([task("#1", "Prevent privacy leaks")]), undefined, {
      schemaVersion: 1,
      tasks: {},
    }, true);
    assert.equal(initial.tasks["#1"]?.priority, "critical");

    const refreshed = mergeRegister(snapshot([
      task("#1", "Prevent privacy leaks"),
      task("#2", "Add a new workflow"),
    ]), initial, { schemaVersion: 1, tasks: {} }, false);
    assert.equal(refreshed.tasks["#1"]?.priority, "critical");
    assert.equal(refreshed.tasks["#2"]?.priority, "untriaged");
    assert.equal(refreshed.tasks["#2"]?.release, "unassigned");
  });

  it("preserves manual overrides and task history across state changes", () => {
    const initial = mergeRegister(snapshot([task("#1", "Confirm recovery")]), undefined, {
      schemaVersion: 1,
      tasks: {
        "#1": { priority: "medium", size: "XL", release: "R1", rationale: "Explicit product decision." },
      },
    }, true);
    const completedSnapshot = snapshot([{ ...task("#1", "Confirm recovery", "MERGED"), updatedAt: "2026-09-09T02:00:00.000Z" }]);
    const completed = mergeRegister(completedSnapshot, initial, {
      schemaVersion: 1,
      tasks: {
        "#1": { priority: "medium", size: "XL", release: "R1", rationale: "Explicit product decision." },
      },
    }, false);
    assert.equal(completed.tasks["#1"]?.state, "MERGED");
    assert.equal(completed.tasks["#1"]?.priority, "medium");
    assert.equal(completed.tasks["#1"]?.manualOverride, true);
    assert.equal(completed.tasks["#1"]?.firstSeenAt, initial.tasks["#1"]?.firstSeenAt);
  });

  it("ranks smaller high-priority work above larger medium-priority work", () => {
    const register = mergeRegister(snapshot([
      task("#1", "Catch a regression"),
      task("#2", "Build a workflow"),
    ]), undefined, {
      schemaVersion: 1,
      tasks: {
        "#1": { priority: "high", size: "S" },
        "#2": { priority: "medium", size: "L" },
      },
    }, true);
    assert.ok(rankScore(register.tasks["#1"]!) > rankScore(register.tasks["#2"]!));
  });

  it("keeps release load within capacity while preserving manual assignments", () => {
    const register = mergeRegister(snapshot([
      task("#1", "Prevent privacy leaks"),
      task("#2", "Catch a release regression"),
      task("#3", "Confirm account recovery"),
    ]), undefined, {
      schemaVersion: 1,
      tasks: {
        "#3": { priority: "medium", size: "L", release: "R1", rationale: "User-selected release." },
      },
    }, true);
    enforceReleaseCapacities(register, config);
    const assigned = Object.values(register.tasks).filter((item) => item.release === "R1");
    assert.equal(assigned.length, 2);
    assert.equal(register.tasks["#3"]?.release, "R1");
    assert.equal(register.tasks["#3"]?.manualOverride, true);
    assert.equal(Object.values(register.tasks).filter((item) => item.release === "unassigned").length, 1);
  });

  it("rejects incomplete snapshots and unknown releases", () => {
    const source = snapshot([task("#1", "Confirm recovery")]);
    source.complete = false;
    const register = mergeRegister(source, undefined, {
      schemaVersion: 1,
      tasks: { "#1": { release: "R99" } },
    }, true);
    const validation = validateRegister(source, register, config);
    assert.ok(validation.errors.some((error) => error.includes("not marked complete")));
    assert.ok(validation.errors.some((error) => error.includes("unknown release")));
    const noActiveRelease = {
      ...config,
      releases: [{ ...config.releases[0]!, status: "planned" as const }],
    };
    const releaseValidation = validateRegister(snapshot([task("#1", "Confirm recovery")]), register, noActiveRelease);
    assert.ok(releaseValidation.errors.some((error) => error.includes("Exactly one release")));
  });

  it("renders release goals, untriaged work, dependencies, and recent history", () => {
    const source = snapshot([
      task("#1", "Confirm recovery"),
      task("#2", "New task", "PENDING", ["#1"]),
      { ...task("#3", "Completed task", "MERGED"), updatedAt: "2026-09-09T03:00:00.000Z" },
    ]);
    source.activeTaskCount = 2;
    const register = mergeRegister(source, undefined, {
      schemaVersion: 1,
      tasks: { "#1": { priority: "high", size: "S", release: "R1" } },
    }, false);
    const validation = validateRegister(source, register, config);
    const markdown = renderMarkdown(register, config, validation);
    assert.match(markdown, /R1 — Test release/);
    assert.match(markdown, /New task/);
    assert.match(markdown, /Waiting: #1/);
    assert.match(markdown, /Recently completed or closed/);
    assert.match(markdown, /Completed task/);
    assert.ok(markdown.includes("task-priority/briefs/R1.md"));
  });

  it("only lists completed, triaged, dependency-ready outcomes in tester briefs", () => {
    const source = snapshot([
      task("#1", "Ready outcome", "MERGED"),
      task("#2", "Blocked outcome", "MERGED", ["#3"]),
      task("#3", "Dependency still active"),
      task("#4", "Untriaged completed outcome", "MERGED"),
      task("#5", "Unfinished outcome"),
      task("#6", "Second ready outcome", "MERGED"),
      task("#7", "Third ready outcome", "MERGED"),
      task("#8", "Run release checks automatically in CI", "MERGED"),
    ]);
    source.activeTaskCount = 2;
    const register = mergeRegister(source, undefined, {
      schemaVersion: 1,
      tasks: {
        "#1": { priority: "high", size: "S", release: "R1" },
        "#2": { priority: "high", size: "S", release: "R1" },
        "#3": { priority: "high", size: "S", release: "R1" },
        "#5": { priority: "high", size: "S", release: "R1" },
        "#6": { priority: "high", size: "S", release: "R1" },
        "#7": { priority: "high", size: "S", release: "R1" },
        "#8": { priority: "high", size: "S", release: "R1" },
      },
    }, false);
    const brief = renderTesterBrief(config.releases[0]!, register, config);
    assert.match(brief, /#1 Ready outcome/);
    assert.doesNotMatch(brief, /#2 Blocked outcome/);
    assert.doesNotMatch(brief, /#4 Untriaged completed outcome/);
    assert.doesNotMatch(brief, /#5 Unfinished outcome/);
    assert.doesNotMatch(brief, /^- \[ \] #8 Run release checks/m);
    assert.equal(brief.match(/^- \[ \]/gm)?.length, 2);
    assert.match(brief, /1 additional validated baseline outcome is outside this focused pass/);
    assert.match(brief, /## Ready outcomes missing tester coverage/);
    assert.match(brief, /#8 Run release checks automatically in CI — Unexplained checklist gap \(warn policy\)/);
    assert.match(brief, /Version: `R1`/);
    assert.ok(brief.includes("Defect title starts with `[R1]`"));
    assert.match(brief, /does not authorize publishing or deployment/);

    register.tasks["#1"]!.release = "unassigned";
    const reassignedBrief = renderTesterBrief(config.releases[0]!, register, config);
    assert.doesNotMatch(reassignedBrief, /#1 Ready outcome/);

    const futureRelease = { ...config.releases[0]!, id: "R2", status: "planned" as const };
    const futureBrief = renderTesterBrief(futureRelease, register, { ...config, releases: [config.releases[0]!, futureRelease] });
    assert.match(futureBrief, /Prepared outcomes for a future test cycle/);
    assert.doesNotMatch(futureBrief, /## Ready-to-test outcomes/);
    assert.doesNotMatch(futureBrief, /## Report a defect/);
    assert.ok(futureBrief.includes("Continue using the [R1 tester brief]"));
    assert.match(futureBrief, /Planned feedback prompts \(inactive\)/);
    assert.match(futureBrief, /Do not use these prompts/);
    assert.doesNotMatch(futureBrief, /authorizes testing only/);
    assert.match(futureBrief, /authorizes neither testing nor publishing or deployment/);
  });

  it("reports every ready checklist gap and supports explicit exclusion reasons", () => {
    const source = snapshot([
      task("#1", "Listed outcome", "MERGED"),
      task("#2", "Intentionally deferred outcome", "MERGED"),
      task("#3", "Reassigned outcome", "MERGED"),
    ]);
    const register = mergeRegister(source, undefined, {
      schemaVersion: 1,
      tasks: {
        "#1": { priority: "high", size: "S", release: "R1" },
        "#2": { priority: "high", size: "S", release: "R1" },
        "#3": { priority: "high", size: "S", release: "R1" },
      },
    }, false);
    const release = {
      ...config.releases[0]!,
      testerOutcomeRefs: ["#1"],
      testerOutcomeExclusions: [{ taskRef: "#2", reason: "Held for the later regression pass." }],
    };
    const exclusionConfig = { ...config, releases: [release] };
    const coverage = getChecklistCoverage(release, register);
    assert.deepEqual(coverage.missing.map(({ task, exclusionReason }) => [task.taskRef, exclusionReason]), [
      ["#2", "Held for the later regression pass."],
      ["#3", undefined],
    ]);
    const validation = validateRegister(source, register, exclusionConfig);
    assert.equal(validation.errors.length, 0);
    assert.ok(validation.warnings.some((warning) => warning.includes("#3 Reassigned outcome")));
    const brief = renderTesterBrief(release, register, exclusionConfig);
    assert.match(brief, /#2 Intentionally deferred outcome — Intentional exclusion: Held for the later regression pass\./);
    assert.match(brief, /#3 Reassigned outcome — Unexplained checklist gap \(warn policy\)/);

    const strictConfig = {
      ...exclusionConfig,
      releases: [{ ...release, checklistGapPolicy: "error" as const }],
    };
    const strictValidation = validateRegister(source, register, strictConfig);
    assert.ok(strictValidation.errors.some((error) => error.includes("unexplained ready outcome")));

    register.tasks["#1"]!.release = "unassigned";
    const assignmentValidation = validateRegister(source, register, exclusionConfig);
    assert.ok(assignmentValidation.errors.some((error) => error.includes("#1 is not assigned to R1")));

    register.tasks["#3"]!.release = "unassigned";
    const reassignedValidation = validateRegister(source, register, exclusionConfig);
    assert.doesNotMatch(reassignedValidation.warnings.join("\n"), /#3 Reassigned outcome/);
  });

  it("builds a complete snapshot from state-partitioned task-service exports", () => {
    const payload = serviceExport();
    payload.activePartitions[1] = {
      state: "PENDING",
      totalCount: 1,
      truncated: false,
      tasks: [task("#3", "Accepted main task", "MAIN_PENDING")],
    };
    payload.activePartitions[2] = {
      state: "IN_PROGRESS",
      totalCount: 1,
      truncated: false,
      tasks: [task("#4", "Assigned main task", "MAIN_IN_PROGRESS")],
    };
    const source = snapshotFromTaskServiceExport(payload);
    assert.equal(source.complete, true);
    assert.equal(source.activeTaskCount, 3);
    assert.deepEqual(source.tasks.map((item) => item.taskRef), ["#1", "#2", "#3", "#4"]);
  });

  it("rejects truncated exports and unresolved dependency closure", () => {
    const truncated = serviceExport();
    truncated.activePartitions[0]!.truncated = true;
    assert.throws(() => snapshotFromTaskServiceExport(truncated), /truncated/);

    const unresolved = serviceExport({ dependencyTasks: [] });
    assert.throws(() => snapshotFromTaskServiceExport(unresolved), /unresolved dependencies/);
  });

  it("rejects stale or replayed task-service exports", () => {
    assert.doesNotThrow(() => assertTaskExportIsNewer(
      "2026-09-09T02:00:00.001Z",
      "2026-09-09T02:00:00.000Z",
    ));
    assert.throws(() => assertTaskExportIsNewer(
      "2026-09-09T02:00:00.000Z",
      "2026-09-09T02:00:00.000Z",
    ), /stale/);
  });

  it("serializes concurrent task-change updates with one exclusive lock", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "task-priority-lock-"));
    const lockPath = path.join(directory, ".update.lock");
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
    const releaseFirstPromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];
    try {
      const first = withExclusiveLock(lockPath, async () => {
        order.push("first-start");
        firstStarted();
        await releaseFirstPromise;
        order.push("first-end");
      });
      await firstStartedPromise;
      const second = withExclusiveLock(lockPath, async () => {
        order.push("second");
      });
      releaseFirst();
      await Promise.all([first, second]);
      assert.deepEqual(order, ["first-start", "first-end", "second"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});