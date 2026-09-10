export type StudyMetric = 'percentage' | 'wam' | 'gpa4' | 'gpa7' | 'pass_fail' | 'competency' | 'custom'

export type NumericStudyResult = {
  label: string
  value: number
  weight?: number
  metric: StudyMetric
  scaleId?: string
}

export type OutcomeStudyResult = {
  label: string
  outcome: string
  weight?: number
  metric: 'pass_fail' | 'competency'
}

export type CalculationResult = {
  metric: StudyMetric
  value: number | null
  outcome: string | null
  formula: string
  contributions: Array<{ label: string; value: string; weight: number }>
  warnings: string[]
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000

/**
 * Aggregates only like-for-like results. Converting a percentage to GPA, a
 * letter grade to a number, or one custom scale to another must happen in a
 * separate, explicit conversion step chosen by the caller.
 */
export function calculateStudyResult(
  metric: StudyMetric,
  inputs: Array<NumericStudyResult | OutcomeStudyResult>,
): CalculationResult {
  if (!inputs.length) throw new Error('At least one result is required')
  if (inputs.some((input) => input.metric !== metric)) {
    throw new Error(`Implicit conversion is not allowed: every result must use ${metric}`)
  }
  const weights = inputs.map((input) => input.weight ?? 1)
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error('Weights must be finite numbers greater than zero')
  }

  if (metric === 'pass_fail' || metric === 'competency') {
    const accepted = metric === 'pass_fail' ? ['pass', 'fail'] : ['competent', 'not_yet_competent']
    const outcomes = (inputs as OutcomeStudyResult[]).map((input) => input.outcome.trim().toLowerCase())
    if (outcomes.some((outcome) => !accepted.includes(outcome))) {
      throw new Error(`${metric} outcomes must be one of: ${accepted.join(', ')}`)
    }
    const unsuccessful = metric === 'pass_fail' ? 'fail' : 'not_yet_competent'
    const outcome = outcomes.includes(unsuccessful) ? unsuccessful : accepted[0]
    return {
      metric, value: null, outcome,
      formula: `Outcome is ${unsuccessful} when any included result is ${unsuccessful}; otherwise ${accepted[0]}.`,
      contributions: inputs.map((input, index) => ({ label: input.label, value: outcomes[index], weight: weights[index] })),
      warnings: [],
    }
  }

  const numeric = inputs as NumericStudyResult[]
  if (numeric.some((input) => !Number.isFinite(input.value))) throw new Error('Values must be finite numbers')
  const maximum = metric === 'gpa4' ? 4 : metric === 'gpa7' ? 7 : metric === 'percentage' || metric === 'wam' ? 100 : null
  if (maximum != null && numeric.some((input) => input.value < 0 || input.value > maximum)) {
    throw new Error(`${metric} values must be between 0 and ${maximum}`)
  }
  if (metric === 'custom') {
    const scales = new Set(numeric.map((input) => input.scaleId))
    if (scales.size !== 1 || scales.has(undefined)) throw new Error('Custom results require one shared explicit scaleId')
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  const products = numeric.map((input, index) => input.value * weights[index])
  return {
    metric,
    value: round(products.reduce((sum, value) => sum + value, 0) / totalWeight),
    outcome: null,
    formula: `(${numeric.map((input, index) => `${input.value} × ${weights[index]}`).join(' + ')}) ÷ ${totalWeight}`,
    contributions: numeric.map((input, index) => ({
      label: input.label,
      value: String(input.value),
      weight: weights[index],
    })),
    warnings: metric === 'percentage' && totalWeight !== 100
      ? [`Weights total ${totalWeight}, so the result was normalised rather than treated as percentage points.`]
      : [],
  }
}

export type UnitCsvRow = Record<string, string | number | boolean | null>
export type UnitCsvMapping = { code: string; name: string; creditPoints?: string; status?: string }
export type UnitImportRow = { row: number; code: string; name: string; creditPoints: number | null; status: string }
export type UnitImportError = { row: number; field: string; message: string }

const STUDY_STATUSES = new Set(['planned', 'active', 'completed', 'withdrawn', 'failed', 'credited', 'archived'])

export function previewUnitImport(rows: UnitCsvRow[], mapping: UnitCsvMapping) {
  const valid: UnitImportRow[] = []
  const errors: UnitImportError[] = []
  const seen = new Set<string>()
  rows.forEach((source, index) => {
    const row = index + 1
    const code = String(source[mapping.code] ?? '').trim()
    const name = String(source[mapping.name] ?? '').trim()
    const status = String(mapping.status ? source[mapping.status] ?? 'planned' : 'planned').trim().toLowerCase()
    const creditRaw = mapping.creditPoints ? String(source[mapping.creditPoints] ?? '').trim() : ''
    const creditPoints = creditRaw === '' ? null : Number(creditRaw)
    if (!code) errors.push({ row, field: mapping.code, message: 'Unit code is required' })
    if (!name) errors.push({ row, field: mapping.name, message: 'Unit name is required' })
    if (code && seen.has(code.toLowerCase())) errors.push({ row, field: mapping.code, message: `Duplicate unit code "${code}" in this file` })
    if (creditPoints != null && (!Number.isFinite(creditPoints) || creditPoints <= 0)) errors.push({ row, field: mapping.creditPoints!, message: 'Credit points must be a number greater than zero' })
    if (!STUDY_STATUSES.has(status)) errors.push({ row, field: mapping.status ?? 'status', message: `Unknown status "${status}"` })
    seen.add(code.toLowerCase())
    if (!errors.some((error) => error.row === row)) valid.push({ row, code, name, creditPoints, status })
  })
  return { valid, errors, total: rows.length, canCommit: errors.length === 0 }
}

export function studySuggestionKey(kind: string, sourceId: string, dueAt?: Date | string | null) {
  const date = dueAt ? new Date(dueAt).toISOString() : 'undated'
  return `study:${kind}:${sourceId}:${date}`
}

export type GradingScaleRule = {
  label: string
  minimum?: number
  maximum?: number
  value?: number
  outcome?: string
}

export type EffectiveGradingScale = {
  id: string
  name: string
  method: StudyMetric
  effectiveFrom: Date | string
  effectiveTo?: Date | string | null
  maximumValue?: number | null
  rules: GradingScaleRule[]
}

export type ScaleEvaluation = {
  scaleId: string
  scaleName: string
  method: StudyMetric
  evaluatedAt: string
  input: number
  value: number | null
  outcome: string | null
  formula: string
  rule: GradingScaleRule
  trace: string[]
}

/**
 * Selects the latest scale in force at `evaluatedAt`, then evaluates the raw
 * value using its declared interval. It does not turn the result into another
 * metric: a GPA4 scale yields GPA4, a custom scale yields custom, and so on.
 */
export function evaluateEffectiveGradingScale(
  scales: EffectiveGradingScale[],
  method: StudyMetric,
  input: number,
  evaluatedAt: Date | string,
): ScaleEvaluation {
  if (!Number.isFinite(input)) throw new Error('Grade input must be a finite number')
  const at = new Date(evaluatedAt)
  if (Number.isNaN(at.getTime())) throw new Error('Evaluation date is invalid')
  const candidates = scales.filter((scale) => {
    if (scale.method !== method) return false
    const from = new Date(scale.effectiveFrom)
    const to = scale.effectiveTo ? new Date(scale.effectiveTo) : null
    return !Number.isNaN(from.getTime()) && (!to || !Number.isNaN(to.getTime()))
      && from <= at && (!to || at <= to)
  }).sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())
  const scale = candidates[0]
  if (!scale) throw new Error(`No ${method} grading scale applies on ${at.toISOString().slice(0, 10)}`)
  if (scale.maximumValue != null && input > scale.maximumValue) {
    throw new Error(`Grade input must not exceed this scale's maximum of ${scale.maximumValue}`)
  }
  const rule = scale.rules.find((candidate) =>
    (candidate.minimum == null || input >= candidate.minimum)
    && (candidate.maximum == null || input <= candidate.maximum),
  )
  if (!rule) throw new Error(`No rule in "${scale.name}" matches ${input}`)
  const interval = `${rule.minimum ?? '−∞'} ≤ input ≤ ${rule.maximum ?? '+∞'}`
  return {
    scaleId: scale.id,
    scaleName: scale.name,
    method,
    evaluatedAt: at.toISOString(),
    input,
    value: rule.value ?? null,
    outcome: rule.outcome ?? rule.label,
    formula: `${input} matches ${interval}; apply rule "${rule.label}" from "${scale.name}".`,
    rule,
    trace: [
      `Requested native metric: ${method} (no conversion requested).`,
      `Evaluation date: ${at.toISOString().slice(0, 10)}.`,
      `Selected latest applicable scale: ${scale.name} (${new Date(scale.effectiveFrom).toISOString().slice(0, 10)}${scale.effectiveTo ? ` to ${new Date(scale.effectiveTo).toISOString().slice(0, 10)}` : ' onward'}).`,
      `Matched rule: ${interval}.`,
    ],
  }
}
