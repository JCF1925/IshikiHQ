import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import express, { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  CaptureMobileTaskBody,
  CaptureMobileTransactionBody,
  CaptureMobileVitalBody,
  CompleteMobileUploadBody,
  CompleteMobileUploadParams,
  CreateMobileDeviceSessionBody,
  CreateMobileEventBody,
  DeleteAppleHealthImportedCopiesBody,
  GetAppleHealthAnchorParams,
  ImportAppleHealthBatchBody,
  InitiateMobileUploadBody,
  ListMobileAnomaliesQueryParams,
  ReconcileMobileStockLevelBody,
  PullMobileSyncQueryParams,
  PushMobileSyncBody,
  RestoreMobileCaptureBody,
  RecordMobileMedicationDoseBody,
  RegisterMobilePushDeviceBody,
  ReviewMobileAnomalyBody,
  ReviewMobileAnomalyParams,
  UpdateAppleHealthControlsBody,
  UpdateAppleHealthImportedCopyControlsBody,
  UpdateMobileMedicationReminderBody,
  UpdateMobileMedicationReminderParams,
  UpdateMobilePushRemindersBody,
} from "@workspace/api-zod";
import {
  appleHealthAnchorsTable,
  appleHealthAuditTable,
  appleHealthControlsTable,
  appleHealthImportedCopyControlsTable,
  appleHealthImportedCopyTombstonesTable,
  appleHealthDeletionsTable,
  appleHealthImportBatchesTable,
  appleHealthSamplesTable,
  db,
  mobileAnomaliesTable,
  mobileDevicesTable,
  mobileIdempotencyTable,
  mobileMedicationRemindersTable,
  mobilePushDevicesTable,
  mobileRecordsTable,
  mobileReminderSettingsTable,
  mobileSessionsTable,
  mobileSyncChangesTable,
  mobileUploadsTable,
  usersTable,
} from "@workspace/db";
import {
  deleteMobileCanonical,
  materialiseMobileCanonical,
  MobileCanonicalError,
  updateMobileCanonical,
  type CanonicalEntityType,
} from "../lib/mobile-canonical";

const router: IRouter = Router();
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const idempotencyLifetimeMs = 24 * 60 * 60 * 1000;
const nonDiagnosticDisclaimer =
  "This is a data observation only, not medical advice or a diagnosis. Seek qualified care for health concerns.";
const credentialWindowMs = 15 * 60 * 1000;
const credentialMaxAttempts = 5;
// Valid bcrypt work is always performed, even for an absent account.
const credentialTimingHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const credentialAttempts = new Map<string, number[]>();

type MobileAuth = { userId: string; deviceId: string; sessionId: string };
type AuthedRequest = Request & { mobileAuth?: MobileAuth };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestHash(body: unknown): string {
  return hash(stable(body));
}

function errorBody(req: Request, code: string, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      requestId: String(req.id ?? "unknown"),
      ...(details === undefined ? {} : { details }),
    },
  };
}

function validationError(req: Request, res: Response, issues: unknown): void {
  res.status(400).json(errorBody(req, "validation_failed", "Request validation failed", issues));
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function credentialKey(req: Request, email: string): string {
  return `${req.ip}:${email}`;
}

function isCredentialRateLimited(key: string, now: number): boolean {
  const attempts = (credentialAttempts.get(key) ?? []).filter((attempt) => now - attempt < credentialWindowMs);
  if (attempts.length) credentialAttempts.set(key, attempts);
  else credentialAttempts.delete(key);
  return attempts.length >= credentialMaxAttempts;
}

function recordCredentialFailure(key: string, now: number): void {
  const attempts = (credentialAttempts.get(key) ?? []).filter((attempt) => now - attempt < credentialWindowMs);
  attempts.push(now);
  credentialAttempts.set(key, attempts);
}

function invalidCredentials(req: Request, res: Response): void {
  // Do not distinguish unknown account, absent password credential, bad password, or throttling.
  res.status(401).json(errorBody(req, "invalid_credentials", "Invalid email or password"));
}

async function authenticate(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json(errorBody(req, "authentication_required", "A bearer device session is required"));
    return;
  }
  const tokenHash = hash(authorization.slice(7));
  const [session] = await db
    .select()
    .from(mobileSessionsTable)
    .where(and(eq(mobileSessionsTable.tokenHash, tokenHash), isNull(mobileSessionsTable.revokedAt)));
  if (!session || session.expiresAt <= new Date()) {
    res.status(401).json(errorBody(req, "invalid_session", "The device session is invalid or expired"));
    return;
  }
  req.mobileAuth = { userId: session.userId, deviceId: session.deviceId, sessionId: session.id };
  await db
    .update(mobileSessionsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(mobileSessionsTable.id, session.id));
  next();
}

function auth(req: AuthedRequest): MobileAuth {
  if (!req.mobileAuth) throw new Error("Mobile authentication middleware was not applied");
  return req.mobileAuth;
}

async function beginIdempotency(
  req: AuthedRequest,
  res: Response,
  scope: string,
  body: unknown,
): Promise<{ key: string; hash: string } | undefined> {
  const key = req.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 200) {
    validationError(req, res, [{ path: ["Idempotency-Key"], message: "Header must contain 8 to 200 characters" }]);
    return;
  }
  const userId = auth(req).userId;
  const bodyHash = requestHash(body);
  const [existing] = await db
    .select()
    .from(mobileIdempotencyTable)
    .where(
      and(
        eq(mobileIdempotencyTable.userId, userId),
        eq(mobileIdempotencyTable.scope, scope),
        eq(mobileIdempotencyTable.key, key),
      ),
    );
  if (existing) {
    if (existing.requestHash !== bodyHash) {
      res.status(409).json({
        ...errorBody(req, "idempotency_key_reused", "This key was already used for a different request"),
        conflict: { kind: "idempotency_key_reused", serverVersion: null, serverRecord: null },
      });
      return;
    }
    if (existing.responseBody && existing.responseStatus) {
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }
    res.status(409).json({
      ...errorBody(req, "request_in_progress", "An identical request is already being processed"),
      conflict: { kind: "idempotency_key_reused", serverVersion: null, serverRecord: null },
    });
    return;
  }
  const [created] = await db.insert(mobileIdempotencyTable).values({
    userId,
    scope,
    key,
    requestHash: bodyHash,
    expiresAt: new Date(Date.now() + idempotencyLifetimeMs),
  }).onConflictDoNothing().returning();
  if (!created) {
    const [winner] = await db
      .select()
      .from(mobileIdempotencyTable)
      .where(
        and(
          eq(mobileIdempotencyTable.userId, userId),
          eq(mobileIdempotencyTable.scope, scope),
          eq(mobileIdempotencyTable.key, key),
        ),
      );
    if (winner?.requestHash !== bodyHash) {
      res.status(409).json({
        ...errorBody(req, "idempotency_key_reused", "This key was already used for a different request"),
        conflict: { kind: "idempotency_key_reused", serverVersion: null, serverRecord: null },
      });
      return;
    }
    if (winner?.responseBody && winner.responseStatus) {
      res.status(winner.responseStatus).json(winner.responseBody);
      return;
    }
    res.status(409).json({
      ...errorBody(req, "request_in_progress", "An identical request is already being processed"),
      conflict: { kind: "idempotency_key_reused", serverVersion: null, serverRecord: null },
    });
    return;
  }
  return { key, hash: bodyHash };
}

async function finishIdempotency(userId: string, scope: string, key: string, status: number, body: unknown) {
  await db
    .update(mobileIdempotencyTable)
    .set({ responseStatus: status, responseBody: body })
    .where(
      and(
        eq(mobileIdempotencyTable.userId, userId),
        eq(mobileIdempotencyTable.scope, scope),
        eq(mobileIdempotencyTable.key, key),
      ),
    );
}

router.post("/mobile/auth/device-sessions", async (req, res): Promise<void> => {
  const parsed = CreateMobileDeviceSessionBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const email = normalizedEmail(parsed.data.email);
  const attemptKey = credentialKey(req, email);
  const now = Date.now();
  if (isCredentialRateLimited(attemptKey, now)) {
    // Run a bcrypt comparison to reduce timing differences for throttled requests.
    await bcrypt.compare(parsed.data.password, credentialTimingHash);
    invalidCredentials(req, res);
    return;
  }
  const [user] = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  const passwordMatches = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? credentialTimingHash);
  if (!user || !user.passwordHash || !passwordMatches) {
    recordCredentialFailure(attemptKey, now);
    invalidCredentials(req, res);
    return;
  }
  credentialAttempts.delete(attemptKey);
  const userId = user.id;
  const [device] = await db
    .insert(mobileDevicesTable)
    .values({
      userId,
      installId: parsed.data.installId,
      platform: parsed.data.platform,
      deviceName: parsed.data.deviceName,
      appVersion: parsed.data.appVersion,
    })
    .onConflictDoUpdate({
      target: [mobileDevicesTable.userId, mobileDevicesTable.installId],
      set: {
        platform: parsed.data.platform,
        deviceName: parsed.data.deviceName,
        appVersion: parsed.data.appVersion,
        lastSeenAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await db.insert(mobileSessionsTable).values({
    userId,
    deviceId: device.id,
    tokenHash: hash(token),
    expiresAt,
  });
  res.status(201).json({ accessToken: token, expiresAt: expiresAt.toISOString(), deviceId: device.id });
});

router.use("/mobile", authenticate);

router.delete("/mobile/auth/device-sessions", async (req: AuthedRequest, res): Promise<void> => {
  await db
    .update(mobileSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(mobileSessionsTable.id, auth(req).sessionId));
  res.sendStatus(204);
});

router.get("/mobile/dashboard", async (req: AuthedRequest, res): Promise<void> => {
  const userId = auth(req).userId;
  const records = await db.select().from(mobileRecordsTable).where(eq(mobileRecordsTable.userId, userId));
  const [latest] = await db
    .select()
    .from(mobileSyncChangesTable)
    .where(eq(mobileSyncChangesTable.userId, userId))
    .orderBy(desc(mobileSyncChangesTable.sequence));
  res.json({
    generatedAt: new Date().toISOString(),
    tasksDue: records.filter((record) => record.entityType === "task" && !record.deletedAt).length,
    medicationsDue: records.filter((record) => record.entityType === "medicationDose" && !record.deletedAt).length,
    recentVitals: records.filter((record) => record.entityType === "vital" && !record.deletedAt).length,
    syncCursor: String(latest?.sequence ?? 0),
  });
});

type MobileStockLevelRow = {
  id: string;
  medicationId: string;
  medicationLabel: string;
  currentQuantity: number;
  reorderThreshold: number;
  monthlyLimit: number | null;
};

type MobileStockTransactionRow = {
  id: string;
  medicationId: string;
  quantityChange: number;
  balanceAfter: number;
  createdAt: Date;
  notes: string | null;
};

type MobileStockDiagnostic = {
  currentQuantity: number;
  ledgerQuantity: number;
  lastLedgerBalance: number | null;
  transactionCount: number;
  mismatchQuantity: number;
  hasMismatch: boolean;
};

const mobileStockRetryDelaysMs = [5, 10, 20, 40, 80, 160, 320] as const;
const stockQuantitiesDiffer = (left: number, right: number) => Math.abs(left - right) > 0.0000001;
const historicalReconciliationNotePrefix = "Historical stock reconciliation:";

async function listMobileStockLevels(executor: any, userId: string) {
  const levelResult = await executor.execute(sql`
    SELECT
      sl."id",
      sl."medicationId",
      CONCAT(
        m."name",
        CASE WHEN m."strength" IS NULL THEN '' ELSE ' ' || m."strength" END,
        CASE WHEN m."unit" IS NULL THEN '' ELSE ' ' || m."unit" END
      ) AS "medicationLabel",
      sl."currentQuantity",
      sl."reorderThreshold",
      sl."monthlyLimit"
    FROM "StockLevel" sl
    INNER JOIN "Medication" m
      ON m."id" = sl."medicationId" AND m."userId" = sl."userId"
    WHERE sl."userId" = ${userId}
    ORDER BY m."name", m."strength", sl."id"
  `) as { rows: MobileStockLevelRow[] };
  const transactionResult = await executor.execute(sql`
    SELECT
      st."id",
      st."medicationId",
      st."quantityChange",
      st."balanceAfter",
      st."createdAt",
      st."notes"
    FROM "StockTransaction" st
    WHERE st."userId" = ${userId}
    ORDER BY st."createdAt" ASC, st."id" ASC
  `) as { rows: MobileStockTransactionRow[] };
  const entriesByMedication = new Map<string, MobileStockTransactionRow[]>();
  for (const transaction of transactionResult.rows) {
    const entries = entriesByMedication.get(transaction.medicationId) ?? [];
    entries.push(transaction);
    entriesByMedication.set(transaction.medicationId, entries);
  }
  return levelResult.rows.map((level) => {
    const entries = entriesByMedication.get(level.medicationId) ?? [];
    const operationalEntries = entries.filter((entry) => !entry.notes?.startsWith(historicalReconciliationNotePrefix));
    const currentQuantity = Number(level.currentQuantity);
    const ledgerQuantity = operationalEntries.reduce((balance, entry) => balance + Number(entry.quantityChange), 0);
    const lastLedgerBalance = operationalEntries.length ? Number(operationalEntries[operationalEntries.length - 1]!.balanceAfter) : null;
    const mismatchQuantity = ledgerQuantity - currentQuantity;
    return {
      ...level,
      currentQuantity,
      reorderThreshold: Number(level.reorderThreshold),
      monthlyLimit: level.monthlyLimit == null ? null : Number(level.monthlyLimit),
      ledgerQuantity,
      lastLedgerBalance,
      transactionCount: entries.length,
      mismatchQuantity,
      hasMismatch: stockQuantitiesDiffer(currentQuantity, ledgerQuantity),
    };
  });
}

async function withMobileStockTransaction<T>(
  userId: string,
  medicationId: string,
  operation: (tx: any) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= mobileStockRetryDelaysMs.length; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${medicationId}`}))`);
        return operation(tx);
      }, { isolationLevel: "serializable" });
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string })?.code;
      if (code !== "40001" && code !== "40P01" && attempt === mobileStockRetryDelaysMs.length) throw error;
      if (code !== "40001" && code !== "40P01") throw error;
      await new Promise((resolve) => setTimeout(resolve, mobileStockRetryDelaysMs[attempt]!));
    }
  }
  throw lastError;
}

router.get("/mobile/stock-levels", async (req: AuthedRequest, res): Promise<void> => {
  res.json(await listMobileStockLevels(db, auth(req).userId));
});

router.post("/mobile/stock-levels", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = ReconcileMobileStockLevelBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const identity = auth(req);
  const [existing] = await db.execute(sql`
    SELECT "medicationId"
    FROM "StockLevel"
    WHERE "id" = ${parsed.data.id} AND "userId" = ${identity.userId}
  `).then((result) => result.rows as Array<{ medicationId: string }>);
  if (!existing) {
    res.status(404).json(errorBody(req, "not_found", "Stock level was not found"));
    return;
  }

  const result = await withMobileStockTransaction(identity.userId, existing.medicationId, async (tx) => {
    const levels = await listMobileStockLevels(tx, identity.userId);
    const diagnostic = levels.find((level) => level.id === parsed.data.id);
    if (!diagnostic) return { kind: "not_found" as const };
    if (
      stockQuantitiesDiffer(diagnostic.currentQuantity, parsed.data.expectedCurrentQuantity)
      || stockQuantitiesDiffer(diagnostic.ledgerQuantity, parsed.data.expectedLedgerQuantity)
    ) {
      return { kind: "stale" as const, diagnostic };
    }
    if (!diagnostic.hasMismatch) return { kind: "already_reconciled" as const, diagnostic };

    const stockResult = await tx.execute(sql`
      UPDATE "StockLevel"
      SET "currentQuantity" = ${diagnostic.ledgerQuantity}
      WHERE "id" = ${diagnostic.id} AND "userId" = ${identity.userId}
      RETURNING "id", "currentQuantity"
    `) as { rows: Array<{ id: string; currentQuantity: number }> };
    const transactionId = randomUUID();
    const notes = `Historical stock reconciliation: current stock ${diagnostic.currentQuantity} aligned to ledger balance ${diagnostic.ledgerQuantity}.`;
    await tx.execute(sql`
      INSERT INTO "StockTransaction" (
        "id", "userId", "medicationId", "type", "quantityChange", "balanceAfter", "notes"
      ) VALUES (
        ${transactionId}, ${identity.userId}, ${existing.medicationId}, 'adjustment',
        ${diagnostic.mismatchQuantity}, ${diagnostic.ledgerQuantity}, ${notes}
      )
    `);
    return {
      kind: "reconciled" as const,
      diagnostic: {
        ...diagnostic,
        currentQuantity: diagnostic.ledgerQuantity,
        transactionCount: diagnostic.transactionCount + 1,
        mismatchQuantity: 0,
        hasMismatch: false,
      },
      stock: {
        id: stockResult.rows[0]!.id,
        currentQuantity: Number(stockResult.rows[0]!.currentQuantity),
      },
      transaction: {
        id: transactionId,
        type: "adjustment" as const,
        quantityChange: diagnostic.mismatchQuantity,
        balanceAfter: diagnostic.ledgerQuantity,
        notes,
      },
    };
  });

  if (result.kind === "not_found") {
    res.status(404).json(errorBody(req, "not_found", "Stock level was not found"));
    return;
  }
  if (result.kind === "stale") {
    res.status(409).json({
      ...errorBody(req, "stock_changed", "Stock changed while it was being reviewed"),
      diagnostic: result.diagnostic,
    });
    return;
  }
  if (result.kind === "already_reconciled") {
    res.status(409).json({
      ...errorBody(req, "already_reconciled", "Stock is already reconciled"),
      diagnostic: result.diagnostic,
    });
    return;
  }
  res.json(result);
});

const captureRoutes = [
  { path: "/mobile/capture/transactions", scope: "capture.transaction", entityType: "transaction", schema: CaptureMobileTransactionBody },
  { path: "/mobile/capture/tasks", scope: "capture.task", entityType: "task", schema: CaptureMobileTaskBody },
  { path: "/mobile/capture/vitals", scope: "capture.vital", entityType: "vital", schema: CaptureMobileVitalBody },
  { path: "/mobile/medication-doses", scope: "capture.medicationDose", entityType: "medicationDose", schema: RecordMobileMedicationDoseBody },
  { path: "/mobile/events", scope: "capture.event", entityType: "event", schema: CreateMobileEventBody },
] as const;

function canonicalErrorResponse(req: Request, error: MobileCanonicalError) {
  return errorBody(req, error.code, error.message);
}

function syncRejectionResponse(
  req: Request,
  entityType: string,
  error: MobileCanonicalError,
) {
  if (entityType === "medicationDose") {
    if (error.code === "insufficient_stock") {
      return errorBody(
        req,
        "insufficient_stock",
        "There is not enough stock to log this dose. Update the dose or stock, then retry.",
      );
    }
    if (error.code === "not_found") {
      return errorBody(
        req,
        "medication_not_available",
        "This medication is not available for this account. Review the saved capture before retrying.",
      );
    }
    return errorBody(
      req,
      "medication_capture_rejected",
      "This medication capture was rejected. Review the saved capture before retrying.",
    );
  }
  return errorBody(req, "capture_rejected", "This capture was rejected. Review the saved capture before retrying.");
}

for (const route of captureRoutes) {
  router.post(route.path, async (req: AuthedRequest, res): Promise<void> => {
    const parsed = route.schema.safeParse(req.body);
    if (!parsed.success) {
      validationError(req, res, parsed.error.issues);
      return;
    }
    const idempotency = await beginIdempotency(req, res, route.scope, parsed.data);
    if (!idempotency) return;
    const identity = auth(req);
    const clientId = parsed.data.clientId;
    try {
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(mobileRecordsTable)
          .where(
            and(
              eq(mobileRecordsTable.userId, identity.userId),
              eq(mobileRecordsTable.entityType, route.entityType),
              eq(mobileRecordsTable.clientId, clientId),
            ),
          );
        if (existing) {
          return {
            conflict: {
              ...errorBody(req, "version_mismatch", "A record with this client identifier already exists"),
              conflict: { kind: "version_mismatch", serverVersion: existing.version, serverRecord: existing.payload },
            },
          } as const;
        }
        const canonicalId = randomUUID();
        await materialiseMobileCanonical(
          tx,
          identity.userId,
          route.entityType as CanonicalEntityType,
          parsed.data as Record<string, unknown>,
          canonicalId,
        );
        const [record] = await tx
          .insert(mobileRecordsTable)
          .values({ id: canonicalId, userId: identity.userId, deviceId: identity.deviceId, clientId, entityType: route.entityType, payload: parsed.data })
          .returning();
        await tx.insert(mobileSyncChangesTable).values({
          userId: identity.userId,
          deviceId: identity.deviceId,
          changeId: `${route.entityType}:${record.id}:1`,
          entityType: route.entityType,
          entityId: record.id,
          operation: "upsert",
          version: record.version,
          payload: parsed.data,
          changedAt: record.createdAt,
        });
        return {
          response: { id: record.id, clientId, version: record.version, createdAt: record.createdAt.toISOString() },
        } as const;
      });
      if ("conflict" in result) {
        await finishIdempotency(identity.userId, route.scope, idempotency.key, 409, result.conflict);
        res.status(409).json(result.conflict);
        return;
      }
      await finishIdempotency(identity.userId, route.scope, idempotency.key, 201, result.response);
      res.status(201).json(result.response);
    } catch (error) {
      if (error instanceof MobileCanonicalError) {
        const body = canonicalErrorResponse(req, error);
        await finishIdempotency(identity.userId, route.scope, idempotency.key, error.status, body);
        res.status(error.status).json(body);
        return;
      }
      const body = errorBody(req, "internal_error", "The mobile record could not be saved");
      await finishIdempotency(identity.userId, route.scope, idempotency.key, 500, body);
      res.status(500).json(body);
    }
  });
}

router.post("/mobile/sync/push", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = PushMobileSyncBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const idempotency = await beginIdempotency(req, res, "sync.push", parsed.data);
  if (!idempotency) return;
  const identity = auth(req);
  const results: Array<Record<string, unknown>> = [];
  const changesWithSchemas = parsed.data.changes.map((change) => ({
    change,
    schema: {
      transaction: CaptureMobileTransactionBody,
      task: CaptureMobileTaskBody,
      vital: CaptureMobileVitalBody,
      medicationDose: RecordMobileMedicationDoseBody,
      event: CreateMobileEventBody,
    }[change.entityType],
  }));
  try {
    await db.transaction(async (tx) => {
      for (const { change, schema } of changesWithSchemas) {
      const [seen] = await tx
        .select()
        .from(mobileSyncChangesTable)
        .where(and(eq(mobileSyncChangesTable.userId, identity.userId), eq(mobileSyncChangesTable.changeId, change.changeId)));
      if (seen) {
        results.push({ changeId: change.changeId, status: "duplicate", version: seen.version });
        continue;
      }
      const [record] = await tx
        .select()
        .from(mobileRecordsTable)
        .where(and(eq(mobileRecordsTable.userId, identity.userId), eq(mobileRecordsTable.id, change.entityId)));
      if (record && record.version !== change.baseVersion) {
        results.push({
          changeId: change.changeId,
          status: "conflict",
          version: record.version,
          conflict: {
            ...errorBody(req, "version_mismatch", "The server record changed since the supplied base version"),
            conflict: {
              kind: "version_mismatch",
              serverVersion: record.version,
              serverRecord: record.deletedAt ? {} : record.payload,
            },
          },
        });
        continue;
      }
      // Deletes carry no user data. New upserts are checked before they can
      // reach either MobileRecord or a canonical table.
      const payload = change.operation === "delete"
        ? { success: true as const, data: {} }
        : schema.safeParse(change.payload);
      if (!payload.success) {
        results.push({ changeId: change.changeId, status: "rejected" });
        continue;
      }
      const version = (record?.version ?? 0) + 1;
      // A record created by this route already has its canonical counterpart.
      // Do not replay side effects (especially medication stock consumption)
      // when a later mobile version updates the staging record.
      try {
        await tx.transaction(async (changeTx) => {
          if (change.operation === "upsert" && !record) {
            await materialiseMobileCanonical(
              changeTx,
              identity.userId,
              change.entityType as CanonicalEntityType,
              payload.data as Record<string, unknown>,
              change.entityId,
            );
          } else if (change.operation === "upsert" && record) {
            await updateMobileCanonical(
              changeTx,
              identity.userId,
              change.entityType as CanonicalEntityType,
              payload.data as Record<string, unknown>,
              record.id,
            );
          } else if (change.operation === "delete" && record) {
            await deleteMobileCanonical(
              changeTx,
              identity.userId,
              change.entityType as CanonicalEntityType,
              record.id,
            );
          }
          // Keep the last validated payload private on the owner-scoped record so
          // an explicit restore can recreate the canonical row. Tombstone
          // sync changes still carry an empty payload and never reveal it.
          const storedPayload = change.operation === "delete"
            ? (record?.payload ?? {})
            : payload.data;
          if (record) {
            await changeTx
              .update(mobileRecordsTable)
              .set({
                payload: storedPayload,
                version,
                deletedAt: change.operation === "delete" ? new Date(change.changedAt) : null,
                updatedAt: new Date(change.changedAt),
              })
              .where(and(eq(mobileRecordsTable.id, record.id), eq(mobileRecordsTable.userId, identity.userId)));
          } else {
            await changeTx.insert(mobileRecordsTable).values({
              id: change.entityId,
              userId: identity.userId,
              deviceId: identity.deviceId,
              clientId: change.entityId,
              entityType: change.entityType,
              payload: storedPayload,
              version,
              deletedAt: change.operation === "delete" ? new Date(change.changedAt) : null,
            });
          }
          await changeTx.insert(mobileSyncChangesTable).values({
            userId: identity.userId,
            deviceId: identity.deviceId,
            changeId: change.changeId,
            entityType: change.entityType,
            entityId: change.entityId,
            operation: change.operation,
            version,
            payload: change.operation === "delete" ? {} : storedPayload,
            changedAt: new Date(change.changedAt),
          });
          results.push({ changeId: change.changeId, status: "applied", version });
        });
      } catch (error) {
        if (!(error instanceof MobileCanonicalError)) throw error;
        results.push({
          changeId: change.changeId,
          status: "rejected",
          error: syncRejectionResponse(req, change.entityType, error),
        });
        continue;
      }
      }
    });
  } catch {
    const body = errorBody(req, "internal_error", "The mobile changes could not be saved");
    await finishIdempotency(identity.userId, "sync.push", idempotency.key, 500, body);
    res.status(500).json(body);
    return;
  }
  const [last] = await db
    .select()
    .from(mobileSyncChangesTable)
    .where(eq(mobileSyncChangesTable.userId, identity.userId))
    .orderBy(desc(mobileSyncChangesTable.sequence));
  const response = { cursor: String(last?.sequence ?? 0), results };
  await finishIdempotency(identity.userId, "sync.push", idempotency.key, 200, response);
  res.json(response);
});

router.post("/mobile/sync/restore", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = RestoreMobileCaptureBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const idempotency = await beginIdempotency(req, res, "sync.restore", parsed.data);
  if (!idempotency) return;
  const identity = auth(req);
  try {
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        SELECT "id", "entityType", "payload", "version", "deletedAt"
        FROM "MobileRecord"
        WHERE "id" = ${parsed.data.entityId} AND "userId" = ${identity.userId}
        FOR UPDATE
      `);
      const record = locked.rows[0] as {
        id: string;
        entityType: string;
        payload: Record<string, unknown>;
        version: number;
        deletedAt: Date | null;
      } | undefined;
      if (!record) {
        throw new MobileCanonicalError("not_found", "Deleted mobile capture was not found", 404);
      }
      if (record.version !== parsed.data.expectedVersion) {
        const body = {
          ...errorBody(req, "version_mismatch", "The server record changed since it was reviewed"),
          conflict: {
            kind: "version_mismatch",
            serverVersion: record.version,
            serverRecord: record.deletedAt ? {} : record.payload,
          },
        };
        throw new MobileCanonicalError("version_mismatch", JSON.stringify(body), 409);
      }
      if (!record.deletedAt) {
        return {
          entityId: record.id,
          entityType: record.entityType,
          version: record.version,
          restored: false,
        };
      }
      if (!record.payload || Object.keys(record.payload).length === 0) {
        throw new MobileCanonicalError("restore_unavailable", "This deleted capture no longer has a recoverable payload", 409);
      }

      await materialiseMobileCanonical(
        tx,
        identity.userId,
        record.entityType as CanonicalEntityType,
        record.payload,
        record.id,
      );
      const version = record.version + 1;
      const changedAt = new Date();
      await tx
        .update(mobileRecordsTable)
        .set({ version, deletedAt: null, updatedAt: changedAt })
        .where(and(eq(mobileRecordsTable.id, record.id), eq(mobileRecordsTable.userId, identity.userId)));
      await tx.insert(mobileSyncChangesTable).values({
        userId: identity.userId,
        deviceId: identity.deviceId,
        changeId: `${record.entityType}:${record.id}:${version}`,
        entityType: record.entityType,
        entityId: record.id,
        operation: "upsert",
        version,
        payload: record.payload,
        changedAt,
      });
      return {
        entityId: record.id,
        entityType: record.entityType,
        version,
        restored: true,
      };
    });
    await finishIdempotency(identity.userId, "sync.restore", idempotency.key, 200, result);
    res.json(result);
  } catch (error) {
    if (error instanceof MobileCanonicalError) {
      let body: ReturnType<typeof errorBody>;
      if (error.code === "version_mismatch") {
        try {
          body = JSON.parse(error.message) as ReturnType<typeof errorBody>;
        } catch {
          body = errorBody(req, error.code, error.message);
        }
      } else {
        body = errorBody(req, error.code, error.message);
      }
      await finishIdempotency(identity.userId, "sync.restore", idempotency.key, error.status, body);
      res.status(error.status).json(body);
      return;
    }
    const body = errorBody(req, "internal_error", "The mobile capture could not be restored");
    await finishIdempotency(identity.userId, "sync.restore", idempotency.key, 500, body);
    res.status(500).json(body);
  }
});

router.get("/mobile/sync/pull", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = PullMobileSyncQueryParams.safeParse(req.query);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const cursor = Number(parsed.data.cursor ?? "0");
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    validationError(req, res, [{ path: ["cursor"], message: "Cursor must be a non-negative integer" }]);
    return;
  }
  const limit = parsed.data.limit ?? 100;
  const rows = await db
    .select()
    .from(mobileSyncChangesTable)
    .where(and(eq(mobileSyncChangesTable.userId, auth(req).userId), gt(mobileSyncChangesTable.sequence, cursor)))
    .orderBy(asc(mobileSyncChangesTable.sequence))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  res.json({
    cursor: String(page.at(-1)?.sequence ?? cursor),
    hasMore: rows.length > limit,
    changes: page.map((row) => ({
      changeId: row.changeId,
      entityType: row.entityType,
      entityId: row.entityId,
      operation: row.operation,
      baseVersion: Math.max(0, row.version - 1),
      payload: row.payload,
      changedAt: row.changedAt.toISOString(),
    })),
  });
});

router.get("/mobile/sync/history", async (req: AuthedRequest, res): Promise<void> => {
  const rows = await db
    .select({
      changeId: mobileSyncChangesTable.changeId,
      entityType: mobileSyncChangesTable.entityType,
      entityId: mobileSyncChangesTable.entityId,
      operation: mobileSyncChangesTable.operation,
      version: mobileSyncChangesTable.version,
      changedAt: mobileSyncChangesTable.changedAt,
    })
    .from(mobileSyncChangesTable)
    .where(eq(mobileSyncChangesTable.userId, auth(req).userId))
    .orderBy(desc(mobileSyncChangesTable.sequence))
    .limit(200);
  res.json({
    entries: rows.map((row) => ({
      changeId: row.changeId,
      entityType: row.entityType,
      entityId: row.entityId,
      status: row.operation === "delete" ? "deleted" : "applied",
      version: row.version,
      changedAt: row.changedAt.toISOString(),
    })),
  });
});

router.post("/mobile/uploads", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = InitiateMobileUploadBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const idem = await beginIdempotency(req, res, "upload.initiate", parsed.data);
  if (!idem) return;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const [upload] = await db.insert(mobileUploadsTable).values({
    userId: auth(req).userId,
    ...parsed.data,
    storageKey: `${auth(req).userId}/${randomBytes(16).toString("hex")}`,
    expiresAt,
  }).returning();
  const response = { id: upload.id, status: "pending", uploadUrl: null, expiresAt: expiresAt.toISOString() };
  await finishIdempotency(auth(req).userId, "upload.initiate", idem.key, 201, response);
  res.status(201).json(response);
});

router.post("/mobile/uploads/:uploadId/complete", async (req: AuthedRequest, res): Promise<void> => {
  const params = CompleteMobileUploadParams.safeParse(req.params);
  const parsed = CompleteMobileUploadBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    validationError(req, res, [...(params.success ? [] : params.error.issues), ...(parsed.success ? [] : parsed.error.issues)]);
    return;
  }
  const idem = await beginIdempotency(req, res, "upload.complete", { ...params.data, ...parsed.data });
  if (!idem) return;
  const [upload] = await db.select().from(mobileUploadsTable).where(
    and(eq(mobileUploadsTable.id, params.data.uploadId), eq(mobileUploadsTable.userId, auth(req).userId)),
  );
  if (!upload) {
    res.status(404).json(errorBody(req, "not_found", "Upload not found"));
    return;
  }
  if (upload.sha256 !== parsed.data.sha256 || upload.byteSize !== parsed.data.byteSize) {
    res.status(409).json({
      ...errorBody(req, "upload_integrity_mismatch", "Uploaded content does not match the initiated upload"),
      conflict: { kind: "version_mismatch", serverVersion: null, serverRecord: null },
    });
    return;
  }
  await db.update(mobileUploadsTable).set({ status: "completed", completedAt: new Date() }).where(
    and(eq(mobileUploadsTable.id, upload.id), eq(mobileUploadsTable.userId, auth(req).userId)),
  );
  const response = { id: upload.id, status: "completed", uploadUrl: null, expiresAt: upload.expiresAt.toISOString() };
  await finishIdempotency(auth(req).userId, "upload.complete", idem.key, 200, response);
  res.json(response);
});

router.put("/mobile/uploads/:uploadId/content", express.raw({ type: "*/*", limit: "50mb" }), async (req: AuthedRequest, res): Promise<void> => {
  const params = CompleteMobileUploadParams.safeParse(req.params);
  if (!params.success) {
    validationError(req, res, params.error.issues);
    return;
  }
  const [upload] = await db.select().from(mobileUploadsTable).where(
    and(eq(mobileUploadsTable.id, params.data.uploadId), eq(mobileUploadsTable.userId, auth(req).userId)),
  );
  if (!upload) {
    res.status(404).json(errorBody(req, "not_found", "Upload not found"));
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0 || req.body.length > 50 * 1024 * 1024) {
    res.status(400).json(errorBody(req, "invalid_upload", "Upload content is empty or too large"));
    return;
  }
  const sha256 = createHash("sha256").update(req.body).digest("hex");
  const [stored] = await db.update(mobileUploadsTable).set({
    sha256,
    byteSize: req.body.length,
    content: req.body,
    status: "completed",
    completedAt: new Date(),
  }).where(and(eq(mobileUploadsTable.id, upload.id), eq(mobileUploadsTable.userId, auth(req).userId))).returning();
  res.json({ id: stored.id, status: "completed", uploadUrl: null, expiresAt: stored.expiresAt.toISOString() });
});

router.post("/mobile/push/devices", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = RegisterMobilePushDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const identity = auth(req);
  const [push] = await db.insert(mobilePushDevicesTable).values({
    userId: identity.userId,
    deviceId: identity.deviceId,
    provider: parsed.data.provider,
    token: parsed.data.token,
    environment: parsed.data.environment ?? "production",
  }).onConflictDoUpdate({
    target: [mobilePushDevicesTable.provider, mobilePushDevicesTable.token],
    set: { userId: identity.userId, deviceId: identity.deviceId, enabled: true, updatedAt: new Date() },
  }).returning();
  res.json({ id: push.id, clientId: identity.deviceId, version: 1, createdAt: push.createdAt.toISOString() });
});

router.get("/mobile/push/reminders", async (req: AuthedRequest, res): Promise<void> => {
  const [settings] = await db
    .select()
    .from(mobileReminderSettingsTable)
    .where(eq(mobileReminderSettingsTable.userId, auth(req).userId));
  res.json({
    medications: settings?.medications ?? false,
    tasks: settings?.tasks ?? false,
    events: settings?.events ?? false,
    quietHoursStart: settings?.quietHoursStart ?? null,
    quietHoursEnd: settings?.quietHoursEnd ?? null,
    timezone: settings?.timezone ?? "UTC",
    updatedAt: (settings?.updatedAt ?? new Date(0)).toISOString(),
  });
});

router.put("/mobile/push/reminders", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = UpdateMobilePushRemindersBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const updatedAt = new Date();
  await db.insert(mobileReminderSettingsTable).values({ userId: auth(req).userId, ...parsed.data, updatedAt })
    .onConflictDoUpdate({ target: mobileReminderSettingsTable.userId, set: { ...parsed.data, updatedAt } });
  res.json({ ...parsed.data, updatedAt: updatedAt.toISOString() });
});

router.get("/mobile/medication-reminders", async (req: AuthedRequest, res): Promise<void> => {
  const identity = auth(req);
  const [settings] = await db
    .select({
      medications: mobileReminderSettingsTable.medications,
      timezone: mobileReminderSettingsTable.timezone,
      quietHoursStart: mobileReminderSettingsTable.quietHoursStart,
      quietHoursEnd: mobileReminderSettingsTable.quietHoursEnd,
    })
    .from(mobileReminderSettingsTable)
    .where(eq(mobileReminderSettingsTable.userId, identity.userId));
  const rows = await db.execute(sql`
    SELECT
      s."id" AS "scheduleId",
      COALESCE(direct."id", prescribed."id") AS "medicationId",
      CONCAT(
        COALESCE(direct."name", prescribed."name"),
        CASE WHEN COALESCE(direct."strength", prescribed."strength") IS NULL THEN ''
             ELSE ' ' || COALESCE(direct."strength", prescribed."strength") END,
        CASE WHEN COALESCE(direct."unit", prescribed."unit") IS NULL THEN ''
             ELSE ' ' || COALESCE(direct."unit", prescribed."unit") END
      ) AS "medicationLabel",
      s."times",
      s."doseAmount",
      COALESCE(r."enabled", false) AS "enabled",
      COALESCE(r."revealName", false) AS "revealName"
    FROM "DosageSchedule" s
    LEFT JOIN "Prescription" p ON p."id" = s."prescriptionId" AND p."userId" = ${identity.userId}
    LEFT JOIN "Medication" direct ON direct."id" = s."medicationId" AND direct."userId" = ${identity.userId}
    LEFT JOIN "Medication" prescribed ON prescribed."id" = p."medicationId" AND prescribed."userId" = ${identity.userId}
    LEFT JOIN "MobileMedicationReminder" r
      ON r."scheduleId" = s."id" AND r."deviceId" = ${identity.deviceId} AND r."userId" = ${identity.userId}
    WHERE s."userId" = ${identity.userId}
      AND s."isActive" = true
      AND s."startDate" <= NOW()
      AND (s."endDate" IS NULL OR s."endDate" >= NOW())
      AND COALESCE(direct."isActive", prescribed."isActive") = true
      AND COALESCE(direct."id", prescribed."id") IS NOT NULL
    ORDER BY s."startDate" DESC, s."id"
  `);
  const medications = await db.execute(sql`
    SELECT
      m."id" AS "medicationId",
      CONCAT(
        m."name",
        CASE WHEN m."strength" IS NULL THEN '' ELSE ' ' || m."strength" END,
        CASE WHEN m."unit" IS NULL THEN '' ELSE ' ' || m."unit" END
      ) AS "medicationLabel",
      m."medType",
      (m."medType" IN ('prn', 'scheduled_prn', 'adhoc')) AS "supportsUnscheduled"
    FROM "Medication" m
    WHERE m."userId" = ${identity.userId}
      AND m."isActive" = true
    ORDER BY m."name", m."id"
  `);
  res.json({
    timezone: settings?.timezone ?? "UTC",
    quietHoursStart: settings?.quietHoursStart ?? null,
    quietHoursEnd: settings?.quietHoursEnd ?? null,
    enabled: settings?.medications ?? false,
    reminders: rows.rows,
    medications: medications.rows,
  });
});

router.put("/mobile/medication-reminders/:scheduleId", async (req: AuthedRequest, res): Promise<void> => {
  const params = UpdateMobileMedicationReminderParams.safeParse(req.params);
  const parsed = UpdateMobileMedicationReminderBody.safeParse(req.body);
  if (!params.success) {
    validationError(req, res, params.error.issues);
    return;
  }
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const identity = auth(req);
  const [schedule] = await db.execute(sql`
    SELECT s."id", COALESCE(direct."id", prescribed."id") AS "medicationId",
      CONCAT(
        COALESCE(direct."name", prescribed."name"),
        CASE WHEN COALESCE(direct."strength", prescribed."strength") IS NULL THEN ''
             ELSE ' ' || COALESCE(direct."strength", prescribed."strength") END,
        CASE WHEN COALESCE(direct."unit", prescribed."unit") IS NULL THEN ''
             ELSE ' ' || COALESCE(direct."unit", prescribed."unit") END
      ) AS "medicationLabel", s."times", s."doseAmount"
    FROM "DosageSchedule" s
    LEFT JOIN "Prescription" p ON p."id" = s."prescriptionId" AND p."userId" = ${identity.userId}
    LEFT JOIN "Medication" direct ON direct."id" = s."medicationId" AND direct."userId" = ${identity.userId}
    LEFT JOIN "Medication" prescribed ON prescribed."id" = p."medicationId" AND prescribed."userId" = ${identity.userId}
    WHERE s."id" = ${params.data.scheduleId} AND s."userId" = ${identity.userId}
      AND s."isActive" = true AND s."startDate" <= NOW()
      AND (s."endDate" IS NULL OR s."endDate" >= NOW())
      AND COALESCE(direct."id", prescribed."id") IS NOT NULL
  `).then((result) => result.rows as Array<Record<string, unknown>>);
  if (!schedule) {
    res.status(404).json(errorBody(req, "not_found", "The medication schedule was not found or is no longer active"));
    return;
  }
  const [saved] = await db.insert(mobileMedicationRemindersTable).values({
    userId: identity.userId,
    deviceId: identity.deviceId,
    scheduleId: params.data.scheduleId,
    enabled: parsed.data.enabled,
    revealName: parsed.data.revealName,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [mobileMedicationRemindersTable.deviceId, mobileMedicationRemindersTable.scheduleId],
    set: { enabled: parsed.data.enabled, revealName: parsed.data.revealName, updatedAt: new Date() },
  }).returning();
  res.json({
    scheduleId: params.data.scheduleId,
    medicationId: schedule.medicationId,
    medicationLabel: schedule.medicationLabel,
    times: schedule.times,
    doseAmount: schedule.doseAmount,
    enabled: saved.enabled,
    revealName: saved.revealName,
  });
});

router.get("/mobile/apple-health/controls", async (req: AuthedRequest, res): Promise<void> => {
  const rows = await db.select().from(appleHealthControlsTable).where(eq(appleHealthControlsTable.userId, auth(req).userId));
  res.json({
    metrics: rows.map((row) => ({ sampleType: row.sampleType, enabled: row.enabled, lookbackDays: row.lookbackDays })),
    readOnly: true,
    updatedAt: (rows.at(-1)?.updatedAt ?? new Date(0)).toISOString(),
  });
});

router.put("/mobile/apple-health/controls", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = UpdateAppleHealthControlsBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const identity = auth(req);
  const unique = new Set(parsed.data.metrics.map((metric) => metric.sampleType));
  if (unique.size !== parsed.data.metrics.length) {
    validationError(req, res, [{ path: ["metrics"], message: "sampleType values must be unique" }]);
    return;
  }
  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    for (const metric of parsed.data.metrics) {
      await tx.insert(appleHealthControlsTable).values({
        userId: identity.userId, ...metric, lookbackDays: metric.lookbackDays ?? 30, updatedAt,
      }).onConflictDoUpdate({
        target: [appleHealthControlsTable.userId, appleHealthControlsTable.sampleType],
        set: { enabled: metric.enabled, lookbackDays: metric.lookbackDays ?? 30, updatedAt },
      });
    }
    await tx.insert(appleHealthAuditTable).values({
      userId: identity.userId, deviceId: identity.deviceId, action: "controls_updated",
      subjectType: "controls", subjectId: identity.userId, details: { metrics: parsed.data.metrics },
    });
  });
  res.json({ metrics: parsed.data.metrics, readOnly: true, updatedAt: updatedAt.toISOString() });
});

router.put("/mobile/apple-health/imported-copy-controls", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = UpdateAppleHealthImportedCopyControlsBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const controls = parsed.data.controls;
  if (new Set(controls.map((control) => control.sampleType)).size !== controls.length) {
    validationError(req, res, [{ path: ["controls"], message: "sampleType values must be unique" }]);
    return;
  }
  const identity = auth(req);
  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    for (const control of controls) {
      await tx.insert(appleHealthImportedCopyControlsTable).values({
        userId: identity.userId, ...control, updatedAt,
        pausedAt: control.paused ? updatedAt : null,
        disconnectedAt: control.disconnected ? updatedAt : null,
      }).onConflictDoUpdate({
        target: [appleHealthImportedCopyControlsTable.userId, appleHealthImportedCopyControlsTable.sampleType],
        set: {
          annotation: control.annotation, excludeFromTrends: control.excludeFromTrends,
          paused: control.paused, disconnected: control.disconnected,
          pausedAt: control.paused ? updatedAt : null,
          disconnectedAt: control.disconnected ? updatedAt : null, updatedAt,
        },
      });
    }
    await tx.insert(appleHealthAuditTable).values({
      userId: identity.userId, deviceId: identity.deviceId, action: "imported_copy_controls_updated",
      subjectType: "imported_copy_controls", subjectId: identity.userId,
      details: { controls, readOnly: true },
    });
  });
  res.json({ controls, readOnly: true, updatedAt: updatedAt.toISOString() });
});

router.delete("/mobile/apple-health/imported-copies", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = DeleteAppleHealthImportedCopiesBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const identity = auth(req);
  const requestedIds = parsed.data.healthKitUuids ?? [];
  const [control] = await db.select().from(appleHealthImportedCopyControlsTable).where(and(
    eq(appleHealthImportedCopyControlsTable.userId, identity.userId),
    eq(appleHealthImportedCopyControlsTable.sampleType, parsed.data.sampleType),
  ));
  // Empty IDs represents a per-type local hide, stored as a type tombstone.
  const tombstones = requestedIds.length
    ? requestedIds.map((healthKitUuid) => ({ userId: identity.userId, sampleType: parsed.data.sampleType, healthKitUuid, reason: parsed.data.reason }))
    : [{ userId: identity.userId, sampleType: parsed.data.sampleType, healthKitUuid: null, reason: parsed.data.reason }];
  await db.transaction(async (tx) => {
    await tx.insert(appleHealthImportedCopyTombstonesTable).values(tombstones).onConflictDoNothing();
    if (!requestedIds.length) {
      // Per-type tombstones are represented by the pause control to avoid a
      // nullable unique-key duplicate loophole while retaining an audit row.
      await tx.insert(appleHealthImportedCopyControlsTable).values({
        userId: identity.userId, sampleType: parsed.data.sampleType, annotation: control?.annotation ?? null,
        excludeFromTrends: control?.excludeFromTrends ?? false, paused: true,
        disconnected: control?.disconnected ?? false, pausedAt: new Date(),
      }).onConflictDoUpdate({
        target: [appleHealthImportedCopyControlsTable.userId, appleHealthImportedCopyControlsTable.sampleType],
        set: { paused: true, pausedAt: new Date(), updatedAt: new Date() },
      });
    }
    await tx.insert(appleHealthAuditTable).values({
      userId: identity.userId, deviceId: identity.deviceId, action: "imported_copy_deleted_locally",
      subjectType: "imported_copy", subjectId: parsed.data.sampleType,
      details: { healthKitUuids: requestedIds, reason: parsed.data.reason ?? null, readOnly: true },
    });
  });
  res.json({ tombstonesCreated: tombstones.length, readOnly: true });
});

router.post("/mobile/apple-health/import-batches", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = ImportAppleHealthBatchBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  if (parsed.data.samples.some((sample) => sample.sampleType !== parsed.data.sampleType) ||
      parsed.data.deletions.some((deletion) => deletion.sampleType !== parsed.data.sampleType)) {
    validationError(req, res, [{ path: ["sampleType"], message: "Every item must match the batch sampleType" }]);
    return;
  }
  const identity = auth(req);
  const [control] = await db.select().from(appleHealthControlsTable).where(and(
    eq(appleHealthControlsTable.userId, identity.userId),
    eq(appleHealthControlsTable.sampleType, parsed.data.sampleType),
  ));
  if (!control?.enabled) {
    res.status(400).json(errorBody(req, "metric_disabled", "Import is disabled for this Apple Health sample type"));
    return;
  }
  const idem = await beginIdempotency(req, res, "apple-health.import", parsed.data);
  if (!idem) return;
  const [copyControl] = await db.select().from(appleHealthImportedCopyControlsTable).where(and(
    eq(appleHealthImportedCopyControlsTable.userId, identity.userId),
    eq(appleHealthImportedCopyControlsTable.sampleType, parsed.data.sampleType),
  ));
  if (copyControl?.paused || copyControl?.disconnected) {
    res.status(400).json(errorBody(req, "metric_disabled", "Imports are paused or disconnected for this Apple Health sample type"));
    return;
  }
  const tombstones = await db.select({
    healthKitUuid: appleHealthImportedCopyTombstonesTable.healthKitUuid,
  }).from(appleHealthImportedCopyTombstonesTable).where(and(
    eq(appleHealthImportedCopyTombstonesTable.userId, identity.userId),
    eq(appleHealthImportedCopyTombstonesTable.sampleType, parsed.data.sampleType),
  ));
  const hiddenType = tombstones.some((row) => row.healthKitUuid === null);
  const hiddenIds = new Set(tombstones.flatMap((row) => row.healthKitUuid ? [row.healthKitUuid] : []));
  const existing = await db.select({
    uuid: appleHealthSamplesTable.healthKitUuid,
    unit: appleHealthSamplesTable.unit,
    value: appleHealthSamplesTable.value,
  }).from(appleHealthSamplesTable)
    .where(and(eq(appleHealthSamplesTable.userId, identity.userId), eq(appleHealthSamplesTable.sampleType, parsed.data.sampleType)));
  const visibleExisting = hiddenType ? [] : existing.filter((row) => !hiddenIds.has(row.uuid));
  const existingIds = new Set(existing.map((item) => item.uuid));
  const acceptedSamples = parsed.data.samples.filter((sample) => !existingIds.has(sample.healthKitUuid) && !hiddenIds.has(sample.healthKitUuid));
  const anomalyCandidates = !copyControl?.excludeFromTrends && !copyControl?.paused && !copyControl?.disconnected
    ? acceptedSamples.flatMap((sample) => {
        const values = visibleExisting
          .filter((prior) => prior.unit === sample.unit)
          .map((prior) => Number(prior.value))
          .filter(Number.isFinite);
        if (values.length < 20) return [];
        const mean = values.reduce((total, value) => total + value, 0) / values.length;
        const standardDeviation = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
        if (!Number.isFinite(standardDeviation) || standardDeviation === 0 || Math.abs(sample.value - mean) < standardDeviation * 3) return [];
        return [{
          sample,
          fingerprint: hash(`${identity.userId}|${sample.sampleType}|${sample.unit}|${sample.healthKitUuid}`),
          evidence: {
            source: { healthKitUuid: sample.healthKitUuid, sourceBundleId: sample.sourceBundleId, sourceRevision: sample.sourceRevision },
            observedValue: sample.value, unit: sample.unit,
            surroundingTrend: { count: values.length, mean, standardDeviation, lowerBound: mean - standardDeviation * 3, upperBound: mean + standardDeviation * 3 },
          },
        }];
      })
    : [];
  const importedAt = new Date();
  const [batch] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(appleHealthImportBatchesTable).values({
      userId: identity.userId, deviceId: identity.deviceId, sampleType: parsed.data.sampleType,
      previousAnchor: parsed.data.previousAnchor, nextAnchor: parsed.data.anchor, requestHash: idem.hash,
      acceptedCount: acceptedSamples.length, duplicateCount: parsed.data.samples.length - acceptedSamples.length,
      deletionCount: parsed.data.deletions.length, importedAt,
    }).returning();
    if (acceptedSamples.length) {
      await tx.insert(appleHealthSamplesTable).values(acceptedSamples.map((sample) => ({
        userId: identity.userId, batchId: created.id, healthKitUuid: sample.healthKitUuid,
        sampleType: sample.sampleType, value: String(sample.value), unit: sample.unit,
        startAt: new Date(sample.startAt), endAt: new Date(sample.endAt), sourceBundleId: sample.sourceBundleId,
        sourceRevision: sample.sourceRevision, metadata: sample.metadata, payloadHash: requestHash(sample), importedAt,
      }))).onConflictDoNothing();
    }
    if (parsed.data.deletions.length) {
      await tx.insert(appleHealthDeletionsTable).values(parsed.data.deletions.map((deletion) => ({
        userId: identity.userId, batchId: created.id, healthKitUuid: deletion.healthKitUuid,
        sampleType: deletion.sampleType, healthKitDeletedAt: new Date(deletion.deletedAt), importedAt,
      }))).onConflictDoNothing();
      await tx.insert(appleHealthImportedCopyTombstonesTable).values(parsed.data.deletions.map((deletion) => ({
        userId: identity.userId, sampleType: deletion.sampleType, healthKitUuid: deletion.healthKitUuid,
        reason: "Source record deleted in Apple Health",
      }))).onConflictDoNothing();
    }
    if (anomalyCandidates.length) {
      await tx.insert(mobileAnomaliesTable).values(anomalyCandidates.map((candidate) => ({
        userId: identity.userId, sampleType: candidate.sample.sampleType, observedAt: new Date(candidate.sample.endAt),
        summary: "A value differs from the available imported trend context.",
        disclaimer: nonDiagnosticDisclaimer, evidence: candidate.evidence, fingerprint: candidate.fingerprint,
      }))).onConflictDoNothing();
    }
    await tx.insert(appleHealthAnchorsTable).values({
      userId: identity.userId, deviceId: identity.deviceId, sampleType: parsed.data.sampleType,
      anchor: parsed.data.anchor, batchId: created.id, updatedAt: importedAt,
    }).onConflictDoUpdate({
      target: [appleHealthAnchorsTable.deviceId, appleHealthAnchorsTable.sampleType],
      set: { anchor: parsed.data.anchor, batchId: created.id, updatedAt: importedAt },
    });
    await tx.insert(appleHealthAuditTable).values({
      userId: identity.userId, deviceId: identity.deviceId, action: "batch_imported",
      subjectType: "import_batch", subjectId: created.id,
      details: { readOnly: true, accepted: acceptedSamples.length, deletions: parsed.data.deletions.length },
    });
    return [created];
  });
  const response = {
    batchId: batch.id, accepted: acceptedSamples.length,
    duplicates: parsed.data.samples.length - acceptedSamples.length,
    deletions: parsed.data.deletions.length, anchor: parsed.data.anchor,
  };
  await finishIdempotency(identity.userId, "apple-health.import", idem.key, 202, response);
  res.status(202).json(response);
});

router.get("/mobile/apple-health/anchors/:sampleType", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetAppleHealthAnchorParams.safeParse(req.params);
  if (!params.success) {
    validationError(req, res, params.error.issues);
    return;
  }
  const [anchor] = await db.select().from(appleHealthAnchorsTable).where(and(
    eq(appleHealthAnchorsTable.userId, auth(req).userId),
    eq(appleHealthAnchorsTable.deviceId, auth(req).deviceId),
    eq(appleHealthAnchorsTable.sampleType, params.data.sampleType),
  ));
  if (!anchor) {
    res.status(404).json(errorBody(req, "not_found", "Apple Health anchor not found"));
    return;
  }
  res.json({ sampleType: anchor.sampleType, anchor: anchor.anchor, updatedAt: anchor.updatedAt.toISOString() });
});

router.get("/mobile/anomalies", async (req: AuthedRequest, res): Promise<void> => {
  const parsed = ListMobileAnomaliesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    validationError(req, res, parsed.error.issues);
    return;
  }
  const condition = parsed.data.status
    ? and(eq(mobileAnomaliesTable.userId, auth(req).userId), eq(mobileAnomaliesTable.status, parsed.data.status))
    : eq(mobileAnomaliesTable.userId, auth(req).userId);
  const rows = await db.select().from(mobileAnomaliesTable).where(condition);
  res.json(rows.map((row) => ({
    id: row.id, sampleType: row.sampleType, observedAt: row.observedAt.toISOString(),
    summary: row.summary, disclaimer: nonDiagnosticDisclaimer, evidence: row.evidence, status: row.status, createdAt: row.createdAt.toISOString(),
  })));
});

router.post("/mobile/anomalies/:anomalyId/review", async (req: AuthedRequest, res): Promise<void> => {
  const params = ReviewMobileAnomalyParams.safeParse(req.params);
  const parsed = ReviewMobileAnomalyBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    validationError(req, res, [...(params.success ? [] : params.error.issues), ...(parsed.success ? [] : parsed.error.issues)]);
    return;
  }
  const [row] = await db.update(mobileAnomaliesTable).set({
    status: parsed.data.decision, reviewNote: parsed.data.note, reviewedAt: new Date(),
  }).where(and(
    eq(mobileAnomaliesTable.id, params.data.anomalyId),
    eq(mobileAnomaliesTable.userId, auth(req).userId),
  )).returning();
  if (!row) {
    res.status(404).json(errorBody(req, "not_found", "Anomaly observation not found"));
    return;
  }
  res.json({
    id: row.id, sampleType: row.sampleType, observedAt: row.observedAt.toISOString(),
    summary: row.summary, disclaimer: nonDiagnosticDisclaimer, evidence: row.evidence, status: row.status, createdAt: row.createdAt.toISOString(),
  });
});

export default router;