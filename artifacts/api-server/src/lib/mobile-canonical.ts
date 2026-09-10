import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

type SqlExecutor = {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
};

export type CanonicalEntityType = "transaction" | "task" | "vital" | "medicationDose" | "event";

export class MobileCanonicalError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "MobileCanonicalError";
  }
}

type Row = Record<string, unknown>;

async function one<T extends Row>(executor: SqlExecutor, query: SQL): Promise<T | undefined> {
  const result = await executor.execute(query);
  return result.rows[0] as T | undefined;
}

function stringValue(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];
  return typeof value === "string" ? value : undefined;
}

function dateValue(payload: Record<string, unknown>, field: string): Date | undefined {
  const value = payload[field];
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

function numberValue(payload: Record<string, unknown>, field: string): number | undefined {
  const value = payload[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(payload: Record<string, unknown>, field: string): string | null {
  return stringValue(payload, field) ?? null;
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined || value === null || value === "") {
    throw new MobileCanonicalError("invalid_payload", `${field} is required`);
  }
  return value;
}

function assertEndAfterStart(start: Date, end: Date | null): void {
  if (end && end < start) {
    throw new MobileCanonicalError("invalid_payload", "endsAt must be after startsAt");
  }
}

async function validateAccount(
  tx: SqlExecutor,
  userId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const accountId = optionalString(payload, "accountId");
  if (accountId) {
    const account = await one(tx, sql`SELECT "id" FROM "FinAccount" WHERE "id" = ${accountId} AND "userId" = ${userId}`);
    if (!account) throw new MobileCanonicalError("not_found", "Account not found", 404);
  }
  return accountId;
}

async function validateMedicationDose(
  tx: SqlExecutor,
  userId: string,
  payload: Record<string, unknown>,
): Promise<{
  medicationId: string;
  scheduleId: string | null;
  takenAt: Date;
  status: "taken" | "skipped";
  doseTaken: string | null;
  doseNumber: number;
  skipReason: string | null;
}> {
  const medicationId = required(stringValue(payload, "medicationId"), "medicationId");
  const requestedScheduleId = optionalString(payload, "scheduleId");
  const takenAt = required(dateValue(payload, "takenAt"), "takenAt");
  const statusValue = required(stringValue(payload, "status"), "status");
  if (statusValue !== "taken" && statusValue !== "skipped") {
    throw new MobileCanonicalError("invalid_payload", "status must be taken or skipped");
  }
  const status = statusValue;
  const medication = await one<{ id: string; medType: string; isActive: boolean }>(tx, sql`
    SELECT "id", "medType", "isActive"
    FROM "Medication"
    WHERE "id" = ${medicationId} AND "userId" = ${userId}
  `);
  if (!medication || !medication.isActive) throw new MobileCanonicalError("not_found", "Medication not found", 404);

  let schedule: {
    id: string;
    medicationId: string | null;
    prescriptionMedicationId: string | null;
    doseAmount: string;
  } | undefined;
  if (requestedScheduleId) {
    schedule = await one<{
      id: string;
      medicationId: string | null;
      prescriptionMedicationId: string | null;
      doseAmount: string;
    }>(tx, sql`
      SELECT ds."id", ds."medicationId", p."medicationId" AS "prescriptionMedicationId", ds."doseAmount"
      FROM "DosageSchedule" ds
      LEFT JOIN "Prescription" p ON p."id" = ds."prescriptionId" AND p."userId" = ${userId}
      WHERE ds."id" = ${requestedScheduleId}
        AND ds."userId" = ${userId}
        AND ds."isActive" = true
        AND ds."startDate" <= NOW()
        AND (ds."endDate" IS NULL OR ds."endDate" >= NOW())
        AND (
          ds."medicationId" = ${medicationId}
          OR p."medicationId" = ${medicationId}
        )
      LIMIT 1
    `);
    if (!schedule) throw new MobileCanonicalError("not_found", "Medication schedule not found or is no longer active", 404);
    const linkedMedicationId = schedule.medicationId ?? schedule.prescriptionMedicationId;
    if (linkedMedicationId !== medicationId) {
      throw new MobileCanonicalError("invalid_payload", "Schedule is not linked to this medication");
    }
  } else if (!["prn", "scheduled_prn", "adhoc"].includes(medication.medType)) {
    throw new MobileCanonicalError("invalid_payload", "An active schedule is required for this medication");
  }

  const requestedDose = stringValue(payload, "dose");
  const doseTaken = status === "skipped" ? requestedDose ?? null : requestedDose ?? schedule?.doseAmount ?? null;
  const doseNumber = Number(doseTaken);
  if (status === "taken" && (!Number.isFinite(doseNumber) || doseNumber <= 0)) {
    throw new MobileCanonicalError("invalid_payload", "dose must be a positive number");
  }
  return {
    medicationId,
    scheduleId: schedule?.id ?? null,
    takenAt,
    status,
    doseTaken,
    doseNumber: status === "taken" ? doseNumber : 0,
    skipReason: status === "skipped" ? optionalString(payload, "reason") : null,
  };
}

async function lockMedicationStock(tx: SqlExecutor, userId: string, medicationIds: string[]): Promise<void> {
  for (const medicationId of [...new Set(medicationIds)].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${medicationId}`}))`);
  }
}

async function appendStockAdjustment(
  tx: SqlExecutor,
  userId: string,
  medicationId: string,
  quantityChange: number,
  notes: string,
): Promise<void> {
  const stock = await one<{ currentQuantity: number }>(tx, sql`
    UPDATE "StockLevel"
    SET "currentQuantity" = "currentQuantity" + ${quantityChange}
    WHERE "userId" = ${userId} AND "medicationId" = ${medicationId}
      AND "currentQuantity" + ${quantityChange} >= 0
    RETURNING "currentQuantity"
  `);
  if (!stock) {
    throw new MobileCanonicalError(
      quantityChange < 0 ? "insufficient_stock" : "not_found",
      quantityChange < 0 ? "Insufficient stock to log this dose" : "Medication stock is not configured",
      quantityChange < 0 ? 409 : 404,
    );
  }
  await tx.execute(sql`
    INSERT INTO "StockTransaction" (
      "id", "userId", "medicationId", "type", "quantityChange", "balanceAfter", "notes"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${medicationId}, 'adjustment', ${quantityChange},
      ${stock.currentQuantity}, ${notes}
    )
  `);
}

async function consumeMedicationStock(
  tx: SqlExecutor,
  userId: string,
  medicationId: string,
  doseNumber: number,
): Promise<void> {
  const stock = await one<{ currentQuantity: number }>(tx, sql`
    UPDATE "StockLevel"
    SET "currentQuantity" = "currentQuantity" - ${doseNumber}
    WHERE "userId" = ${userId} AND "medicationId" = ${medicationId}
      AND "currentQuantity" >= ${doseNumber}
    RETURNING "currentQuantity"
  `);
  if (!stock) throw new MobileCanonicalError("insufficient_stock", "Insufficient stock to log this dose", 409);
  await tx.execute(sql`
    INSERT INTO "StockTransaction" (
      "id", "userId", "medicationId", "type", "quantityChange", "balanceAfter", "notes"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${medicationId}, 'consume', ${-doseNumber},
      ${stock.currentQuantity}, 'Dose logged'
    )
  `);
}

async function existingMedicationDose(
  tx: SqlExecutor,
  userId: string,
  id: string,
): Promise<{ medicationId: string; doseNumber: number; skipped: boolean } | undefined> {
  const log = await one<{
    medicationId: string;
    doseTaken: string | null;
    skipped: boolean;
  }>(tx, sql`
    SELECT COALESCE(ml."medicationId", ds."medicationId", p."medicationId") AS "medicationId",
      ml."doseTaken", ml."skipped"
    FROM "MedicationLog" ml
    LEFT JOIN "DosageSchedule" ds ON ds."id" = ml."scheduleId" AND ds."userId" = ${userId}
    LEFT JOIN "Prescription" p ON p."id" = ds."prescriptionId" AND p."userId" = ${userId}
    WHERE ml."id" = ${id} AND ml."userId" = ${userId}
    FOR UPDATE OF ml
  `);
  if (!log?.medicationId) return undefined;
  const doseNumber = Number(log.doseTaken);
  return {
    medicationId: log.medicationId,
    doseNumber: log.skipped || !Number.isFinite(doseNumber) ? 0 : doseNumber,
    skipped: log.skipped,
  };
}

async function mapTransaction(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const accountId = await validateAccount(tx, userId, payload);
  const amount = required(numberValue(payload, "amount"), "amount");
  const occurredAt = required(dateValue(payload, "occurredAt"), "occurredAt");
  const currency = required(stringValue(payload, "currency"), "currency");
  const merchant = optionalString(payload, "merchant");
  const notes = optionalString(payload, "notes");
  const category = optionalString(payload, "category");
  const now = new Date();

  await tx.execute(sql`
    INSERT INTO "Transaction" (
      "id", "userId", "date", "amount", "currency", "merchant", "category",
      "accountId", "tags", "notes", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${userId}, ${occurredAt}, ${amount}, ${currency}, ${merchant}, ${category},
      ${accountId}, ARRAY[]::text[], ${notes}, CAST('pending' AS "TransactionStatus"), ${now}, ${now}
    )
  `);
  await tx.execute(sql`
    INSERT INTO "TransactionAuditRecord" (
      "id", "userId", "transactionId", "action", "nextStatus", "changes"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${id}, CAST('created' AS "TransactionAuditAction"),
      CAST('pending' AS "TransactionStatus"), ${JSON.stringify({ source: "mobile" })}::jsonb
    )
  `);
}

async function mapTask(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const title = required(stringValue(payload, "title"), "title");
  const dueAt = dateValue(payload, "dueAt") ?? null;
  const priority = stringValue(payload, "priority") ?? "medium";
  const now = new Date();
  await tx.execute(sql`
    INSERT INTO "Task" (
      "id", "userId", "title", "description", "status", "priority", "tags", "dueDate", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${userId}, ${title}, ${optionalString(payload, "notes")}, 'todo', ${priority},
      ARRAY[]::text[], ${dueAt}, ${now}, ${now}
    )
  `);
}

async function mapVital(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const name = required(stringValue(payload, "type"), "type");
  const unit = required(stringValue(payload, "unit"), "unit");
  const value = required(numberValue(payload, "value"), "value");
  const measuredAt = required(dateValue(payload, "measuredAt"), "measuredAt");
  const secondaryValue = numberValue(payload, "secondaryValue");
  const notes = optionalString(payload, "notes");
  const combinedNotes = secondaryValue === undefined
    ? notes
    : `${notes ? `${notes}\n` : ""}Secondary value: ${secondaryValue}`;
  const vitalType = await one<{ id: string }>(tx, sql`
    INSERT INTO "VitalType" ("id", "userId", "name", "unit")
    VALUES (${randomUUID()}, ${userId}, ${name}, ${unit})
    ON CONFLICT ("userId", "name") DO UPDATE SET "unit" = EXCLUDED."unit"
    RETURNING "id"
  `);
  if (!vitalType) throw new MobileCanonicalError("internal_error", "Vital type could not be created", 409);
  await tx.execute(sql`
    INSERT INTO "VitalLog" ("id", "userId", "vitalTypeId", "value", "loggedAt", "device", "notes")
    VALUES (${id}, ${userId}, ${vitalType.id}, ${value}, ${measuredAt}, 'mobile', ${combinedNotes})
  `);
}

async function mapMedicationDose(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const dose = await validateMedicationDose(tx, userId, payload);
  if (dose.status === "taken") {
    await lockMedicationStock(tx, userId, [dose.medicationId]);
    await consumeMedicationStock(tx, userId, dose.medicationId, dose.doseNumber);
  }
  await tx.execute(sql`
    INSERT INTO "MedicationLog" (
      "id", "userId", "medicationId", "scheduleId", "takenAt", "doseTaken", "skipped", "skipReason"
    ) VALUES (
      ${id}, ${userId}, ${dose.medicationId}, ${dose.scheduleId}, ${dose.takenAt}, ${dose.doseTaken},
      ${dose.status === "skipped"}, ${dose.skipReason}
    )
  `);
}

async function mapEvent(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const title = required(stringValue(payload, "title"), "title");
  const startsAt = required(dateValue(payload, "startsAt"), "startsAt");
  const endsAt = dateValue(payload, "endsAt") ?? null;
  assertEndAfterStart(startsAt, endsAt);
  const now = new Date();
  await tx.execute(sql`
    INSERT INTO "Event" (
      "id", "userId", "title", "startDatetime", "endDatetime", "allDay", "notes", "peopleRefs", "tags", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${userId}, ${title}, ${startsAt}, ${endsAt},
      ${payload.allDay === true}, ${optionalString(payload, "notes")},
      ARRAY[]::text[], ARRAY[]::text[], ${now}, ${now}
    )
  `);
}

async function updateTransaction(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const accountId = await validateAccount(tx, userId, payload);
  const amount = required(numberValue(payload, "amount"), "amount");
  const occurredAt = required(dateValue(payload, "occurredAt"), "occurredAt");
  const currency = required(stringValue(payload, "currency"), "currency");
  const now = new Date();
  const updated = await one<{ status: string }>(tx, sql`
    UPDATE "Transaction"
    SET "date" = ${occurredAt}, "amount" = ${amount}, "currency" = ${currency},
      "merchant" = ${optionalString(payload, "merchant")},
      "category" = ${optionalString(payload, "category")},
      "accountId" = ${accountId}, "notes" = ${optionalString(payload, "notes")}, "updatedAt" = ${now}
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING "status"
  `);
  if (!updated) throw new MobileCanonicalError("not_found", "Canonical transaction not found", 404);
  await tx.execute(sql`
    INSERT INTO "TransactionAuditRecord" (
      "id", "userId", "transactionId", "action", "nextStatus", "changes"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${id}, CAST('updated' AS "TransactionAuditAction"),
      CAST(${updated.status} AS "TransactionStatus"), ${JSON.stringify({ source: "mobile" })}::jsonb
    )
  `);
}

async function updateTask(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const title = required(stringValue(payload, "title"), "title");
  const now = new Date();
  const updated = await tx.execute(sql`
    UPDATE "Task"
    SET "title" = ${title}, "description" = ${optionalString(payload, "notes")},
      "priority" = ${stringValue(payload, "priority") ?? "medium"},
      "dueDate" = ${dateValue(payload, "dueAt") ?? null}, "updatedAt" = ${now}
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING "id"
  `);
  if (!updated.rows.length) throw new MobileCanonicalError("not_found", "Canonical task not found", 404);
}

async function upsertVitalType(
  tx: SqlExecutor,
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; value: number; measuredAt: Date; notes: string | null }> {
  const name = required(stringValue(payload, "type"), "type");
  const unit = required(stringValue(payload, "unit"), "unit");
  const value = required(numberValue(payload, "value"), "value");
  const measuredAt = required(dateValue(payload, "measuredAt"), "measuredAt");
  const secondaryValue = numberValue(payload, "secondaryValue");
  const notes = optionalString(payload, "notes");
  const combinedNotes = secondaryValue === undefined
    ? notes
    : `${notes ? `${notes}\n` : ""}Secondary value: ${secondaryValue}`;
  const vitalType = await one<{ id: string }>(tx, sql`
    INSERT INTO "VitalType" ("id", "userId", "name", "unit")
    VALUES (${randomUUID()}, ${userId}, ${name}, ${unit})
    ON CONFLICT ("userId", "name") DO UPDATE SET "unit" = EXCLUDED."unit"
    RETURNING "id"
  `);
  if (!vitalType) throw new MobileCanonicalError("internal_error", "Vital type could not be created", 409);
  return { id: vitalType.id, value, measuredAt, notes: combinedNotes };
}

async function updateVital(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const existing = await one<{ id: string }>(tx, sql`
    SELECT "id" FROM "VitalLog" WHERE "id" = ${id} AND "userId" = ${userId}
  `);
  if (!existing) throw new MobileCanonicalError("not_found", "Canonical vital not found", 404);
  const vital = await upsertVitalType(tx, userId, payload);
  const updated = await tx.execute(sql`
    UPDATE "VitalLog"
    SET "vitalTypeId" = ${vital.id}, "value" = ${vital.value},
      "loggedAt" = ${vital.measuredAt}, "notes" = ${vital.notes}
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING "id"
  `);
  if (!updated.rows.length) throw new MobileCanonicalError("not_found", "Canonical vital not found", 404);
}

async function updateMedicationDose(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const next = await validateMedicationDose(tx, userId, payload);
  const previous = await existingMedicationDose(tx, userId, id);
  if (!previous) throw new MobileCanonicalError("not_found", "Canonical medication dose not found", 404);
  await lockMedicationStock(tx, userId, [previous.medicationId, next.medicationId]);
  if (previous.doseNumber > 0) {
    await appendStockAdjustment(tx, userId, previous.medicationId, previous.doseNumber, "Mobile dose edit reversal");
  }
  if (next.status === "taken") {
    await consumeMedicationStock(tx, userId, next.medicationId, next.doseNumber);
  }
  const updated = await tx.execute(sql`
    UPDATE "MedicationLog"
    SET "medicationId" = ${next.medicationId}, "scheduleId" = ${next.scheduleId}, "takenAt" = ${next.takenAt},
      "doseTaken" = ${next.doseTaken}, "skipped" = ${next.status === "skipped"},
      "skipReason" = ${next.skipReason}
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING "id"
  `);
  if (!updated.rows.length) throw new MobileCanonicalError("not_found", "Canonical medication dose not found", 404);
}

async function updateEvent(
  tx: SqlExecutor,
  userId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const title = required(stringValue(payload, "title"), "title");
  const startsAt = required(dateValue(payload, "startsAt"), "startsAt");
  const endsAt = dateValue(payload, "endsAt") ?? null;
  assertEndAfterStart(startsAt, endsAt);
  const now = new Date();
  const updated = await tx.execute(sql`
    UPDATE "Event"
    SET "title" = ${title}, "startDatetime" = ${startsAt}, "endDatetime" = ${endsAt},
      "allDay" = ${payload.allDay === true}, "notes" = ${optionalString(payload, "notes")}, "updatedAt" = ${now}
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING "id"
  `);
  if (!updated.rows.length) throw new MobileCanonicalError("not_found", "Canonical event not found", 404);
}

async function deleteTransaction(tx: SqlExecutor, userId: string, id: string): Promise<void> {
  const deleted = await one<{ status: string }>(tx, sql`
    DELETE FROM "Transaction" WHERE "id" = ${id} AND "userId" = ${userId} RETURNING "status"
  `);
  if (!deleted) return;
  await tx.execute(sql`
    INSERT INTO "TransactionAuditRecord" (
      "id", "userId", "transactionId", "action", "previousStatus", "changes"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${id}, CAST('deleted' AS "TransactionAuditAction"),
      CAST(${deleted.status} AS "TransactionStatus"), ${JSON.stringify({ source: "mobile" })}::jsonb
    )
  `);
}

async function deleteSimpleCanonical(
  tx: SqlExecutor,
  table: "Task" | "VitalLog" | "Event",
  userId: string,
  id: string,
): Promise<void> {
  await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE "id" = ${id} AND "userId" = ${userId}`);
}

async function deleteMedicationDose(tx: SqlExecutor, userId: string, id: string): Promise<void> {
  const previous = await existingMedicationDose(tx, userId, id);
  if (!previous) return;
  await lockMedicationStock(tx, userId, [previous.medicationId]);
  if (previous.doseNumber > 0) {
    await appendStockAdjustment(tx, userId, previous.medicationId, previous.doseNumber, "Mobile dose deletion reversal");
  }
  await tx.execute(sql`DELETE FROM "MedicationLog" WHERE "id" = ${id} AND "userId" = ${userId}`);
}

/**
 * Materialises a validated mobile payload in the table used by the web
 * dashboard. The mobile record is deliberately written by the caller in the
 * same transaction so the staging copy and canonical record cannot diverge.
 */
export async function materialiseMobileCanonical(
  tx: SqlExecutor,
  userId: string,
  entityType: CanonicalEntityType,
  payload: Record<string, unknown>,
  canonicalId: string,
): Promise<void> {
  switch (entityType) {
    case "transaction":
      await mapTransaction(tx, userId, canonicalId, payload);
      return;
    case "task":
      await mapTask(tx, userId, canonicalId, payload);
      return;
    case "vital":
      await mapVital(tx, userId, canonicalId, payload);
      return;
    case "medicationDose":
      await mapMedicationDose(tx, userId, canonicalId, payload);
      return;
    case "event":
      await mapEvent(tx, userId, canonicalId, payload);
      return;
  }
}

export async function updateMobileCanonical(
  tx: SqlExecutor,
  userId: string,
  entityType: CanonicalEntityType,
  payload: Record<string, unknown>,
  canonicalId: string,
): Promise<void> {
  switch (entityType) {
    case "transaction":
      await updateTransaction(tx, userId, canonicalId, payload);
      return;
    case "task":
      await updateTask(tx, userId, canonicalId, payload);
      return;
    case "vital":
      await updateVital(tx, userId, canonicalId, payload);
      return;
    case "medicationDose":
      await updateMedicationDose(tx, userId, canonicalId, payload);
      return;
    case "event":
      await updateEvent(tx, userId, canonicalId, payload);
      return;
  }
}

export async function deleteMobileCanonical(
  tx: SqlExecutor,
  userId: string,
  entityType: CanonicalEntityType,
  canonicalId: string,
): Promise<void> {
  switch (entityType) {
    case "transaction":
      await deleteTransaction(tx, userId, canonicalId);
      return;
    case "task":
      await deleteSimpleCanonical(tx, "Task", userId, canonicalId);
      return;
    case "vital":
      await deleteSimpleCanonical(tx, "VitalLog", userId, canonicalId);
      return;
    case "medicationDose":
      await deleteMedicationDose(tx, userId, canonicalId);
      return;
    case "event":
      await deleteSimpleCanonical(tx, "Event", userId, canonicalId);
      return;
  }
}
