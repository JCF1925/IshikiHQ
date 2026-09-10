import assert from "node:assert/strict";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRIORITIES = ["critical", "high", "medium", "low", "untriaged"] as const;
export const SIZES = ["XS", "S", "M", "L", "XL", "untriaged"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Size = (typeof SIZES)[number];
export type ChecklistGapPolicy = "error" | "warn";

export type SnapshotTask = {
  taskRef: string;
  title: string;
  state: string;
  displayState?: string;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
};

export type Snapshot = {
  schemaVersion: 1;
  capturedAt: string;
  source: string;
  activeTaskCount?: number;
  complete?: boolean;
  tasks: SnapshotTask[];
};

export type Release = {
  id: string;
  name: string;
  status: "testing-next" | "developing" | "planned";
  capacity: number;
  stabilizationReserve: number;
  testerOutcomeLimit: number;
  testerOutcomeRefs: string[];
  testerOutcomeExclusions?: ChecklistExclusion[];
  checklistGapPolicy?: ChecklistGapPolicy;
  testingGoal: string;
  entryDependencies: string[];
  releaseGate: string;
  feedbackFocus: string;
  knownExclusions: string[];
};

export type ChecklistExclusion = {
  taskRef: string;
  reason: string;
};

export type Config = {
  schemaVersion: 1;
  recentCompletedLimit: number;
  releases: Release[];
};

export type Override = {
  priority?: Priority;
  size?: Size;
  release?: string;
  rationale?: string;
  note?: string;
};

export type Overrides = {
  schemaVersion: 1;
  tasks: Record<string, Override>;
};

export type RegisterTask = SnapshotTask & {
  priority: Priority;
  size: Size;
  release: string;
  rationale: string;
  manualOverride: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type Register = {
  schemaVersion: 1;
  refreshedAt: string;
  sourceCapturedAt: string;
  tasks: Record<string, RegisterTask>;
};

type Validation = {
  errors: string[];
  warnings: string[];
};

export type TaskExportPartition = {
  state: "PROPOSED" | "PENDING" | "IN_PROGRESS" | "MERGING";
  totalCount: number;
  truncated: boolean;
  tasks: SnapshotTask[];
};

export type TaskServiceExport = {
  schemaVersion: 1;
  capturedAt: string;
  source: string;
  activePartitions: TaskExportPartition[];
  terminalTasks: SnapshotTask[];
  dependencyTasks: SnapshotTask[];
};

const ACTIVE_STATES = new Set([
  "PROPOSED",
  "PENDING",
  "IN_PROGRESS",
  "MAIN_PENDING",
  "MAIN_IN_PROGRESS",
  "MERGING",
]);
const COMPLETE_STATES = new Set(["MERGED", "IMPLEMENTED"]);
const TERMINAL_STATES = new Set(["MERGED", "IMPLEMENTED", "CANCELLED"]);

const priorityPoints: Record<Priority, number> = {
  critical: 500,
  high: 380,
  medium: 250,
  low: 120,
  untriaged: 40,
};
const sizePenalty: Record<Size, number> = {
  XS: 0,
  S: 20,
  M: 55,
  L: 100,
  XL: 160,
  untriaged: 80,
};

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function suggestPriority(title: string): Priority {
  const value = title.toLowerCase();
  if (includesAny(value, [
    "privacy", "credential", "deleted account", "unsafe", "ownership",
    "security", "data leak", "release gate", "release check",
  ])) return "critical";
  if (includesAny(value, [
    "prevent", "catch", "confirm", "reject", "failure", "failed",
    "recovery", "recover", "duplicate", "protected", "broken",
  ])) return "high";
  if (includesAny(value, ["let users", "show users", "add ", "build ", "save ", "track "])) return "medium";
  return "low";
}

export function suggestSize(title: string): Size {
  const value = title.toLowerCase();
  if (includesAny(value, ["all remaining", "across every", "household", "end to end"])) return "XL";
  if (includesAny(value, ["build ", "complete ", "track ", "save recipes", "workflow"])) return "L";
  if (includesAny(value, ["prevent ", "let users", "show users", "restore ", "make ", "add "])) return "M";
  if (includesAny(value, ["catch ", "confirm ", "audit ", "keep ", "run ", "prove "])) return "S";
  return "M";
}

function themeFor(title: string) {
  const value = title.toLowerCase();
  if (includesAny(value, [
    "privacy", "security", "credential", "deleted", "unsafe", "ownership",
    "release", "recovery", "recover", "database gate", "audit",
  ])) return "trust";
  if (includesAny(value, [
    "health", "medication", "claim", "medicare", "pathology", "income",
    "money", "pay ", "stock", "refill", "debt", "work",
  ])) return "daily";
  if (includesAny(value, [
    "calendar", "google", "feedback", "household", "recipe", "study",
    "upload", "import", "mobile", "notification",
  ])) return "connected";
  return "backlog";
}

function suggestedRelease(title: string, priority: Priority, size: Size) {
  const theme = themeFor(title);
  if (theme === "trust" && priority !== "low" && size !== "XL") return "R1";
  if (theme === "daily" && size !== "XL") return "R2";
  if (theme === "connected") return "R3";
  return "unassigned";
}

function suggestionRationale(task: SnapshotTask, priority: Priority, size: Size, release: string) {
  const theme = themeFor(task.title);
  const impact = priority === "critical"
    ? "Protects a high-risk privacy, account, or release-safety boundary"
    : priority === "high"
      ? "Prevents or detects a concrete reliability regression"
      : priority === "medium"
        ? "Adds a user-visible workflow improvement"
        : "Has lower immediate user or release risk";
  const effort = size === "S" || size === "XS"
    ? "appears narrowly scoped"
    : size === "L" || size === "XL"
      ? "appears to span a broad workflow"
      : "appears moderately scoped";
  const grouping = release === "unassigned"
    ? "kept in the unscheduled backlog pending product grouping"
    : `grouped into ${release} by its ${theme} testing theme`;
  return `${impact}; ${effort}; ${grouping}.`;
}

export function isActive(task: Pick<SnapshotTask, "state">) {
  return ACTIVE_STATES.has(task.state);
}

function partitionMatches(partition: TaskExportPartition, task: SnapshotTask) {
  if (partition.state === "IN_PROGRESS") {
    return task.state === "IN_PROGRESS" || task.state === "MAIN_IN_PROGRESS";
  }
  if (partition.state === "PENDING") {
    return task.state === "PENDING" || task.state === "MAIN_PENDING";
  }
  return task.state === partition.state;
}

export function snapshotFromTaskServiceExport(payload: TaskServiceExport): Snapshot {
  assert.equal(payload.schemaVersion, 1, "Unsupported task-service export schema.");
  assert.ok(!Number.isNaN(Date.parse(payload.capturedAt)), "Task-service export capturedAt must be an ISO timestamp.");
  const requiredStates = ["PROPOSED", "PENDING", "IN_PROGRESS", "MERGING"] as const;
  const partitions = new Map(payload.activePartitions.map((partition) => [partition.state, partition]));
  assert.equal(partitions.size, payload.activePartitions.length, "Task-service export contains duplicate active partitions.");
  const activeTasks = new Map<string, SnapshotTask>();
  let expectedActiveCount = 0;
  for (const state of requiredStates) {
    const partition = partitions.get(state);
    assert.ok(partition, `Task-service export is missing the ${state} partition.`);
    assert.equal(partition.truncated, false, `${state} task export is truncated.`);
    assert.equal(partition.tasks.length, partition.totalCount, `${state} task export count does not match totalCount.`);
    for (const task of partition.tasks) {
      assert.ok(partitionMatches(partition, task), `${task.taskRef} does not belong in the ${state} partition.`);
      assert.ok(!activeTasks.has(task.taskRef), `${task.taskRef} appears in more than one active partition.`);
      activeTasks.set(task.taskRef, task);
    }
    expectedActiveCount += partition.totalCount;
  }
  assert.equal(activeTasks.size, expectedActiveCount, "Deduplicated active task count does not match partition totals.");

  const tasks = new Map<string, SnapshotTask>();
  for (const task of payload.dependencyTasks) tasks.set(task.taskRef, task);
  for (const task of payload.terminalTasks) {
    assert.ok(TERMINAL_STATES.has(task.state), `${task.taskRef} is not terminal but appears in terminalTasks.`);
    tasks.set(task.taskRef, task);
  }
  for (const task of activeTasks.values()) tasks.set(task.taskRef, task);
  const unresolvedDependencies = [...new Set(
    [...tasks.values()].flatMap((task) => task.dependsOn),
  )].filter((taskRef) => !tasks.has(taskRef));
  assert.deepEqual(unresolvedDependencies, [], `Task-service export has unresolved dependencies: ${unresolvedDependencies.join(", ")}`);

  return {
    schemaVersion: 1,
    capturedAt: payload.capturedAt,
    source: `${payload.source} (complete task-service export)`,
    activeTaskCount: expectedActiveCount,
    complete: true,
    tasks: [...tasks.values()].sort((left, right) => refNumber(left.taskRef) - refNumber(right.taskRef)),
  };
}

export function assertTaskExportIsNewer(exportCapturedAt: string, currentCapturedAt: string) {
  assert.ok(
    new Date(exportCapturedAt).getTime() > new Date(currentCapturedAt).getTime(),
    `Task-service export is stale (${exportCapturedAt} <= ${currentCapturedAt}).`,
  );
}

const wait = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

export async function withExclusiveLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  timeoutMs = 5_000,
): Promise<T> {
  const startedAt = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for the task-priority update lock.");
      await wait(25);
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function writeAtomic(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, content, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

function refNumber(taskRef: string) {
  return Number(taskRef.replace(/^#/, "")) || Number.MAX_SAFE_INTEGER;
}

export function rankScore(task: RegisterTask) {
  const stateBoost = task.state === "IN_PROGRESS" || task.state === "MAIN_IN_PROGRESS" ? 80 : 0;
  const readinessBoost = task.dependsOn.length === 0 ? 15 : 0;
  return priorityPoints[task.priority] - sizePenalty[task.size] + stateBoost + readinessBoost;
}

function sortRanked(left: RegisterTask, right: RegisterTask) {
  return rankScore(right) - rankScore(left)
    || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    || refNumber(left.taskRef) - refNumber(right.taskRef);
}

export function mergeRegister(
  snapshot: Snapshot,
  previous: Register | undefined,
  overrides: Overrides,
  bootstrap: boolean,
): Register {
  const now = snapshot.capturedAt;
  const tasks: Record<string, RegisterTask> = { ...(previous?.tasks ?? {}) };
  for (const task of snapshot.tasks) {
    const existing = tasks[task.taskRef];
    const suggestionPriority = suggestPriority(task.title);
    const suggestionSize = suggestSize(task.title);
    const suggestionRelease = suggestedRelease(task.title, suggestionPriority, suggestionSize);
    const override = overrides.tasks[task.taskRef];
    const isInitialTask = bootstrap && !existing;
    const priority = override?.priority ?? existing?.priority ?? (isInitialTask ? suggestionPriority : "untriaged");
    const size = override?.size ?? existing?.size ?? (isInitialTask ? suggestionSize : "untriaged");
    const release = override?.release ?? existing?.release ?? (isInitialTask ? suggestionRelease : "unassigned");
    const rationale = override?.rationale
      ?? existing?.rationale
      ?? (isInitialTask
        ? suggestionRationale(task, priority, size, release)
        : "New task awaiting priority, size, and release triage.");
    tasks[task.taskRef] = {
      ...task,
      priority,
      size,
      release,
      rationale,
      manualOverride: Boolean(override),
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
  }
  return {
    schemaVersion: 1,
    refreshedAt: now,
    sourceCapturedAt: snapshot.capturedAt,
    tasks,
  };
}

export function enforceReleaseCapacities(register: Register, config: Config) {
  for (const release of config.releases) {
    const assigned = Object.values(register.tasks)
      .filter((task) => isActive(task) && task.release === release.id)
      .sort(sortRanked);
    const fixed = assigned.filter((task) => task.manualOverride);
    const calculated = assigned.filter((task) => !task.manualOverride);
    const plannedCapacity = Math.max(0, release.capacity - release.stabilizationReserve);
    const calculatedCapacity = Math.max(0, plannedCapacity - fixed.length);
    for (const task of calculated.slice(calculatedCapacity)) {
      task.release = "unassigned";
      task.rationale = `${task.rationale.replace(/\.$/, "")}; deferred from ${release.id} to keep the release within its testing capacity.`;
    }
  }
  return register;
}

export function validateRegister(snapshot: Snapshot, register: Register, config: Config): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const releaseIds = new Set(config.releases.map((release) => release.id));
  const releaseOrder = new Map(config.releases.map((release, index) => [release.id, index]));
  const snapshotRefs = new Set(snapshot.tasks.map((task) => task.taskRef));
  if (config.releases.filter((release) => release.status === "testing-next").length !== 1) {
    errors.push("Exactly one release must be the active testing-next stabilization version.");
  }

  if (snapshot.complete !== true) errors.push("Snapshot is not marked complete.");
  const activeSnapshotCount = snapshot.tasks.filter(isActive).length;
  if (snapshot.activeTaskCount !== activeSnapshotCount) {
    errors.push(`Snapshot active count is ${activeSnapshotCount}, expected ${snapshot.activeTaskCount ?? "unset"}.`);
  }
  for (const task of snapshot.tasks.filter(isActive)) {
    if (!register.tasks[task.taskRef]) errors.push(`${task.taskRef} is active in the snapshot but missing from the register.`);
  }
  for (const task of Object.values(register.tasks)) {
    if (task.release !== "unassigned" && !releaseIds.has(task.release)) {
      errors.push(`${task.taskRef} references unknown release ${task.release}.`);
    }
    if (isActive(task) && (task.priority === "untriaged" || task.size === "untriaged")) {
      warnings.push(`${task.taskRef} is awaiting priority or size triage.`);
    }
    for (const dependency of task.dependsOn) {
      const dependencyTask = register.tasks[dependency];
      if (!dependencyTask && !snapshotRefs.has(dependency)) {
        warnings.push(`${task.taskRef} references dependency ${dependency}, which is absent from the snapshot and register.`);
      } else if (
        isActive(task)
        && task.release !== "unassigned"
        && dependencyTask
        && !COMPLETE_STATES.has(dependencyTask.state)
        && dependencyTask.release === "unassigned"
      ) {
        warnings.push(`${task.taskRef} is assigned to ${task.release}, but active dependency ${dependency} has no release.`);
      } else if (
        isActive(task)
        && task.release !== "unassigned"
        && dependencyTask
        && isActive(dependencyTask)
        && dependencyTask.release !== "unassigned"
        && releaseOrder.get(dependencyTask.release)! > releaseOrder.get(task.release)!
      ) {
        errors.push(`${task.taskRef} is assigned to ${task.release} before active dependency ${dependency} in ${dependencyTask.release}.`);
      }
    }
  }
  for (const release of config.releases) {
    if (!Number.isInteger(release.testerOutcomeLimit) || release.testerOutcomeLimit < 1) {
      errors.push(`${release.id} tester outcome limit must be a positive integer.`);
    }
    if (new Set(release.testerOutcomeRefs).size !== release.testerOutcomeRefs.length) {
      errors.push(`${release.id} tester outcome references must be unique.`);
    }
    const checklistGapPolicy = release.checklistGapPolicy ?? "warn";
    if (checklistGapPolicy !== "error" && checklistGapPolicy !== "warn") {
      errors.push(`${release.id} checklist gap policy must be "error" or "warn".`);
    }
    const exclusionRefs = new Set<string>();
    for (const exclusion of release.testerOutcomeExclusions ?? []) {
      const reason = exclusion.reason.trim();
      if (exclusionRefs.has(exclusion.taskRef)) {
        errors.push(`${release.id} tester outcome exclusions must be unique.`);
      }
      exclusionRefs.add(exclusion.taskRef);
      if (!register.tasks[exclusion.taskRef]) {
        errors.push(`${release.id} tester outcome exclusion ${exclusion.taskRef} is absent from the register.`);
      } else if (register.tasks[exclusion.taskRef]!.release !== release.id) {
        errors.push(`${release.id} tester outcome exclusion ${exclusion.taskRef} is not assigned to ${release.id}.`);
      }
      if (release.testerOutcomeRefs.includes(exclusion.taskRef)) {
        errors.push(`${release.id} task ${exclusion.taskRef} cannot be both a tester outcome and an exclusion.`);
      }
      if (reason.length === 0) {
        errors.push(`${release.id} tester outcome exclusion ${exclusion.taskRef} needs a reason.`);
      } else if (reason.length > 160) {
        errors.push(`${release.id} tester outcome exclusion ${exclusion.taskRef} reason must be 160 characters or fewer.`);
      }
    }
    for (const taskRef of release.testerOutcomeRefs) {
      const task = register.tasks[taskRef];
      if (!task) {
        errors.push(`${release.id} tester outcome ${taskRef} is absent from the register.`);
      } else if (task.release !== release.id) {
        errors.push(`${release.id} tester outcome ${taskRef} is not assigned to ${release.id}.`);
      }
    }
    const coverage = getChecklistCoverage(release, register);
    const unexplainedGaps = coverage.missing
      .filter(({ exclusionReason }) => !exclusionReason)
      .map(({ task }) => `${task.taskRef} ${task.title}`);
    if (unexplainedGaps.length > 0) {
      const message = `${release.id} has ${unexplainedGaps.length} unexplained ready outcome${unexplainedGaps.length === 1 ? "" : "s"} missing tester coverage: ${unexplainedGaps.join("; ")}.`;
      if (checklistGapPolicy === "error") errors.push(message);
      else warnings.push(message);
    }
    if (
      !Number.isInteger(release.stabilizationReserve)
      || release.stabilizationReserve < 0
      || release.stabilizationReserve >= release.capacity
    ) {
      errors.push(`${release.id} stabilization reserve must be a non-negative integer below its capacity.`);
    }
    const assigned = Object.values(register.tasks).filter((task) => isActive(task) && task.release === release.id);
    const plannedCapacity = release.capacity - release.stabilizationReserve;
    if (assigned.length > plannedCapacity) {
      warnings.push(`${release.id} has ${assigned.length} planned tasks, consuming its ${release.stabilizationReserve}-task stabilization reserve.`);
    }
    for (const dependency of release.entryDependencies) {
      if (!releaseIds.has(dependency)) errors.push(`${release.id} references unknown entry release ${dependency}.`);
    }
  }
  return { errors, warnings: [...new Set(warnings)] };
}

function dependencyLabel(task: RegisterTask, register: Register) {
  if (task.dependsOn.length === 0) return "Ready";
  const waiting = task.dependsOn.filter((dependency) => {
    const dependencyTask = register.tasks[dependency];
    return !dependencyTask || !COMPLETE_STATES.has(dependencyTask.state);
  });
  return waiting.length === 0 ? "Ready" : `Waiting: ${waiting.join(", ")}`;
}

function isTriaged(task: RegisterTask) {
  return task.priority !== "untriaged" && task.size !== "untriaged";
}

function completedReadyTasks(release: Release, register: Register) {
  return Object.values(register.tasks)
    .filter((task) =>
      task.release === release.id
      && COMPLETE_STATES.has(task.state)
      && isTriaged(task)
      && dependencyLabel(task, register) === "Ready"
    )
    .sort((left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      || sortRanked(left, right)
    );
}

export type ChecklistCoverage = {
  ready: RegisterTask[];
  checklist: RegisterTask[];
  missing: Array<{
    task: RegisterTask;
    exclusionReason?: string;
  }>;
};

export function getChecklistCoverage(release: Release, register: Register): ChecklistCoverage {
  const ready = completedReadyTasks(release, register);
  const checklistRefs = new Set(release.testerOutcomeRefs);
  const exclusions = new Map(
    (release.testerOutcomeExclusions ?? []).map((exclusion) => [
      exclusion.taskRef,
      exclusion.reason.trim(),
    ]),
  );
  return {
    ready,
    checklist: ready.filter((task) => checklistRefs.has(task.taskRef)),
    missing: ready
      .filter((task) => !checklistRefs.has(task.taskRef))
      .map((task) => ({
        task,
        exclusionReason: exclusions.get(task.taskRef) || undefined,
      })),
  };
}

export function renderTesterBrief(release: Release, register: Register, config: Config) {
  const coverage = getChecklistCoverage(release, register);
  const ready = coverage.checklist.slice(0, release.testerOutcomeLimit);
  const omittedReadyCount = coverage.checklist.length - ready.length;
  const checklistGapPolicy = release.checklistGapPolicy ?? "warn";
  const assigned = Object.values(register.tasks).filter((task) => task.release === release.id);
  const unfinished = assigned.filter((task) => isActive(task));
  const blocked = assigned.filter((task) => dependencyLabel(task, register) !== "Ready");
  const untriaged = assigned.filter((task) => !isTriaged(task));
  const earlierReleases = release.entryDependencies
    .map((releaseId) => config.releases.find((candidate) => candidate.id === releaseId))
    .filter((candidate): candidate is Release => Boolean(candidate));
  const activeLabel = release.status === "testing-next"
    ? "Active stabilization version"
    : "Not yet open as the active stabilization version";
  const outcomeHeading = release.status === "testing-next"
    ? "Ready-to-test outcomes"
    : "Prepared outcomes for a future test cycle";
  const feedbackFocus = release.feedbackFocus.replace(/[.!?]+$/, "").toLowerCase();
  const outcomeLines = ready.length === 0
    ? [release.status === "testing-next"
      ? "_No outcomes in this release are ready for tester sign-off yet._"
      : "_No curated outcomes in this release are prepared for a future test cycle yet._"]
    : ready.map((task) => `- [ ] ${task.taskRef} ${escapeCell(task.title)}`);
  const exclusions = [
    ...release.knownExclusions,
    ...(omittedReadyCount > 0
      ? [`${omittedReadyCount} additional validated baseline outcome${omittedReadyCount === 1 ? " is" : "s are"} outside this focused pass.`]
      : []),
    `${unfinished.length} assigned outcome${unfinished.length === 1 ? " is" : "s are"} still unfinished.`,
    `${blocked.length} assigned outcome${blocked.length === 1 ? " is" : "s are"} dependency-blocked.`,
    `${untriaged.length} assigned outcome${untriaged.length === 1 ? " is" : "s are"} awaiting triage.`,
    "Work assigned to other releases is outside this brief.",
  ];
  const activeRelease = config.releases.find((candidate) => candidate.status === "testing-next");
  const defectSection = release.status === "testing-next"
    ? [
      "## Report a defect",
      "",
      `Link every tester-found defect to stabilization version **${release.id}** and include:`,
      "",
      `- Version: \`${release.id}\``,
      `- Defect title starts with \`[${release.id}]\``,
      "- Affected outcome task reference from the checklist above",
      "- Expected result and actual result",
      "- Reproduction steps using privacy-safe test data",
      "- Sanitized evidence with no secrets, credentials, medical details, or financial values",
      "",
    ]
    : [
      "## Before this version opens",
      "",
      `Do not start this test cycle or report ${release.id} defects yet.${activeRelease ? ` Continue using the [${activeRelease.id} tester brief](./${activeRelease.id}.md) for the active stabilization version.` : ""}`,
      "",
    ];
  return [
    `# ${release.id} Tester Brief — ${release.name}`,
    "",
    `**Status:** ${activeLabel}`,
    "",
    `**Generated:** ${register.refreshedAt}`,
    "",
    "## Testing goal",
    "",
    release.testingGoal,
    "",
    "## Prerequisites",
    "",
    ...(earlierReleases.length === 0
      ? ["- No earlier release must be completed first."]
      : earlierReleases.map((dependency) => `- ${dependency.id} — ${dependency.name} has completed testing and its feedback is triaged.`)),
    `- Release gate: ${release.releaseGate}`,
    "- Use the approved test environment and keep secrets, credentials, and private health or financial content out of defect evidence.",
    "",
    `## ${outcomeHeading}`,
    "",
    ...outcomeLines,
    "",
    release.status === "testing-next"
      ? "Only completed, triaged, dependency-ready outcomes appear above."
      : "These completed, triaged, dependency-ready outcomes remain on hold until this release becomes the active stabilization version.",
    "",
    "## Ready outcomes missing tester coverage",
    "",
    ...(coverage.missing.length === 0
      ? ["_Every completed, triaged, dependency-ready assigned outcome is included in the checklist._"]
      : coverage.missing.map(({ task, exclusionReason }) =>
        `- ${task.taskRef} ${escapeCell(task.title)} — ${exclusionReason
          ? `Intentional exclusion: ${escapeCell(exclusionReason)}`
          : `Unexplained checklist gap (${checklistGapPolicy} policy).`}`)),
    "",
    "## Known exclusions",
    "",
    ...exclusions.map((exclusion) => `- ${exclusion}`),
    "",
    release.status === "testing-next" ? "## Feedback prompts" : "## Planned feedback prompts (inactive)",
    "",
    ...(release.status === "testing-next"
      ? []
      : ["Do not use these prompts until this release becomes the active stabilization version.", ""]),
    `- Did each listed outcome work from start to finish without unexpected access, data loss, or ambiguity?`,
    `- Where did you lose confidence, especially around ${feedbackFocus}?`,
    "- If something failed, could you understand what happened and recover without repeating or losing work?",
    "- What is the smallest change that would make this version safer or clearer to use?",
    "",
    ...defectSection,
    release.status === "testing-next"
      ? "This brief authorizes testing only. It does not authorize publishing or deployment."
      : "This held brief authorizes neither testing nor publishing or deployment.",
    "",
  ].join("\n");
}

export function renderTesterBriefs(register: Register, config: Config) {
  return new Map(config.releases.map((release) => [
    release.id,
    `${renderTesterBrief(release, register, config).replace(/\n{3,}/g, "\n\n")}\n`,
  ]));
}

function escapeCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function taskTable(tasks: RegisterTask[], register: Register) {
  if (tasks.length === 0) return "_No tasks assigned._\n";
  const rows = tasks.map((task, index) => [
    String(index + 1),
    `${task.taskRef} ${escapeCell(task.title)}`,
    task.displayState ?? task.state,
    task.priority,
    task.size,
    dependencyLabel(task, register),
    escapeCell(task.rationale),
  ]);
  return [
    "| Rank | Task | State | Priority | Size | Dependencies | Rationale |",
    "|---:|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");
}

export function renderMarkdown(register: Register, config: Config, validation: Validation) {
  const allTasks = Object.values(register.tasks);
  const active = allTasks.filter(isActive);
  const untriaged = active.filter((task) => task.priority === "untriaged" || task.size === "untriaged");
  const blocked = active.filter((task) => dependencyLabel(task, register) !== "Ready");
  const lines = [
    "# Ishiki Task Priority Register",
    "",
    `Last refreshed: **${register.refreshedAt}** from a task snapshot captured at **${register.sourceCapturedAt}**.`,
    "",
    `Active tasks: **${active.length}** · Untriaged: **${untriaged.length}** · Dependency-blocked: **${blocked.length}**`,
    "",
    "## Ranking policy",
    "",
    "- Priority: **critical → high → medium → low → untriaged**.",
    "- Size: **XS → S → M → L → XL → untriaged**.",
    "- Ranking favours higher-impact, smaller, ready work; work already in progress receives a continuity boost.",
    "- Manual overrides win over calculated suggestions and survive refreshes.",
    "- Newly observed tasks enter as **untriaged / unassigned**. A maintainer must confirm their priority, size, and release.",
    "- Versions are user-testing milestones, not automatic deployment approvals.",
    "",
    "## Release plan",
    "",
    "| Version | Status | Capacity | Fix reserve | Testing goal | Entry dependencies |",
    "|---|---|---:|---:|---|---|",
    ...config.releases.map((release) =>
      `| ${release.id} — ${release.name} | ${release.status} | ${release.capacity} | ${release.stabilizationReserve} | ${escapeCell(release.testingGoal)} | ${release.entryDependencies.join(", ") || "None"} |`
    ),
    "",
  ];

  for (const release of config.releases) {
    const tasks = active.filter((task) => task.release === release.id).sort(sortRanked);
    const plannedCapacity = release.capacity - release.stabilizationReserve;
    const additionalSpace = Math.max(0, plannedCapacity - tasks.length);
    lines.push(
      `## ${release.id} — ${release.name}`,
      "",
      `**Testing goal:** ${release.testingGoal}`,
      "",
      `**Release gate:** ${release.releaseGate}`,
      "",
      `**Feedback focus:** ${release.feedbackFocus}`,
      "",
      `**Tester brief:** [Open ${release.id} tester brief](task-priority/briefs/${release.id}.md)`,
      "",
      `**Planned load:** ${tasks.length}/${release.capacity} active tasks. ${release.stabilizationReserve} places are reserved for tester-found fixes${additionalSpace ? `, with ${additionalSpace} additional planning places open` : ""}.`,
      "",
      taskTable(tasks, register),
    );
  }

  const backlog = active.filter((task) => task.release === "unassigned").sort(sortRanked);
  lines.push("## Unassigned backlog", "", taskTable(backlog, register));

  lines.push("## Untriaged tasks", "");
  if (untriaged.length === 0) lines.push("_No active tasks are awaiting triage._", "");
  else lines.push(taskTable(untriaged.sort(sortRanked), register));

  lines.push("## Dependency-blocked tasks", "");
  if (blocked.length === 0) lines.push("_No active tasks have unresolved dependencies._", "");
  else lines.push(taskTable(blocked.sort(sortRanked), register));

  const recentlyCompleted = allTasks
    .filter((task) => TERMINAL_STATES.has(task.state))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, config.recentCompletedLimit);
  lines.push(
    "## Recently completed or closed",
    "",
    "| Task | State | Updated |",
    "|---|---|---|",
    ...recentlyCompleted.map((task) => `| ${task.taskRef} ${escapeCell(task.title)} | ${task.displayState ?? task.state} | ${task.updatedAt} |`),
    "",
    "## Data quality",
    "",
  );
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    lines.push("_No validation issues._", "");
  } else {
    for (const error of validation.errors) lines.push(`- **Error:** ${error}`);
    for (const warning of validation.warnings) lines.push(`- **Warning:** ${warning}`);
    lines.push("");
  }
  lines.push(
    "## Maintenance",
    "",
    "1. Feed each project-task change event's complete state-partitioned export to `pnpm task-priority:ingest -- <export.json>`.",
    "2. Add or amend explicit decisions in `task-priority/overrides.json`.",
    "3. Use `pnpm task-priority:refresh` only to regenerate from the committed snapshot.",
    "4. Run `pnpm task-priority:check` in release checks to catch missing tasks, invalid versions, or stale generated output.",
    "",
  );
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function workspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export async function ingestTaskServiceExport(payload: TaskServiceExport, root = workspaceRoot()) {
  const lockPath = path.join(root, "task-priority/.update.lock");
  await withExclusiveLock(lockPath, async () => {
    const snapshotPath = path.join(root, "task-priority/task-snapshot.json");
    const registerPath = path.join(root, "task-priority/register.json");
    const configPath = path.join(root, "task-priority/config.json");
    const overridesPath = path.join(root, "task-priority/overrides.json");
    const markdownPath = path.join(root, "TASK_PRIORITY.md");
    const briefsDirectory = path.join(root, "task-priority/briefs");
    const [currentSnapshot, previous, config, overrides] = await Promise.all([
      loadJson<Snapshot>(snapshotPath),
      loadJson<Register>(registerPath),
      loadJson<Config>(configPath),
      loadJson<Overrides>(overridesPath),
    ]);
    assertTaskExportIsNewer(payload.capturedAt, currentSnapshot.capturedAt);
    const snapshot = snapshotFromTaskServiceExport(payload);
    const register = mergeRegister(snapshot, previous, overrides, false);
    enforceReleaseCapacities(register, config);
    const validation = validateRegister(snapshot, register, config);
    assert.equal(validation.errors.length, 0, validation.errors.join("\n"));
    const markdown = renderMarkdown(register, config, validation);
    const briefs = renderTesterBriefs(register, config);
    await mkdir(briefsDirectory, { recursive: true });
    await writeAtomic(registerPath, `${JSON.stringify(register, null, 2)}\n`);
    await writeAtomic(markdownPath, markdown);
    for (const [releaseId, brief] of briefs) {
      await writeAtomic(path.join(briefsDirectory, `${releaseId}.md`), brief);
    }
    await writeAtomic(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Task-service export ingested: ${snapshot.activeTaskCount} active tasks.`);
    for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
  });
}

export async function runCli(action: string, root = workspaceRoot(), inputPath?: string) {
  if (action === "ingest") {
    assert.ok(inputPath, "Provide a task-service export path.");
    const resolvedInputPath = path.isAbsolute(inputPath) ? inputPath : path.join(root, inputPath);
    await ingestTaskServiceExport(await loadJson<TaskServiceExport>(resolvedInputPath), root);
    return;
  }
  const lockPath = path.join(root, "task-priority/.update.lock");
  await withExclusiveLock(lockPath, async () => {
  const snapshotPath = path.join(root, "task-priority/task-snapshot.json");
  const registerPath = path.join(root, "task-priority/register.json");
  const configPath = path.join(root, "task-priority/config.json");
  const overridesPath = path.join(root, "task-priority/overrides.json");
  const markdownPath = path.join(root, "TASK_PRIORITY.md");
  const briefsDirectory = path.join(root, "task-priority/briefs");
  const [snapshot, config, overrides] = await Promise.all([
    loadJson<Snapshot>(snapshotPath),
    loadJson<Config>(configPath),
    loadJson<Overrides>(overridesPath),
  ]);
  let previous: Register | undefined;
  try {
    previous = await loadJson<Register>(registerPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const bootstrap = action === "bootstrap";
  const register = mergeRegister(snapshot, previous, overrides, bootstrap);
  enforceReleaseCapacities(register, config);
  const validation = validateRegister(snapshot, register, config);
  const markdown = renderMarkdown(register, config, validation);
  const briefs = renderTesterBriefs(register, config);

  if (action === "refresh" || action === "bootstrap") {
    assert.equal(validation.errors.length, 0, validation.errors.join("\n"));
    await mkdir(briefsDirectory, { recursive: true });
    await writeAtomic(registerPath, `${JSON.stringify(register, null, 2)}\n`);
    await writeAtomic(markdownPath, markdown);
    for (const [releaseId, brief] of briefs) {
      await writeAtomic(path.join(briefsDirectory, `${releaseId}.md`), brief);
    }
    console.log(`Task priority register refreshed: ${Object.values(register.tasks).filter(isActive).length} active tasks.`);
    for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
    return;
  }
  if (action === "check") {
    assert.ok(previous, "task-priority/register.json does not exist; run the refresh command.");
    const currentRegister = `${JSON.stringify(register, null, 2)}\n`;
    assert.equal(await readFile(registerPath, "utf8"), currentRegister, "Register is stale; run pnpm task-priority:refresh.");
    assert.equal(await readFile(markdownPath, "utf8"), markdown, "TASK_PRIORITY.md is stale; run pnpm task-priority:refresh.");
    for (const [releaseId, brief] of briefs) {
      assert.equal(
        await readFile(path.join(briefsDirectory, `${releaseId}.md`), "utf8"),
        brief,
        `${releaseId} tester brief is stale; run pnpm task-priority:refresh.`,
      );
    }
    assert.equal(validation.errors.length, 0, validation.errors.join("\n"));
    console.log(`Task priority register valid with ${validation.warnings.length} warning(s).`);
    return;
  }
  throw new Error(`Unknown action "${action}". Use ingest, bootstrap, refresh, or check.`);
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv.slice(3).find((argument) => argument !== "--");
  await runCli(process.argv[2] ?? "check", workspaceRoot(), inputPath);
}