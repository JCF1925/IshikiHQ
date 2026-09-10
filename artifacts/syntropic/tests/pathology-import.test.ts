import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  confirmationIssues,
  exportPreviewHash,
  pathologyDraftSchema,
  reportUploadSchema,
  reviewPriority,
  selectExport,
} from '../lib/pathology.ts'

const result = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1', analyte: 'Haemoglobin', resultType: 'quantitative', value: 145, valueText: null,
  unit: 'g/L', refLow: 130, refHigh: 180, flag: 'normal', collectedAt: null, comment: null,
  confidence: 0.96, unresolved: [], sourceBox: { page: 1, x: 10, y: 20, width: 30, height: 8 },
  ...overrides,
})
const draft = pathologyDraftSchema.parse({
  report: { title: 'Full blood count', provider: 'Example Lab', collectedAt: '2026-09-01T09:00:00.000Z', reportedAt: null, comments: null },
  panels: [
    { id: 'p1', name: 'FBC', discipline: 'haematology', comments: null, sourceBox: null, results: [result()] },
    { id: 'p2', name: 'Iron', discipline: 'biochemistry', comments: null, sourceBox: null, results: [result({ id: 'r2', analyte: 'Ferritin' })] },
  ],
})

describe('pathology review import safety', () => {
  it('accepts only bounded private report formats and strong duplicate hashes', () => {
    assert.equal(reportUploadSchema.safeParse({ fileName: 'report.pdf', contentType: 'application/pdf', byteSize: 100, sha256: 'a'.repeat(64) }).success, true)
    assert.equal(reportUploadSchema.safeParse({ fileName: 'report.svg', contentType: 'image/svg+xml', byteSize: 100, sha256: 'a'.repeat(64) }).success, false)
    assert.equal(reportUploadSchema.safeParse({ fileName: 'big.pdf', contentType: 'application/pdf', byteSize: 30e6, sha256: 'a'.repeat(64) }).success, false)
  })

  it('prioritises unresolved and low-confidence values', () => {
    assert.equal(reviewPriority(result({ unresolved: ['unit'] }) as never), 0)
    assert.equal(reviewPriority(result({ confidence: 0.6 }) as never), 1)
    assert.equal(reviewPriority(result() as never), 2)
  })

  it('blocks confirmation when values or explicit fields remain unresolved', () => {
    assert.deepEqual(confirmationIssues(draft), [])
    const missingUnit = structuredClone(draft)
    missingUnit.panels[0].results[0].unresolved = ['unit']
    assert.deepEqual(confirmationIssues(missingUnit)[0].fields, ['unit'])
    const missingValue = structuredClone(draft)
    missingValue.panels[0].results[0].value = null
    assert.deepEqual(confirmationIssues(missingValue)[0].fields, ['value'])
    const emptyPanel = structuredClone(draft)
    emptyPanel.panels[0].results = []
    assert.deepEqual(confirmationIssues(emptyPanel)[0].fields, ['value'])
  })

  it('exports only selected panels and binds consent to the exact preview', () => {
    const selected = selectExport(draft, ['p2'])
    assert.deepEqual(selected.panels.map((panel) => panel.id), ['p2'])
    const initial = exportPreviewHash('json', selected)
    selected.panels[0].results[0].value = 999
    assert.notEqual(exportPreviewHash('json', selected), initial)
    assert.notEqual(exportPreviewHash('pdf', selected), exportPreviewHash('json', selected))
  })

  it('keeps routes ownership-scoped and one-time exports non-reusable', async () => {
    const reportRoute = await readFile(new URL('../app/api/pathology-reports/[id]/route.ts', import.meta.url), 'utf8')
    const downloadRoute = await readFile(new URL('../app/api/pathology-reports/[id]/download/route.ts', import.meta.url), 'utf8')
    const exportRoute = await readFile(new URL('../app/api/pathology-exports/[token]/route.ts', import.meta.url), 'utf8')
    assert.match(reportRoute, /where: \{ id, userId/)
    assert.match(downloadRoute, /id, userId:/)
    assert.match(exportRoute, /tokenHash: sha256\(token\), userId/)
    assert.match(reportRoute, /status: 'extracting'/)
    assert.match(reportRoute, /sourceReportId: id/)
    assert.match(reportRoute, /deleteFile\(current\.cloudStoragePath\)/)
    assert.match(reportRoute, /pathologyExport\.updateMany/)
    assert.match(exportRoute, /pathologyExport\.updateMany/)
    assert.match(exportRoute, /claim\.count !== 1/)
    assert.match(exportRoute, /report: \{ retentionState: 'retained', status: 'confirmed' \}/)
  })
})