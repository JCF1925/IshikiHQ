import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const workflowPath = new URL(
  "../../../.github/workflows/syntropic-validation.yml",
  import.meta.url,
);

function eventPaths(workflow: string, eventName: "push" | "pull_request") {
  const lines = workflow.split("\n");
  const eventStart = lines.indexOf(`  ${eventName}:`);

  assert.notEqual(eventStart, -1, `The release workflow must define an ${eventName} trigger`);

  const eventEnd = lines.findIndex(
    (line, index) => index > eventStart && /^  \S/.test(line),
  );
  const eventLines = lines.slice(eventStart + 1, eventEnd === -1 ? undefined : eventEnd);
  const pathsStart = eventLines.indexOf("    paths:");

  assert.notEqual(pathsStart, -1, `The ${eventName} trigger must define path filters`);

  return eventLines
    .slice(pathsStart + 1)
    .map((line) => line.match(/^      - "([^"]+)"$/)?.[1])
    .filter((path): path is string => path !== undefined);
}

describe("Syntropic validation workflow contract", () => {
  it("runs for workflow-only changes on push and pull requests", async () => {
    const workflow = await readFile(workflowPath, "utf8");

    for (const eventName of ["push", "pull_request"] as const) {
      assert.ok(
        eventPaths(workflow, eventName).includes(".github/workflows/**"),
        `The ${eventName} trigger must include every file under .github/workflows`,
      );
    }
  });

  it("keeps disposable database acceptance protected from CI drift", async () => {
    const workflow = await readFile(workflowPath, "utf8");

    assert.match(
      workflow,
      /services:\s+postgres:\s+image:\s+postgres:16[\s\S]*?POSTGRES_DB:\s+syntropic_acceptance/,
      "The release workflow must keep a PostgreSQL service for disposable database acceptance",
    );
    assert.match(
      workflow,
      /DATABASE_URL:\s*postgresql:\/\/postgres:postgres@localhost:5432\/syntropic_acceptance/,
      "Database acceptance must use the disposable localhost PostgreSQL database, not a shared database",
    );
    assert.match(
      workflow,
      /pnpm --filter @workspace\/syntropic run acceptance:database/,
      "The release workflow must run the migrated database acceptance command",
    );
    assert.doesNotMatch(
      workflow,
      /account-deletion-database-acceptance\.log/,
      "Database acceptance must not upload raw command output",
    );
    assert.match(
      workflow,
      /DATABASE_ACCEPTANCE_EVIDENCE_FILE:[^\n]+\.evidence[\s\S]*?upload-artifact@v4[\s\S]*?path:[^\n]+\.evidence/,
      "Database acceptance failures must upload only sanitized evidence",
    );
    assert.match(
      workflow,
      /DATABASE_ACCEPTANCE_TREND_FILE:[^\n]+\.trend\.json[\s\S]*?name: database-acceptance-trend-[^\n]+[\s\S]*?retention-days:\s*90[\s\S]*?if-no-files-found:\s*error/,
      "Database acceptance must retain a bounded, sanitized trend record",
    );

    for (const trigger of ["push:", "pull_request:"]) {
      assert.match(
        workflow,
        new RegExp(
          `\\n  ${trigger}\\n    paths:[\\s\\S]*?      - "artifacts/syntropic/\\*\\*"`,
          "m",
        ),
        `The release workflow must retain its ${trigger.slice(0, -1)} validation trigger`,
      );
    }
    assert.match(
      workflow,
      /\n  workflow_dispatch:\s*(?:\n|$)/,
      "The release workflow must retain manual validation dispatch",
    );
  });

  it("keeps every disposable database acceptance job behind workflow lint", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const jobs = [
      ...workflow.matchAll(
        /(?:^|\n)  ([a-z0-9-]+):\n([\s\S]*?)(?=\n  [a-z0-9-]+:\n|$)/g,
      ),
    ];
    const databaseAcceptanceJobs = jobs.filter(([, , definition]) =>
      definition.includes("pnpm --filter @workspace/syntropic run acceptance:database"),
    );

    assert.ok(
      databaseAcceptanceJobs.length > 0,
      "The release workflow must define at least one disposable database acceptance job",
    );

    for (const [, jobName, definition] of databaseAcceptanceJobs) {
      assert.match(
        definition,
        /^[ \t]+needs:[ \t]*workflow-lint[ \t]*$/m,
        `Disposable database acceptance job "${jobName}" could bypass workflow lint; it must retain needs: workflow-lint`,
      );
      assert.match(
        definition,
        /Upload database acceptance trend record[\s\S]*?if:\s*always\(\)[\s\S]*?actions\/upload-artifact@v4[\s\S]*?retention-days:\s*90/,
        `Disposable database acceptance job "${jobName}" must upload its trend record for both pass and fail outcomes`,
      );
    }
  });

  it("runs deleted-account export privacy acceptance on release validation", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const acceptanceScript = await readFile(
      new URL("../scripts/clean-database-acceptance.sh", import.meta.url),
      "utf8",
    );
    const healthClaimsJob = workflow.match(
      /\n  health-claims-database:\n([\s\S]*?)(?=\n  [a-z0-9-]+:\n|\s*$)/,
    )?.[1];

    assert.ok(healthClaimsJob, "The release workflow must define the health claims database job");
    assert.doesNotMatch(
      healthClaimsJob,
      /if:\s*github\.event_name\s*==\s*['"]workflow_dispatch['"]/,
      "Deleted-account export privacy acceptance must run on push and pull-request release validation",
    );
    assert.match(
      healthClaimsJob,
      /pnpm --filter @workspace\/syntropic run acceptance:database/,
      "Release validation must invoke the migrated database acceptance script",
    );
    assert.match(
      healthClaimsJob,
      /DATABASE_ACCEPTANCE_EVIDENCE_FILE:[^\n]+health-claims-database-acceptance\.evidence/,
      "Health-claims acceptance must write only the sanitized evidence file",
    );
    assert.match(
      acceptanceScript,
      /HEALTH_CLAIM_DATABASE_TESTS=1[\s\S]*?tests\/health-claims-import\.test\.ts/,
      "The database acceptance script must enable the health-claims acceptance",
    );
  });
});
