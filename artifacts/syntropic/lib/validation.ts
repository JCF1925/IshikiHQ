import { z } from 'zod'
import { accountTypeSchema, currencySchema, transactionStatusSchema } from '@/lib/domain'

const optionalText = z.string().trim().max(5000).optional().nullable()
const finiteAmount = z.coerce.number().finite().refine((value) => Math.abs(value) <= 1_000_000_000, 'Amount is out of range')
const dateValue = z.coerce.date().refine((date) => !Number.isNaN(date.getTime()), 'Invalid date')
const blankToUndefined = (value: unknown) => value === '' || value == null ? undefined : value
const optionalPriceNumber = z.preprocess(blankToUndefined, z.coerce.number().finite().min(0).optional())
const optionalPriceText = z.preprocess(blankToUndefined, z.string().trim().max(5000).optional())
export const priceWatchCreateSchema = z.object({
  productName: z.string().trim().min(1).max(300),
  packQuantity: z.coerce.number().finite().positive().max(1_000_000),
  packUnit: z.enum(['count', 'g', 'kg', 'mL', 'L']),
  preferredRetailers: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  targetPrice: optionalPriceNumber,
  checkCadence: optionalPriceText,
  status: z.enum(['active', 'paused']).default('active'),
}).strict()
export const priceWatchUpdateSchema = priceWatchCreateSchema.partial().strict()
export const priceObservationCreateSchema = z.object({
  price: z.coerce.number().finite().nonnegative().max(1_000_000_000),
  packQuantity: z.coerce.number().finite().positive().max(1_000_000),
  packUnit: z.enum(['count', 'g', 'kg', 'mL', 'L']),
  shippingCost: z.preprocess((value) => value === '' || value == null ? 0 : value, z.coerce.number().finite().min(0).max(1_000_000).default(0)),
  membershipAssumption: optionalPriceText,
  sourceUrl: z.preprocess(blankToUndefined, z.string().url().max(2000).optional()),
  observedAt: dateValue,
  notes: optionalPriceText,
}).strict()
export const priceObservationUpdateSchema = priceObservationCreateSchema.partial().strict()

export const signupSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(100).optional(),
})
export const loginSchema = signupSchema.pick({ email: true, password: true })

export const presignedUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255).refine(
    (value) => !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..',
    'File name must be a plain file name',
  ),
  contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  byteSize: z.number().int().positive().max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  // Public uploads are deliberately not supported by this user-facing endpoint.
  isPublic: z.literal(false).default(false),
}).strict()

export const receiptAttachSchema = z.object({
  uploadId: z.string().trim().min(1).max(100),
}).strict()

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: accountTypeSchema.default('transaction'),
  bsb: z.string().trim().max(20).optional().nullable(),
  accountNumber: z.string().trim().max(34).optional().nullable(),
  openingBalance: finiteAmount.optional(),
  balance: finiteAmount.optional(),
  institution: z.string().trim().max(120).optional().nullable(),
  notes: optionalText,
})
export const accountUpdateSchema = accountCreateSchema.partial().omit({ balance: true }).extend({
  isActive: z.boolean().optional(),
})

export const transactionCreateSchema = z.object({
  date: dateValue,
  amount: finiteAmount,
  currency: currencySchema.default('AUD'),
  merchant: z.string().trim().max(500).optional().nullable(),
  description: optionalText,
  category: z.string().trim().max(120).optional().nullable(),
  subcategory: z.string().trim().max(120).optional().nullable(),
  accountId: z.string().cuid().optional().nullable(),
  isDeductible: z.boolean().optional(),
  taxCategory: z.string().trim().max(120).optional().nullable(),
  isTransfer: z.boolean().optional(),
  isDishonoured: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  notes: optionalText,
  receiptPath: z.string().trim().max(1024).optional().nullable(),
  receiptIsPublic: z.boolean().optional(),
})
export const transactionUpdateSchema = transactionCreateSchema.partial().extend({
  action: z.enum(['confirm', 'unlock', 'relock']).optional(),
  status: transactionStatusSchema.optional(),
})

const csvCell = z.union([z.string(), z.number(), z.boolean(), z.null()]).transform((value) => value == null ? '' : String(value))
export const csvImportSchema = z.object({
  rows: z.array(z.record(csvCell)).min(1).max(5_000),
  columnMap: z.object({
    date: z.string().trim().min(1).max(100).optional(),
    amount: z.string().trim().min(1).max(100).optional(),
    merchant: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(100).optional(),
  }).default({}),
  fileName: z.string().trim().min(1).max(255).default('import.csv'),
  accountId: z.string().cuid().optional().nullable(),
})

export const deleteAccountSchema = z.object({ confirmation: z.literal('DELETE MY ACCOUNT') }).strict()

const privateUploadTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
] as const
const eventDate = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), 'Invalid event date')
const eventFieldsSchema = z.object({
  title: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(80).default('personal'),
  startDatetime: eventDate,
  endDatetime: eventDate.optional().nullable(),
  location: z.string().trim().max(1000).optional().nullable(),
  isOnline: z.boolean().optional(),
  allDay: z.boolean().optional(),
  recurrenceRule: z.string().trim().max(4000).optional().nullable(),
  notes: optionalText,
  peopleRefs: z.array(z.string().cuid()).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  onlineUrl: z.string().url().max(2000).optional().nullable(),
  travelMinutesBefore: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  linkedCostSourceType: z.string().trim().max(80).optional().nullable(),
  linkedCostSourceId: z.string().cuid().optional().nullable(),
  linkedCostAmount: finiteAmount.optional().nullable(),
  costOverrideAmount: finiteAmount.optional().nullable(),
})
export const eventCreateSchema = eventFieldsSchema.superRefine((value, ctx) => {
  if (value.endDatetime && value.endDatetime < value.startDatetime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDatetime'], message: 'End must be after start' })
})
// Refinements make a ZodEffects which cannot be partialed.  Updates validate
// supplied fields; the route validates the resulting persisted event range.
export const eventUpdateSchema = eventFieldsSchema.partial()

export const developmentFeedbackSchema = z.object({
  summary: z.string().trim().min(5).max(200),
  details: z.string().trim().min(10).max(3000),
  category: z.enum(['improvement', 'bug', 'accessibility', 'content', 'performance']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  page: z.string().trim().min(1).max(500),
  expectedOutcome: z.string().trim().max(1000).optional().default(''),
})

const cuidOrNull = z.string().cuid().optional().nullable()

const incomeTypeSchema = z.enum(['salary', 'freelance', 'centrelink', 'investment', 'other'])
const incomeFrequencySchema = z.enum(['hourly', 'weekly', 'fortnightly', 'monthly', 'annually'])
const incomePreprocess = <T>(transform: (value: unknown) => unknown, schema: z.ZodType<T, z.ZodTypeDef, any>) => z.preprocess(transform, schema) as z.ZodType<T>
const optionalIncomeNumber = (schema: z.ZodType<number>) => incomePreprocess<number | null | undefined>(
  (value) => value === '' || value == null ? undefined : value,
  schema.optional().nullable(),
)
const incomeRelationId = incomePreprocess<string | null | undefined>(
  (value) => value === '' ? null : value,
  z.string().cuid().nullable().optional(),
)
const incomeFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: incomeTypeSchema,
  employerId: incomeRelationId,
  amount: incomePreprocess<number>(
    (value) => value === '' || value == null ? undefined : value,
    z.coerce.number().finite().positive('Amount must be greater than zero').max(1_000_000_000, 'Amount is out of range'),
  ),
  frequency: incomeFrequencySchema,
  hoursPerWeek: optionalIncomeNumber(z.coerce.number().finite().positive('Hours per week must be greater than zero').max(168, 'Hours per week cannot exceed 168')),
  isGross: z.boolean(),
  incSuper: z.boolean(),
  superRate: incomePreprocess<number>(
    (value) => value === '' || value == null ? undefined : value,
    z.coerce.number().finite().min(0, 'Super rate cannot be negative').max(100, 'Super rate cannot exceed 100%').default(12),
  ),
  payAccountId: incomeRelationId,
  startDate: dateValue,
  endDate: incomePreprocess<Date | null | undefined>(
    (value) => value === '' ? null : value,
    dateValue.optional().nullable(),
  ),
  isActive: z.boolean(),
  notes: optionalText,
  annualPackageAmount: optionalIncomeNumber(z.coerce.number().finite().nonnegative().max(1_000_000_000)),
  payFrequency: z.enum(['fortnightly', 'monthly']).optional().nullable(),
  firstPayDate: incomePreprocess<Date | null | undefined>((value) => value === '' ? null : value, dateValue.optional().nullable()),
  payEndDate: incomePreprocess<Date | null | undefined>((value) => value === '' ? null : value, dateValue.optional().nullable()),
  retainPayHistory: z.boolean().optional(),
}).strict()

export const incomeSourceCreateSchema = incomeFieldsSchema.superRefine((value, ctx) => {
  if (value.frequency === 'hourly' && value.hoursPerWeek == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hoursPerWeek'], message: 'Hours per week is required for hourly income' })
  }
  if (value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' })
  }
})

export const incomeSourceUpdateSchema = incomeFieldsSchema.partial().strict()

export const payCycleSchema = z.object({
  annualPackageAmount: z.coerce.number().finite().nonnegative().max(1_000_000_000),
  frequency: z.enum(['fortnightly', 'monthly']),
  firstPayDate: dateValue,
  endDate: dateValue.optional().nullable(),
  retainHistory: z.boolean().default(true),
}).strict().refine((v) => !v.endDate || v.endDate >= v.firstPayDate, { path: ['endDate'], message: 'End date must be on or after first pay date' })
export const salaryIncreaseCreateSchema = z.object({
  incomeSourceId: z.string().cuid(),
  effectiveDate: dateValue,
  changeType: z.enum(['amount', 'percent', 'sg_rate']),
  value: finiteAmount,
  newSuperRate: z.coerce.number().finite().min(0).max(100).optional().nullable(),
  notes: optionalText,
}).superRefine((value, ctx) => {
  if (value.changeType === 'sg_rate' && value.newSuperRate == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['newSuperRate'], message: 'New super rate is required' })
  }
})
export const workProposalDecisionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  decisionNotes: optionalText,
})
const employmentRoleFieldsSchema = z.object({
  organisationId: z.string().cuid(),
  incomeSourceId: cuidOrNull,
  title: z.string().trim().min(1).max(200),
  employmentType: z.enum(['employee', 'contractor', 'casual', 'volunteer', 'other']).default('employee'),
  startDate: dateValue,
  endDate: dateValue.optional().nullable(),
  notes: optionalText,
})
export const employmentRoleSchema = employmentRoleFieldsSchema.refine((value) => !value.endDate || value.endDate >= value.startDate, {
  path: ['endDate'], message: 'End date must be on or after start date',
})
export const employmentRoleUpdateSchema = employmentRoleFieldsSchema.partial()
export const compensationSchema = z.object({
  effectiveFrom: dateValue,
  effectiveTo: dateValue.optional().nullable(),
  amount: finiteAmount.refine((value) => value >= 0, 'Amount cannot be negative'),
  frequency: z.enum(['hourly', 'weekly', 'fortnightly', 'monthly', 'annually']).default('annually'),
  hoursPerWeek: z.coerce.number().finite().positive().max(168).optional().nullable(),
  currency: z.string().trim().length(3).default('AUD'),
  superRate: z.coerce.number().finite().min(0).max(100).optional().nullable(),
  notes: optionalText,
}).superRefine((value, ctx) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'Effective end must follow start' })
  if (value.frequency === 'hourly' && value.hoursPerWeek == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hoursPerWeek'], message: 'Hours per week is required for hourly compensation' })
})
export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  status: z.enum(['active', 'completed', 'archived']).default('active'),
  goalId: cuidOrNull,
  organisationId: cuidOrNull,
  eventIds: z.array(z.string().cuid()).max(100).optional(),
  taskIds: z.array(z.string().cuid()).max(100).optional(),
}).strict()
export const projectUpdateSchema = projectCreateSchema.partial()

const optionalGoalNumber = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).optional().nullable(),
)
const optionalGoalDate = z.preprocess(
  (value) => value === '' ? null : value,
  dateValue.optional().nullable(),
)
export const goalMilestoneSchema = z.object({
  id: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(500),
  targetValue: optionalGoalNumber,
  currentValue: optionalGoalNumber,
  unit: z.string().trim().max(80).optional().nullable(),
  done: z.boolean().default(false),
  dueDate: optionalGoalDate,
  completedAt: optionalGoalDate,
}).strict().transform((milestone) => ({
  ...milestone,
  completedAt: milestone.done ? (milestone.completedAt ?? new Date()) : null,
}))

const goalFieldsSchema = z.object({
  title: z.string().trim().min(1).max(300),
  category: z.enum(['personal', 'health', 'financial', 'career', 'study']).default('personal'),
  targetValue: optionalGoalNumber,
  currentValue: optionalGoalNumber,
  unit: z.string().trim().max(80).optional().nullable(),
  targetDate: optionalGoalDate,
  status: z.enum(['active', 'completed', 'paused', 'abandoned']).default('active'),
  milestones: z.array(goalMilestoneSchema).max(100).default([]),
  notes: optionalText,
  progressDate: optionalGoalDate,
}).strict()
export const goalCreateSchema = goalFieldsSchema
export const goalUpdateSchema = goalFieldsSchema.partial().strict()

const goalProgressValue = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
)
export const goalProgressEntryUpdateSchema = z.object({
  value: goalProgressValue,
  recordedAt: dateValue.optional(),
  confirmed: z.literal(true),
}).strict().refine(
  (value) => value.value !== undefined || value.recordedAt !== undefined,
  { message: 'A progress value or date is required' },
)
export const goalProgressEntryDeleteSchema = z.object({
  confirmed: z.literal(true),
}).strict()

export type GoalMilestoneInput = {
  id: string
  text: string
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  done: boolean
  dueDate?: Date | null
  completedAt?: Date | null
}
export type GoalCreateInput = {
  title: string
  category: 'personal' | 'health' | 'financial' | 'career' | 'study'
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  targetDate?: Date | null
  status: 'active' | 'completed' | 'paused' | 'abandoned'
  milestones?: GoalMilestoneInput[]
  notes?: string | null
  progressDate?: Date | null
}
export type GoalUpdateInput = Partial<GoalCreateInput>

export const privateUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255)
    .refine((name) => !/[\u0000-\u001f\u007f/\\]/.test(name) && name !== '.' && name !== '..', 'Unsafe file name'),
  contentType: z.enum(privateUploadTypes),
  byteSize: z.number().int().positive().max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'SHA-256 must be lowercase hexadecimal'),
}).strict().superRefine((value, ctx) => {
  const extension = value.fileName.includes('.') ? value.fileName.split('.').pop()!.toLowerCase() : ''
  if (!(uploadExtensions[value.contentType] as readonly string[]).includes(extension)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fileName'], message: 'File extension does not match content type' })
  }
})

const uploadExtensions: Record<(typeof privateUploadTypes)[number], readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'text/csv': ['csv'],
  'text/plain': ['txt'],
}

export const payPeriodConfirmationSchema = z.object({
  confirmedGross: z.coerce.number().finite().nonnegative().max(1_000_000_000),
  reimbursementAmount: z.coerce.number().finite().nonnegative().max(1_000_000_000).default(0),
  transactionIds: z.array(z.string().cuid()).max(100).default([]),
  work: z.object({
    evidenceType: z.enum(['regular_pattern', 'casual_roster']),
    hours: z.coerce.number().finite().nonnegative().max(744).default(0),
    leaveHours: z.coerce.number().finite().nonnegative().max(744).default(0),
    leaveType: z.string().trim().max(80).optional().nullable(),
    location: z.enum(['workplace', 'home', 'mixed']).optional().nullable(),
    notes: optionalText,
  }).optional(),
}).strict()
