import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

const nullableText = z.string().trim().max(5000).nullable().optional()
const finiteNullable = z.number().finite().nullable().optional()
const boxSchema = z.object({ page: z.number().int().min(1), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable().optional()

export const extractedResultSchema = z.object({
  id: z.string().min(1).max(100),
  analyte: z.string().trim().max(300),
  resultType: z.enum(['quantitative', 'qualitative']).default('quantitative'),
  value: finiteNullable,
  valueText: nullableText,
  unit: nullableText,
  refLow: finiteNullable,
  refHigh: finiteNullable,
  flag: z.enum(['normal', 'high', 'low', 'abnormal']).nullable().optional(),
  collectedAt: z.string().datetime().nullable().optional(),
  comment: nullableText,
  confidence: z.number().min(0).max(1),
  unresolved: z.array(z.enum(['analyte', 'value', 'unit', 'range', 'time', 'comment'])).max(6).default([]),
  sourceBox: boxSchema,
})

export const pathologyDraftSchema = z.object({
  report: z.object({
    title: z.string().trim().min(1).max(300),
    provider: nullableText,
    collectedAt: z.string().datetime().nullable().optional(),
    reportedAt: z.string().datetime().nullable().optional(),
    comments: nullableText,
  }),
  panels: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    discipline: z.enum(['haematology', 'biochemistry', 'endocrine', 'immunology', 'microbiology', 'imaging', 'other']),
    comments: nullableText,
    sourceBox: boxSchema,
    results: z.array(extractedResultSchema).max(500),
  })).min(1).max(50),
}).strict()

export const reportUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  byteSize: z.number().int().positive().max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upload_complete') }),
  z.object({ action: z.literal('save'), draft: pathologyDraftSchema }),
  z.object({ action: z.literal('confirm'), draft: pathologyDraftSchema }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('request_deletion') }),
])

export const exportRequestSchema = z.object({
  format: z.enum(['json', 'pdf']),
  panelIds: z.array(z.string().min(1).max(100)).min(1).max(50),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
})

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
export const newExportToken = () => randomBytes(32).toString('hex')

export function selectExport(draft: z.infer<typeof pathologyDraftSchema>, panelIds: string[]) {
  const selected = new Set(panelIds)
  return { report: draft.report, panels: draft.panels.filter((panel) => selected.has(panel.id)) }
}

export function reviewPriority(result: z.infer<typeof extractedResultSchema>) {
  return (result.unresolved ?? []).length ? 0 : result.confidence < 0.8 ? 1 : 2
}

export function confirmationIssues(draft: z.infer<typeof pathologyDraftSchema>) {
  return draft.panels.flatMap((panel) => {
    if (!panel.results.length) return [{ panelId: panel.id, resultId: '', fields: ['value'] }]
    return panel.results.flatMap((result) => {
    const fields = [...(result.unresolved ?? [])]
    if (!result.analyte.trim() && !fields.includes('analyte')) fields.push('analyte')
    if (result.resultType === 'quantitative' && result.value == null && !fields.includes('value')) fields.push('value')
    if (result.resultType === 'qualitative' && !result.valueText?.trim() && !fields.includes('value')) fields.push('value')
      return fields.length ? [{ panelId: panel.id, resultId: result.id, fields }] : []
    })
  })
}

export function exportPreviewHash(format: 'json' | 'pdf', selection: unknown) {
  return sha256(canonicalJson({ format, selection }))
}