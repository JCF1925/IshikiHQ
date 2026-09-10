import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export const RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60

export function hasRecentAuthentication(authTime: unknown, nowSeconds = Math.floor(Date.now() / 1000)) {
  return typeof authTime === 'number'
    && Number.isInteger(authTime)
    && authTime <= nowSeconds + 30
    && nowSeconds - authTime <= RECENT_AUTH_MAX_AGE_SECONDS
}

/**
 * Health-claim reports must scope records to the requesting owner and to live
 * imports. Detached imports intentionally retain only redacted lifecycle
 * metadata for auditability, so a report must never query that tombstone
 * surface directly.
 */
export type HealthClaimReportScope = {
  owner: { userId: string }
  liveImport: Prisma.HealthClaimImportWhereInput
}

export function healthClaimReportScope(userId: string): HealthClaimReportScope {
  const owner = { userId }
  return {
    owner,
    liveImport: { ...owner, deletedAt: null },
  }
}

export function healthClaimOwnerWhere(userId: string) {
  return healthClaimReportScope(userId).owner
}

export function healthClaimReportWhere(userId: string) {
  return healthClaimReportScope(userId).liveImport
}

export function accountFingerprint(userId: string) {
  const pepper = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET
  if (!pepper) throw new Error('Server authentication secret is required for account auditing')
  return createHash('sha256').update(`${pepper}\0${userId}`).digest('hex')
}

// Account exports are allowlisted so adding a new user-owned Prisma model does
// not silently make it portable. Credential, session, provider connection,
// push, settings, bearer-token, and sync-cursor models are intentionally absent.
const portableModels = new Set([
  'GenericUpload',
  'MobileRecord',
  'MobileSyncChange',
  'MobileUpload',
  'MobileReminderSetting',
  'AppleHealthControl',
  'AppleHealthImportedCopyControl',
  'AppleHealthImportBatch',
  'AppleHealthSample',
  'AppleHealthDeletion',
  'AppleHealthImportedCopyTombstone',
  'MobileAnomaly',
  'AppleHealthAuditRecord',
  'Medication',
  'Prescription',
  'DosageSchedule',
  'MedicationLog',
  'StockLevel',
  'FinAccount',
  'Transaction',
  'AutomationSetting',
  'CategorySuggestion',
  'CategoryCorrection',
  'RedbarkGateAttestation',
  'ForwardedMessageCandidate',
  'FinancialAggregateSnapshot',
  'TransactionAuditRecord',
  'CsvImport',
  'Task',
  'Project',
  'Event',
  'CalendarInviteRule',
  'CalendarAuditRecord',
  'EventMedicalForwardingConsent',
  'Person',
  'Organisation',
  'HealthCondition',
  'Symptom',
  'SymptomLog',
  'Flare',
  'VitalType',
  'VitalLog',
  'Goal',
  'Budget',
  'IncomeSource',
  'SalaryIncrease',
  'EmploymentRole',
  'EmploymentCompensation',
  'SalaryPackaging',
  'WfhDiaryEntry',
  'CapitalGainEvent',
  'HELPDebt',
  'Category',
  'RecurringTransaction',
  'BnplPlan',
  'Asset',
  'Liability',
  'FinancialPlan',
  'PlanEvent',
  'Referral',
  'Appointment',
  'LabPanel',
  'PathologyReport',
  'PathologyAuditEvent',
  'LabResult',
  'MedicareClaim',
  'PhiPolicy',
  'PhiTransaction',
  'PhiLimit',
  'NutritionLog',
  'MoodLog',
  'StockTransaction',
  'WfhPattern',
  'LeaveEntry',
  'PublicHoliday',
  'HouseholdMembership',
  'DebtAgreement',
  'DebtMovement',
  'DebtMovementAllocation',
  'StudyProgram',
  'StudyGradingScale',
  'StudyTaskSuggestion',
])

const secretFields = new Set([
  'passwordHash',
  'refresh_token',
  'access_token',
  'id_token',
  'sessionToken',
  'tokenHash',
  'token',
  'credentialReference',
  'content',
  'storageKey',
  'cloudStoragePath',
  'receiptPath',
  'previousAnchor',
  'nextAnchor',
  'anchor',
  'requestHash',
])

const secretFieldPattern = /(password|secret|credential|session|refresh.?token|access.?token|id.?token|push.?token|storage.?key|cloud.?storage.?path)/i

function portableRecord(model: Prisma.DMMF.Model, record: Record<string, unknown>) {
  return Object.fromEntries(model.fields
    .filter((field) => (
      field.kind === 'scalar'
      && !secretFields.has(field.name)
      && !secretFieldPattern.test(field.name)
    ))
    .map((field) => {
      const value = record[field.name]
      if (typeof value === 'bigint') return [field.name, value.toString()]
      if (value instanceof Uint8Array) return [field.name, '[binary omitted]']
      return [field.name, value]
    }))
}

/**
 * Export every Prisma model directly owned by the user. Auth/session material and raw
 * binary payloads are deliberately excluded. The manifest makes exclusions auditable.
 */
type ExportDatabase = {
  user: { findUnique(args: unknown): Promise<Record<string, unknown> | null> }
  [delegate: string]: unknown
}

export async function collectPortableAccountData(
  userId: string,
  database: ExportDatabase = prisma as unknown as ExportDatabase,
) {
  const collections: Record<string, unknown[]> = {}
  const included: string[] = []
  const excluded: string[] = []

  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.name === 'User' || !model.fields.some((field) => field.kind === 'scalar' && field.name === 'userId')) continue
    if (!portableModels.has(model.name)) {
      excluded.push(model.name)
      continue
    }
    const delegateName = `${model.name[0].toLowerCase()}${model.name.slice(1)}`
    const delegate = database[delegateName] as { findMany(args: unknown): Promise<Record<string, unknown>[]> } | undefined
    if (!delegate?.findMany) continue
    const records = await delegate.findMany({ where: { userId } })
    collections[model.name] = records.map((record) => portableRecord(model, record))
    included.push(model.name)
  }

  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, emailVerified: true, image: true,
      timezone: true, currency: true, theme: true, createdAt: true, updatedAt: true,
    },
  })
  return {
    user,
    collections,
    manifest: {
      includedModels: included.sort(),
      excludedModels: excluded.sort(),
      exclusions: 'Only explicitly allowlisted portable models are included. Settings, authentication credentials, sessions, provider connections and credentials, bearer tokens, sync cursors, push tokens, storage paths, and raw binary payloads are excluded.',
      scope: 'User profile and all records with direct user ownership; shared household records remain governed by household membership.',
    },
  }
}
