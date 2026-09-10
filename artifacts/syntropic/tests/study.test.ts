import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { calculateStudyResult, evaluateEffectiveGradingScale, previewUnitImport, studySuggestionKey } from '../lib/study-calculations.ts'
import { parseStudyCsv } from '../lib/study-csv.ts'

describe('study result calculations', () => {
  it('calculates percentage and WAM transparently with contribution formulas', () => {
    const percentage = calculateStudyResult('percentage', [
      { label: 'Essay', value: 80, weight: 40, metric: 'percentage' },
      { label: 'Exam', value: 70, weight: 60, metric: 'percentage' },
    ])
    assert.equal(percentage.value, 74)
    assert.match(percentage.formula, /80 × 40/)
    assert.deepEqual(percentage.warnings, [])

    const wam = calculateStudyResult('wam', [
      { label: 'Small unit', value: 90, weight: 6, metric: 'wam' },
      { label: 'Large unit', value: 60, weight: 12, metric: 'wam' },
    ])
    assert.equal(wam.value, 70)
  })

  it('supports native GPA scales and refuses implicit conversion', () => {
    assert.equal(calculateStudyResult('gpa4', [
      { label: 'A', value: 4, weight: 3, metric: 'gpa4' },
      { label: 'B', value: 3, weight: 1, metric: 'gpa4' },
    ]).value, 3.75)
    assert.equal(calculateStudyResult('gpa7', [{ label: 'HD', value: 7, metric: 'gpa7' }]).value, 7)
    assert.throws(() => calculateStudyResult('gpa4', [{ label: 'Raw mark', value: 80, metric: 'percentage' }]), /Implicit conversion/)
  })

  it('supports pass/fail, competency and custom scales without inventing mappings', () => {
    assert.equal(calculateStudyResult('pass_fail', [
      { label: 'Theory', outcome: 'pass', metric: 'pass_fail' },
      { label: 'Placement', outcome: 'fail', metric: 'pass_fail' },
    ]).outcome, 'fail')
    assert.equal(calculateStudyResult('competency', [{ label: 'Practical', outcome: 'competent', metric: 'competency' }]).outcome, 'competent')
    assert.equal(calculateStudyResult('custom', [
      { label: 'One', value: 8, metric: 'custom', scaleId: 'scale-a' },
      { label: 'Two', value: 6, metric: 'custom', scaleId: 'scale-a' },
    ]).value, 7)
    assert.throws(() => calculateStudyResult('custom', [{ label: 'Unknown', value: 8, metric: 'custom' }]), /scaleId/)
  })
})

describe('study imports and suggestions', () => {
  it('parses quoted CSV safely and rejects malformed input before preview', () => {
    const parsed = parseStudyCsv('code,name\nBIO101,\"Biology, Advanced\"\n')
    assert.deepEqual(parsed.rows, [{ code: 'BIO101', name: 'Biology, Advanced' }])
    assert.match(parseStudyCsv('code,name\nBIO101,\"Biology').error ?? '', /not closed/)
    assert.match(parseStudyCsv('code,code\nBIO101,Biology').error ?? '', /unique/)
    assert.match(parseStudyCsv('code,name\nBIO101,Biology,extra').error ?? '', /more values/)
  })

  it('returns actionable row and field errors before CSV commit', () => {
    const preview = previewUnitImport([
      { code: 'BIO101', name: 'Biology', credits: '6', status: 'active' },
      { code: 'BIO101', name: '', credits: '-1', status: 'mystery' },
    ], { code: 'code', name: 'name', creditPoints: 'credits', status: 'status' })
    assert.equal(preview.canCommit, false)
    assert.deepEqual(preview.errors.map((error) => [error.row, error.field]), [
      [2, 'name'], [2, 'code'], [2, 'credits'], [2, 'status'],
    ])
  })

  it('builds stable idempotency keys for deadline suggestions', () => {
    const due = new Date('2027-03-01T00:00:00Z')
    assert.equal(studySuggestionKey('assessment', 'assessment-1', due), studySuggestionKey('assessment', 'assessment-1', due.toISOString()))
    assert.notEqual(studySuggestionKey('assessment', 'assessment-1', due), studySuggestionKey('withdrawal', 'assessment-1', due))
  })
})

describe('effective grading scales', () => {
  const scales = [
    { id: 'old', name: '2025 scale', method: 'percentage' as const, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', rules: [{ label: 'Pass', minimum: 50, maximum: 100, outcome: 'P' }] },
    { id: 'new', name: '2026 scale', method: 'percentage' as const, effectiveFrom: '2026-01-01', rules: [{ label: 'Distinction', minimum: 75, maximum: 100, value: 6, outcome: 'D' }] },
  ]

  it('selects the in-force version and returns an inspectable matching rule', () => {
    const result = evaluateEffectiveGradingScale(scales, 'percentage', 82, '2026-02-01')
    assert.equal(result.scaleId, 'new')
    assert.equal(result.value, 6)
    assert.equal(result.outcome, 'D')
    assert.match(result.formula, /82 matches 75 ≤ input ≤ 100/)
    assert.match(result.trace[0], /no conversion requested/)
  })

  it('does not cross metric boundaries or use an expired scale', () => {
    assert.equal(evaluateEffectiveGradingScale(scales, 'percentage', 60, '2025-12-31').scaleId, 'old')
    assert.throws(() => evaluateEffectiveGradingScale(scales, 'gpa4', 4, '2026-02-01'), /No gpa4/)
    assert.throws(() => evaluateEffectiveGradingScale(scales, 'percentage', 40, '2026-02-01'), /No rule/)
  })
})

describe('study API race and ownership safeguards', () => {
  it('uses conditional pending-state claims for both decisions and validates linked records against a program', () => {
    const suggestionRoute = readFileSync(new URL('../app/api/study/suggestions/[id]/route.ts', import.meta.url), 'utf8')
    const unitRoute = readFileSync(new URL('../app/api/study/units/route.ts', import.meta.url), 'utf8')
    assert.equal((suggestionRoute.match(/status: 'pending'/g) ?? []).length >= 2, true)
    assert.match(suggestionRoute, /prisma\.\$transaction/)
    assert.match(suggestionRoute, /updateMany/)
    assert.match(suggestionRoute, /side effects only/i)
    assert.match(unitRoute, /studyRequirement\.findFirst/)
    assert.match(unitRoute, /requirementId.*programId/)
    assert.match(unitRoute, /studyTeachingPeriod\.findFirst/)
  })

  it('reviews owned import destinations and prevents duplicate commits during races', () => {
    const importRoute = readFileSync(new URL('../app/api/study/units/import/route.ts', import.meta.url), 'utf8')
    assert.match(importRoute, /assertOwnedStudyProgram/)
    assert.match(importRoute, /teachingPeriodId.*programId/)
    assert.match(importRoute, /duplicates/)
    assert.match(importRoute, /skipDuplicates: true/)
    assert.match(importRoute, /created: result\.created\.count/)
    assert.match(importRoute, /skipped: preview\.total - result\.created\.count/)
  })

  it('keeps imported units scoped to an owner-checked batch for review and undo', () => {
    const importRoute = readFileSync(new URL('../app/api/study/units/import/route.ts', import.meta.url), 'utf8')
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
    assert.match(schema, /model StudyUnitImportBatch/)
    assert.match(schema, /importBatchId\s+String\?/)
    assert.match(importRoute, /action === 'undo-preview'/)
    assert.match(importRoute, /program: \{ userId \}/)
    assert.match(importRoute, /where: \{ importBatchId: batch\.id \}/)
    assert.match(importRoute, /updateMany/)
    assert.match(importRoute, /units:/)
  })
})
