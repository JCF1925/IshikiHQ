import { randomUUID } from "node:crypto";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const runtimeId = () => randomUUID();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// Read-only mapping of the existing Prisma-owned `User` table. Do not rename
// its quoted PascalCase table or camelCase columns.
export const usersTable = pgTable("User", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("passwordHash"),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const mobileDevicesTable = pgTable(
  "MobileDevice",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    installId: text("installId").notNull(),
    platform: text("platform").notNull(),
    deviceName: text("deviceName").notNull(),
    appVersion: text("appVersion"),
    lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("MobileDevice_userId_installId_key").on(table.userId, table.installId),
    index("MobileDevice_userId_idx").on(table.userId),
  ],
);

export const mobileSessionsTable = pgTable(
  "MobileDeviceSession",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").notNull().references(() => mobileDevicesTable.id, { onDelete: "cascade" }),
    tokenHash: text("tokenHash").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("MobileDeviceSession_tokenHash_key").on(table.tokenHash),
    index("MobileDeviceSession_userId_deviceId_idx").on(table.userId, table.deviceId),
    index("MobileDeviceSession_expiresAt_idx").on(table.expiresAt),
  ],
);

export const mobileRecordsTable = pgTable(
  "MobileRecord",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").references(() => mobileDevicesTable.id, { onDelete: "set null" }),
    clientId: text("clientId").notNull(),
    entityType: text("entityType").notNull(),
    payload: jsonb("payload").notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("MobileRecord_userId_entityType_clientId_key").on(table.userId, table.entityType, table.clientId),
    index("MobileRecord_userId_updatedAt_idx").on(table.userId, table.updatedAt),
  ],
);

// Prisma's BigInt autoincrement id is BIGSERIAL. The server calls it sequence
// so cursors remain implementation-neutral while the SQL column stays `id`.
export const mobileSyncChangesTable = pgTable(
  "MobileSyncChange",
  {
    sequence: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").references(() => mobileDevicesTable.id, { onDelete: "set null" }),
    changeId: text("changeId").notNull(),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    operation: text("operation").notNull(),
    version: integer("version").notNull(),
    payload: jsonb("payload").notNull(),
    changedAt: timestamp("changedAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("MobileSyncChange_userId_changeId_key").on(table.userId, table.changeId),
    index("MobileSyncChange_userId_id_idx").on(table.userId, table.sequence),
  ],
);

export const mobileIdempotencyTable = pgTable(
  "MobileIdempotencyKey",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("requestHash").notNull(),
    responseStatus: integer("responseStatus"),
    responseBody: jsonb("responseBody"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("MobileIdempotencyKey_userId_scope_key_key").on(table.userId, table.scope, table.key),
    index("MobileIdempotencyKey_expiresAt_idx").on(table.expiresAt),
  ],
);

export const mobileUploadsTable = pgTable(
  "MobileUpload",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    fileName: text("fileName").notNull(),
    contentType: text("contentType").notNull(),
    byteSize: integer("byteSize").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storageKey").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
    content: bytea("content"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("MobileUpload_userId_status_idx").on(table.userId, table.status)],
);

export const mobilePushDevicesTable = pgTable(
  "MobilePushDevice",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").notNull().references(() => mobileDevicesTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    token: text("token").notNull(),
    environment: text("environment").notNull().default("production"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("MobilePushDevice_provider_token_key").on(table.provider, table.token),
    index("MobilePushDevice_userId_idx").on(table.userId),
  ],
);

export const mobileReminderSettingsTable = pgTable("MobileReminderSetting", {
  userId: text("userId").primaryKey(),
  medications: boolean("medications").notNull(),
  tasks: boolean("tasks").notNull(),
  events: boolean("events").notNull(),
  quietHoursStart: text("quietHoursStart"),
  quietHoursEnd: text("quietHoursEnd"),
  timezone: text("timezone").notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const mobileMedicationRemindersTable = pgTable(
  "MobileMedicationReminder",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").notNull().references(() => mobileDevicesTable.id, { onDelete: "cascade" }),
    scheduleId: text("scheduleId").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    revealName: boolean("revealName").notNull().default(false),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("MobileMedicationReminder_deviceId_scheduleId_key").on(table.deviceId, table.scheduleId),
    index("MobileMedicationReminder_userId_idx").on(table.userId),
    index("MobileMedicationReminder_scheduleId_idx").on(table.scheduleId),
  ],
);

export const appleHealthControlsTable = pgTable(
  "AppleHealthControl",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    sampleType: text("sampleType").notNull(),
    enabled: boolean("enabled").notNull(),
    lookbackDays: integer("lookbackDays").notNull().default(30),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("AppleHealthControl_userId_sampleType_key").on(table.userId, table.sampleType)],
);

export const appleHealthImportedCopyControlsTable = pgTable(
  "AppleHealthImportedCopyControl",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    sampleType: text("sampleType").notNull(),
    annotation: text("annotation"),
    excludeFromTrends: boolean("excludeFromTrends").notNull().default(false),
    paused: boolean("paused").notNull().default(false),
    disconnected: boolean("disconnected").notNull().default(false),
    pausedAt: timestamp("pausedAt", { withTimezone: true }),
    disconnectedAt: timestamp("disconnectedAt", { withTimezone: true }),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("AppleHealthImportedCopyControl_userId_sampleType_key").on(table.userId, table.sampleType)],
);

export const appleHealthImportBatchesTable = pgTable(
  "AppleHealthImportBatch",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").notNull().references(() => mobileDevicesTable.id, { onDelete: "restrict" }),
    sampleType: text("sampleType").notNull(),
    previousAnchor: text("previousAnchor"),
    nextAnchor: text("nextAnchor").notNull(),
    requestHash: text("requestHash").notNull(),
    acceptedCount: integer("acceptedCount").notNull(),
    duplicateCount: integer("duplicateCount").notNull(),
    deletionCount: integer("deletionCount").notNull(),
    importedAt: timestamp("importedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("AppleHealthImportBatch_userId_sampleType_importedAt_idx").on(table.userId, table.sampleType, table.importedAt)],
);

export const appleHealthSamplesTable = pgTable(
  "AppleHealthSample",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    batchId: text("batchId").notNull().references(() => appleHealthImportBatchesTable.id, { onDelete: "restrict" }),
    healthKitUuid: text("healthKitUuid").notNull(),
    sampleType: text("sampleType").notNull(),
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    startAt: timestamp("startAt", { withTimezone: true }).notNull(),
    endAt: timestamp("endAt", { withTimezone: true }).notNull(),
    sourceBundleId: text("sourceBundleId").notNull(),
    sourceRevision: text("sourceRevision").notNull(),
    metadata: jsonb("metadata").notNull(),
    payloadHash: text("payloadHash").notNull(),
    importedAt: timestamp("importedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("AppleHealthSample_userId_healthKitUuid_key").on(table.userId, table.healthKitUuid),
    index("AppleHealthSample_userId_sampleType_startAt_idx").on(table.userId, table.sampleType, table.startAt),
  ],
);

export const appleHealthDeletionsTable = pgTable(
  "AppleHealthDeletion",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    batchId: text("batchId").notNull().references(() => appleHealthImportBatchesTable.id, { onDelete: "restrict" }),
    healthKitUuid: text("healthKitUuid").notNull(),
    sampleType: text("sampleType").notNull(),
    healthKitDeletedAt: timestamp("healthKitDeletedAt", { withTimezone: true }).notNull(),
    importedAt: timestamp("importedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("AppleHealthDeletion_userId_healthKitUuid_key").on(table.userId, table.healthKitUuid),
    index("AppleHealthDeletion_batchId_idx").on(table.batchId),
  ],
);

export const appleHealthImportedCopyTombstonesTable = pgTable(
  "AppleHealthImportedCopyTombstone",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    sampleType: text("sampleType").notNull(),
    healthKitUuid: text("healthKitUuid"),
    reason: text("reason"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("AppleHealthImportedCopyTombstone_userId_healthKitUuid_key").on(table.userId, table.healthKitUuid),
    index("AppleHealthImportedCopyTombstone_userId_sampleType_idx").on(table.userId, table.sampleType),
  ],
);

export const appleHealthAnchorsTable = pgTable(
  "AppleHealthAnchor",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").notNull().references(() => mobileDevicesTable.id, { onDelete: "cascade" }),
    sampleType: text("sampleType").notNull(),
    anchor: text("anchor").notNull(),
    batchId: text("batchId").notNull().references(() => appleHealthImportBatchesTable.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("AppleHealthAnchor_deviceId_sampleType_key").on(table.deviceId, table.sampleType)],
);

export const mobileAnomaliesTable = pgTable(
  "MobileAnomaly",
  {
    id: text("id").primaryKey().$defaultFn(runtimeId),
    userId: text("userId").notNull(),
    sampleType: text("sampleType").notNull(),
    observedAt: timestamp("observedAt", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    disclaimer: text("disclaimer").notNull(),
    evidence: jsonb("evidence").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewedAt", { withTimezone: true }),
    reviewNote: text("reviewNote"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("MobileAnomaly_userId_fingerprint_key").on(table.userId, table.fingerprint),
    index("MobileAnomaly_userId_status_createdAt_idx").on(table.userId, table.status, table.createdAt),
  ],
);

// Prisma's BigInt autoincrement id is BIGSERIAL. Expose it as `sequence` to
// preserve the existing append-only audit API without altering SQL names.
export const appleHealthAuditTable = pgTable(
  "AppleHealthAuditRecord",
  {
    sequence: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("userId").notNull(),
    deviceId: text("deviceId").references(() => mobileDevicesTable.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    subjectType: text("subjectType").notNull(),
    subjectId: text("subjectId").notNull(),
    details: jsonb("details").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("AppleHealthAuditRecord_userId_createdAt_idx").on(table.userId, table.createdAt)],
);
