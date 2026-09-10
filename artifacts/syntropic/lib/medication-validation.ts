import { z } from 'zod'

const text = (max = 5000) => z.string().trim().max(max)
const optionalText = (max = 5000) => text(max).optional().nullable()
const id = z.string().cuid()
const finite = z.coerce.number().finite().min(0).max(1_000_000_000)
const date = z.coerce.date().refine(value => !Number.isNaN(value.getTime()), 'Invalid date')
const blankToNull = (value: unknown) => value === '' ? null : value
const blankToUndefined = (value: unknown) => value === '' ? undefined : value
const optionalId = z.preprocess(blankToNull, id.optional().nullable())
const optionalFinite = z.preprocess(blankToUndefined, finite.optional())
const nullableFinite = z.preprocess(blankToNull, finite.optional().nullable())
const optionalDate = z.preprocess(blankToUndefined, date.optional())
const nullableDate = z.preprocess(blankToNull, date.optional().nullable())

export const medicationCreateSchema = z.object({
  name: text(300).min(1), genericName: optionalText(300), form: text(80).optional(), strength: optionalText(100),
  unit: optionalText(80), parentId: id.optional().nullable(), medType: z.enum(['scheduled', 'prn', 'scheduled_prn', 'adhoc']).optional(),
  isSchedule8: z.boolean().optional(), isOtc: z.boolean().optional(), monthlyLimit: nullableFinite,
  notes: optionalText(), isActive: z.boolean().optional(), initialStock: optionalFinite, reorderThreshold: optionalFinite,
}).strict()
export const medicationUpdateSchema = medicationCreateSchema.omit({ parentId: true, initialStock: true, reorderThreshold: true }).partial().strict()

const scheduleFields = z.object({
  prescriptionId: optionalId, medicationId: optionalId,
  frequency: text(80).min(1).optional(), times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times must use HH:MM')).max(24).optional(),
  doseAmount: z.union([z.string().trim().min(1).max(50), z.number().finite().positive()]).optional(),
  presetSlot: optionalText(80), startDate: optionalDate, endDate: nullableDate,
  withFood: z.boolean().optional(), notes: optionalText(), isActive: z.boolean().optional(), supersede: z.boolean().optional(),
}).strict()
export const scheduleCreateSchema = scheduleFields.superRefine((value, ctx) => {
  if (!value.prescriptionId && !value.medicationId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['medicationId'], message: 'A prescriptionId or medicationId is required' })
  if (value.endDate && value.startDate && value.endDate < value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' })
})
export const scheduleUpdateSchema = scheduleFields.omit({ prescriptionId: true, medicationId: true, supersede: true }).partial()

const prescriptionFields = z.object({
  medicationId: id, prescriberId: optionalId, datePrescribed: optionalDate,
  quantity: z.preprocess(blankToNull, z.coerce.number().int().positive().max(1_000_000).optional().nullable()),
  repeats: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(1000).optional()),
  repeatsUsed: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(1000).optional()),
  pbsItemCode: optionalText(100), cost: optionalFinite, expiryDate: nullableDate, escriptToken: optionalText(2000), notes: optionalText(),
}).strict()
// repeats counts refills after the initial fill, so a prescription permits
// repeats + 1 total dispenses.
export const prescriptionCreateSchema = prescriptionFields.refine(value => value.repeatsUsed == null || value.repeats == null || value.repeatsUsed <= value.repeats + 1, { path: ['repeatsUsed'], message: 'Fills used cannot exceed initial fill plus repeats' })
export const prescriptionUpdateSchema = prescriptionFields.omit({ medicationId: true }).partial().extend({ action: z.literal('dispense').optional() }).strict()

export const medicationLogSchema = z.object({
  scheduleId: id, takenAt: optionalDate, doseTaken: z.union([z.string().trim().min(1).max(50), z.number().finite().positive()]).transform(String).optional().nullable(),
  skipped: z.boolean().optional(), skipReason: optionalText(), symptomNote: optionalText(),
}).strict()
export const stockUpdateSchema = z.object({ id, currentQuantity: optionalFinite, reorderThreshold: optionalFinite, monthlyLimit: nullableFinite }).strict().refine(v => v.currentQuantity != null || v.reorderThreshold != null || v.monthlyLimit !== undefined, 'Provide at least one stock field')
export const stockReconciliationSchema = z.object({
  action: z.literal('reconcile'),
  id,
  expectedCurrentQuantity: finite,
  expectedLedgerQuantity: finite,
}).strict()
export const stockTransactionSchema = z.object({
  medicationId: id, type: z.enum(['dispense', 'consume', 'adjustment', 'stocktake', 'dispose']),
  quantityChange: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
  countedQuantity: optionalFinite, notes: optionalText(), date: optionalDate,
}).strict().superRefine((v, ctx) => {
  if (v.type === 'stocktake' && v.countedQuantity == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['countedQuantity'], message: 'countedQuantity is required for a stocktake' })
  if (v.type !== 'stocktake' && v.quantityChange == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantityChange'], message: 'quantityChange is required' })
})

export const pharmacySchema = z.object({
  name: text(200).min(1), address: optionalText(500), phone: optionalText(80), notes: optionalText(),
}).strict()
export const pharmacyPreferenceSchema = z.object({ medicationId: id, pharmacyId: id }).strict()
export const orderLineSchema = z.object({
  medicationId: id, prescriptionId: optionalId, quantity: finite.min(0.000001), status: z.enum(['ordered', 'received', 'substituted', 'cancelled']).optional(),
  substitutionNote: optionalText(500),
}).strict()
export const pharmacyOrderSchema = z.object({
  pharmacyId: id, periodStart: date, periodEnd: date, notes: optionalText(), lines: z.array(orderLineSchema).max(100),
}).strict().refine(v => v.periodEnd >= v.periodStart, { path: ['periodEnd'], message: 'Period must end after it starts' })
export const pharmacyOrderActionSchema = z.object({
  action: z.enum(['confirm', 'place', 'cancel', 'receive', 'update']),
  lines: z.array(orderLineSchema).max(100).optional(),
  notes: optionalText(),
}).strict()
export const pharmacyRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pharmacy'), name: text(200).min(1), address: optionalText(500), phone: optionalText(80), notes: optionalText() }).strict(),
  z.object({ type: z.literal('preference'), medicationId: id, pharmacyId: id }).strict(),
  z.object({ type: z.literal('order'), pharmacyId: id, periodStart: date, periodEnd: date, notes: optionalText(), lines: z.array(orderLineSchema).max(100) }).strict(),
])

export function validationError(error: z.ZodError) {
  return { error: 'Invalid request', details: error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message })) }
}

export function withoutPrescriptionToken<T extends { escriptToken?: string | null }>(value: T) {
  const { escriptToken, ...safe } = value
  return { ...safe, escriptTokenPresent: Boolean(escriptToken) }
}