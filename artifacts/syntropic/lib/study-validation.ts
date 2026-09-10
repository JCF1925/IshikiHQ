import { z } from 'zod'

const text = z.string().trim().min(1).max(500)
const optionalText = z.string().trim().max(5000).optional().nullable()
const date = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), 'Invalid date')
export const studyStatusSchema = z.enum(['planned', 'active', 'completed', 'withdrawn', 'failed', 'credited', 'archived'])
export const studyMethodSchema = z.enum(['percentage', 'wam', 'gpa4', 'gpa7', 'pass_fail', 'competency', 'custom'])

export const studyProgramCreateSchema = z.object({
  name: text,
  institution: z.string().trim().max(500).optional().nullable(),
  code: z.string().trim().max(100).optional().nullable(),
  status: studyStatusSchema.default('active'),
  gradingMethod: studyMethodSchema.default('percentage'),
  startDate: date.optional().nullable(),
  expectedEndDate: date.optional().nullable(),
  calendarCategory: z.string().trim().max(80).optional().nullable(),
  syncAssessmentCalendar: z.boolean().default(false),
  syncDeadlineCalendar: z.boolean().default(false),
  notes: optionalText,
}).refine((value) => !value.startDate || !value.expectedEndDate || value.expectedEndDate >= value.startDate, {
  path: ['expectedEndDate'], message: 'Expected end date must not precede start date',
})

export const studyProgramUpdateSchema = z.object({
  name: text.optional(),
  institution: z.string().trim().max(500).optional().nullable(),
  code: z.string().trim().max(100).optional().nullable(),
  status: studyStatusSchema.optional(),
  gradingMethod: studyMethodSchema.optional(),
  startDate: date.optional().nullable(),
  expectedEndDate: date.optional().nullable(),
  calendarCategory: z.string().trim().max(80).optional().nullable(),
  syncAssessmentCalendar: z.boolean().optional(),
  syncDeadlineCalendar: z.boolean().optional(),
  notes: optionalText,
})

export const studyPeriodSchema = z.object({
  programId: z.string().cuid(),
  name: text,
  startDate: date,
  endDate: date,
  censusDate: date.optional().nullable(),
  withdrawalDate: date.optional().nullable(),
}).refine((value) => value.endDate >= value.startDate, { path: ['endDate'], message: 'End date must not precede start date' })

export const studyUnitSchema = z.object({
  programId: z.string().cuid(),
  teachingPeriodId: z.string().cuid().optional().nullable(),
  requirementId: z.string().cuid().optional().nullable(),
  code: z.string().trim().min(1).max(100),
  name: text,
  creditPoints: z.coerce.number().positive().max(10_000).optional().nullable(),
  status: studyStatusSchema.default('planned'),
  gradingMethod: studyMethodSchema.optional().nullable(),
  finalValue: z.coerce.number().finite().optional().nullable(),
  finalOutcome: z.string().trim().max(100).optional().nullable(),
  notes: optionalText,
})

export const studyAssessmentSchema = z.object({
  unitId: z.string().cuid(),
  name: text,
  dueAt: date.optional().nullable(),
  weight: z.coerce.number().positive().max(100).optional().nullable(),
  status: studyStatusSchema.default('planned'),
  resultValue: z.coerce.number().finite().optional().nullable(),
  resultOutcome: z.string().trim().max(100).optional().nullable(),
  notes: optionalText,
  components: z.array(z.object({
    name: text,
    weight: z.coerce.number().positive().max(100).optional().nullable(),
    maximumValue: z.coerce.number().positive().optional().nullable(),
    achievedValue: z.coerce.number().nonnegative().optional().nullable(),
    outcome: z.string().trim().max(100).optional().nullable(),
  })).max(100).default([]),
})

const csvCell = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const studyUnitImportSchema = z.object({
  action: z.enum(['preview', 'commit']),
  programId: z.string().cuid(),
  teachingPeriodId: z.string().cuid().optional().nullable(),
  rows: z.array(z.record(csvCell)).min(1).max(5000),
  mapping: z.object({
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    creditPoints: z.string().trim().min(1).max(100).optional(),
    status: z.string().trim().min(1).max(100).optional(),
  }),
})

export const studyUnitImportUndoSchema = z.object({
  action: z.enum(['undo-preview', 'undo']),
  batchId: z.string().cuid(),
})

export const studyUnitImportRequestSchema = z.union([studyUnitImportSchema, studyUnitImportUndoSchema])

export const suggestionDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']) })
