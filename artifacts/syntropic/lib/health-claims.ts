import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  MEDICARE_REVIEW_FIELDS,
  PRIVATE_HEALTH_REVIEW_FIELDS,
} from './health-claim-review-fields'

export {
  MEDICARE_REVIEW_FIELDS,
  PRIVATE_HEALTH_REVIEW_FIELDS,
  type HealthClaimReviewField,
  type HealthClaimReviewInputType,
} from './health-claim-review-fields'

export type HealthClaimKind = 'medicare' | 'private_health'

export type MedicareClaimData = {
  serviceDate: string
  description: string
  itemNumber: string | null
  provider: string | null
  scheduleFee: number | null
  feeCharged: number | null
  benefitPaid: number | null
  outOfPocket: number
  financialYear: string | null
  isForecast: boolean
  countsToSafetyNet: boolean
  appointmentId: string | null
}

export type PrivateHealthClaimData = {
  claimNumber: string | null
  serviceDate: string
  provider: string | null
  serviceType: string | null
  description: string
  itemNumber: string | null
  chargedAmount: number | null
  benefitAmount: number | null
  outOfPocket: number
  benefitDetail: string | null
  claimStatus: string | null
}

export type HealthClaimData = MedicareClaimData | PrivateHealthClaimData

export const MEDICARE_CLAIM_FIELDS = [
  'serviceDate',
  'description',
  'itemNumber',
  'provider',
  'scheduleFee',
  'feeCharged',
  'benefitPaid',
  'outOfPocket',
  'financialYear',
  'isForecast',
  'countsToSafetyNet',
] as const satisfies readonly (keyof MedicareClaimData)[]

export const PRIVATE_HEALTH_CLAIM_FIELDS = [
  'claimNumber',
  'serviceDate',
  'provider',
  'serviceType',
  'description',
  'itemNumber',
  'chargedAmount',
  'benefitAmount',
  'outOfPocket',
  'benefitDetail',
  'claimStatus',
] as const satisfies readonly (keyof PrivateHealthClaimData)[]

export const MEDICARE_REVIEW_EDIT_FIELDS = MEDICARE_REVIEW_FIELDS.map(({ field }) => field) as readonly (keyof MedicareClaimData)[]

export const MEDICARE_REVIEW_IMMUTABLE_FIELDS = [
  'scheduleFee',
  'financialYear',
  'isForecast',
  'countsToSafetyNet',
] as const satisfies readonly (keyof MedicareClaimData)[]

export const PRIVATE_HEALTH_REVIEW_EDIT_FIELDS = PRIVATE_HEALTH_REVIEW_FIELDS.map(({ field }) => field) as readonly (keyof PrivateHealthClaimData)[]

export const PRIVATE_HEALTH_REVIEW_IMMUTABLE_FIELDS = [
  'serviceType',
  'itemNumber',
  'benefitDetail',
  'claimStatus',
] as const satisfies readonly (keyof PrivateHealthClaimData)[]

export type ParsedHealthClaimRow = {
  rowNumber: number
  data: HealthClaimData
  errors: string[]
  fingerprint: string
}

export type ParsedHealthClaimRowFor<K extends HealthClaimKind> = Omit<ParsedHealthClaimRow, 'data'> & {
  data: K extends 'medicare' ? MedicareClaimData : PrivateHealthClaimData
}

export type ParsedHealthClaimResult<K extends HealthClaimKind> = {
  rows: ParsedHealthClaimRowFor<K>[]
  errors: string[]
  detectedFields: string[]
}

const MAX_ROWS = 5000
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_PDF_PAGES = 100
const MAX_PDF_TEXT_CHARS = 2_000_000

const MAX_OCR_PAGES = 5
const PDF_PROTECTION_ERROR = 'This PDF is encrypted or restricts text extraction, so it cannot be imported safely. Download an unprotected statement, upload a CSV, or enter claims manually.'
function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }
  return rows
}

function parseAustralianDate(value: unknown): string | null {
  const raw = clean(value)
  if (!raw) return null
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3]
    const month = match[2].padStart(2, '0')
    const day = match[1].padStart(2, '0')
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}`) {
      return `${year}-${month}-${day}`
    }
    return null
  }
  const iso = new Date(raw)
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString().slice(0, 10)
}

export function parseAudAmount(value: unknown): number | null {
  const raw = clean(value)
  if (!raw) return null
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-')
  const numeric = Number(raw.replace(/[,$AUD\s]/gi, '').replace(/[()]/g, ''))
  if (!Number.isFinite(numeric)) return null
  return negative ? -Math.abs(numeric) : numeric
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  const raw = clean(value).toLowerCase()
  if (!raw) return defaultValue
  if (['true', 'yes', 'y', '1', 'included', 'include'].includes(raw)) return true
  if (['false', 'no', 'n', '0', 'excluded', 'exclude'].includes(raw)) return false
  return defaultValue
}

function getField(fields: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (fields[key(alias)] != null) return fields[key(alias)]
  }
  return ''
}

const MEDICARE_ALIASES = {
  serviceDate: ['service date', 'date of service', 'date', 'treatment date', 'date of treatment'],
  description: ['description', 'service', 'service description', 'procedure', 'item description', 'service provided', 'treatment', 'service name', 'treatment type'],
  itemNumber: ['item number', 'item', 'medicare item', 'mbs item', 'item code', 'mbs item number'],
  provider: ['provider', 'practitioner', 'health provider', 'provider name', 'practitioner name'],
  scheduleFee: ['schedule fee', 'schedule', 'mbs fee', 'benefit schedule fee'],
  feeCharged: ['fee charged', 'charged', 'charged amount', 'fee', 'amount charged', 'total fee', 'patient fee', 'amount claimed'],
  benefitPaid: ['benefit paid', 'benefit', 'rebate', 'medicare benefit', 'benefit amount', 'rebate paid', 'medicare paid'],
  outOfPocket: ['out of pocket', 'oop', 'gap', 'patient gap', 'patient contribution', 'member contribution', 'your share'],
  financialYear: ['financial year', 'fy'],
  isForecast: ['forecast', 'is forecast', 'planned'],
  countsToSafetyNet: ['counts to safety net', 'safety net', 'include in safety net'],
} as const

const PRIVATE_ALIASES = {
  claimNumber: ['claim number', 'claim id', 'reference', 'claim reference', 'claim no', 'claim number'],
  serviceDate: ['service date', 'date of service', 'date', 'treatment date', 'date of treatment'],
  provider: ['provider', 'practitioner', 'health provider', 'provider name', 'practitioner name'],
  serviceType: ['service type', 'category', 'cover type', 'extras type'],
  description: ['description', 'service', 'service description', 'procedure', 'item description', 'service provided', 'treatment', 'service name', 'treatment type'],
  itemNumber: ['item number', 'item', 'service code', 'item code'],
  chargedAmount: ['charged amount', 'amount charged', 'charged', 'fee', 'total claimed', 'amount claimed', 'claimed', 'charge'],
  benefitAmount: ['benefit amount', 'benefit', 'rebate', 'refund', 'benefit paid', 'paid by fund', 'fund benefit', 'fund paid', 'benefits paid'],
  outOfPocket: ['out of pocket', 'oop', 'gap', 'patient gap', 'patient contribution', 'member contribution', 'member paid', 'your share'],
  benefitDetail: ['benefit detail', 'benefit description', 'rebate detail'],
  claimStatus: ['claim status', 'status'],
} as const

function normaliseMedicare(fields: Record<string, string>): { data: MedicareClaimData; errors: string[] } {
  const serviceDate = parseAustralianDate(getField(fields, [...MEDICARE_ALIASES.serviceDate]))
  const description = getField(fields, [...MEDICARE_ALIASES.description])
  const feeRaw = getField(fields, [...MEDICARE_ALIASES.feeCharged])
  const benefitRaw = getField(fields, [...MEDICARE_ALIASES.benefitPaid])
  const outOfPocketRaw = getField(fields, [...MEDICARE_ALIASES.outOfPocket])
  const feeCharged = parseAudAmount(feeRaw)
  const benefitPaid = parseAudAmount(benefitRaw)
  const outOfPocket = parseAudAmount(outOfPocketRaw)
  const errors: string[] = []
  if (!serviceDate) errors.push('Service date is missing or not a valid Australian date')
  if (!description) errors.push('Description is required')
  for (const [label, value] of [['fee charged', feeCharged], ['benefit paid', benefitPaid], ['out-of-pocket', outOfPocket]] as const) {
    const raw = label === 'fee charged' ? feeRaw : label === 'benefit paid' ? benefitRaw : outOfPocketRaw
    if (raw && value == null) errors.push(`${label} must be a valid AUD amount`)
  }
  const calculatedOop = outOfPocket ?? (feeCharged != null && benefitPaid != null ? Math.max(0, feeCharged - benefitPaid) : 0)
  if (calculatedOop < 0) errors.push('Out-of-pocket amount cannot be negative')
  return {
    data: {
      serviceDate: serviceDate ?? '',
      description,
      itemNumber: getField(fields, [...MEDICARE_ALIASES.itemNumber]) || null,
      provider: getField(fields, [...MEDICARE_ALIASES.provider]) || null,
      scheduleFee: parseAudAmount(getField(fields, [...MEDICARE_ALIASES.scheduleFee])),
      feeCharged,
      benefitPaid,
      outOfPocket: calculatedOop,
      financialYear: getField(fields, [...MEDICARE_ALIASES.financialYear]) || null,
      isForecast: parseBoolean(getField(fields, [...MEDICARE_ALIASES.isForecast]), false),
      countsToSafetyNet: parseBoolean(getField(fields, [...MEDICARE_ALIASES.countsToSafetyNet]), true),
      appointmentId: null,
    },
    errors,
  }
}

function normalisePrivate(fields: Record<string, string>): { data: PrivateHealthClaimData; errors: string[] } {
  const serviceDate = parseAustralianDate(getField(fields, [...PRIVATE_ALIASES.serviceDate]))
  const description = getField(fields, [...PRIVATE_ALIASES.description])
  const chargedRaw = getField(fields, [...PRIVATE_ALIASES.chargedAmount])
  const benefitRaw = getField(fields, [...PRIVATE_ALIASES.benefitAmount])
  const outOfPocketRaw = getField(fields, [...PRIVATE_ALIASES.outOfPocket])
  const chargedAmount = parseAudAmount(chargedRaw)
  const benefitAmount = parseAudAmount(benefitRaw)
  const outOfPocket = parseAudAmount(outOfPocketRaw)
  const errors: string[] = []
  if (!serviceDate) errors.push('Service date is missing or not a valid Australian date')
  if (!description) errors.push('Description is required')
  for (const [label, value] of [['charged amount', chargedAmount], ['benefit amount', benefitAmount], ['out-of-pocket', outOfPocket]] as const) {
    const raw = label === 'charged amount' ? chargedRaw : label === 'benefit amount' ? benefitRaw : outOfPocketRaw
    if (raw && value == null) errors.push(`${label} must be a valid AUD amount`)
  }
  const calculatedOop = outOfPocket ?? (chargedAmount != null && benefitAmount != null ? Math.max(0, chargedAmount - benefitAmount) : 0)
  if (calculatedOop < 0) errors.push('Out-of-pocket amount cannot be negative')
  return {
    data: {
      claimNumber: getField(fields, [...PRIVATE_ALIASES.claimNumber]) || null,
      serviceDate: serviceDate ?? '',
      provider: getField(fields, [...PRIVATE_ALIASES.provider]) || null,
      serviceType: getField(fields, [...PRIVATE_ALIASES.serviceType]) || null,
      description,
      itemNumber: getField(fields, [...PRIVATE_ALIASES.itemNumber]) || null,
      chargedAmount,
      benefitAmount,
      outOfPocket: calculatedOop,
      benefitDetail: getField(fields, [...PRIVATE_ALIASES.benefitDetail]) || null,
      claimStatus: getField(fields, [...PRIVATE_ALIASES.claimStatus]) || null,
    },
    errors,
  }
}

export function claimFingerprint(kind: HealthClaimKind, data: HealthClaimData): string {
  const fingerprintData = kind === 'medicare'
    ? Object.fromEntries(Object.entries(data).filter(([field]) => field !== 'appointmentId'))
    : data
  const canonical = JSON.stringify({ kind, data: fingerprintData })
  return createHash('sha256').update(canonical).digest('hex')
}

export function validateClaimData(kind: HealthClaimKind, input: unknown): { data: HealthClaimData; errors: string[] } {
  const fields: Record<string, string> = {}
  if (input && typeof input === 'object') {
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
      fields[key(name)] = value == null ? '' : String(value)
    }
  }
  const result = kind === 'medicare' ? normaliseMedicare(fields) : normalisePrivate(fields)
  if (kind === 'medicare' && input && typeof input === 'object') {
    const appointmentId = (input as Record<string, unknown>).appointmentId
    ;(result.data as MedicareClaimData).appointmentId = typeof appointmentId === 'string' && appointmentId.trim() ? appointmentId.trim() : null
  }
  return result
}

export function applyHealthClaimReviewEdits(
  kind: 'medicare',
  existing: MedicareClaimData,
  input: unknown,
): MedicareClaimData
export function applyHealthClaimReviewEdits(
  kind: 'private_health',
  existing: PrivateHealthClaimData,
  input: unknown,
): PrivateHealthClaimData
export function applyHealthClaimReviewEdits(
  kind: HealthClaimKind,
  existing: HealthClaimData,
  input: unknown,
): HealthClaimData {
  const submitted = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const editableFields = kind === 'medicare'
    ? MEDICARE_REVIEW_EDIT_FIELDS
    : PRIVATE_HEALTH_REVIEW_EDIT_FIELDS
  const next = { ...existing } as Record<string, unknown>
  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(submitted, field)) next[field] = submitted[field]
  }
  if (kind === 'medicare' && Object.prototype.hasOwnProperty.call(submitted, 'appointmentId')) {
    const appointmentId = submitted.appointmentId
    next.appointmentId = typeof appointmentId === 'string' && appointmentId.trim() ? appointmentId.trim() : null
  }
  return next as HealthClaimData
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { getDocument, PermissionFlag } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  })
  // Never ask users for a password or attempt to continue with one. A
  // protected insurer statement must be recovered outside this claim-import
  // flow, where the user can choose an unprotected export instead.
  loadingTask.onPassword = () => {
    throw Object.assign(new Error('Protected PDF cannot be imported'), { name: 'PdfProtectionError' })
  }
  try {
    const document = await loadingTask.promise
    const permissions = await document.getPermissions()
    if (permissions && !permissions.has(PermissionFlag.COPY)) {
      throw Object.assign(new Error('PDF text extraction is restricted'), { name: 'PdfProtectionError' })
    }
    if (document.numPages > MAX_PDF_PAGES) {
      throw Object.assign(new Error('PDF page limit exceeded'), { name: 'PdfResourceLimitError' })
    }
    const pages: string[] = []
    let extractedChars = 0
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = new Map<number, Array<{ x: number; text: string }>>()
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = Math.round(item.transform[5])
        const line = lines.get(y) ?? []
        line.push({ x: item.transform[4], text: item.str })
        lines.set(y, line)
        extractedChars += item.str.length
        if (extractedChars > MAX_PDF_TEXT_CHARS) {
          throw Object.assign(new Error('PDF text limit exceeded'), { name: 'PdfResourceLimitError' })
        }
      }
      pages.push(
        [...lines.entries()]
          .sort(([firstY], [secondY]) => secondY - firstY)
          .map(([, line]) => line.sort((first, second) => first.x - second.x).map((item) => item.text).join('  '))
          .join('\n'),
      )
      page.cleanup()
    }
    return pages.join('\n')
  } finally {
    await loadingTask.destroy()
  }
}

type OcrLine = { text: string; confidence: number }
function pdfRejection(buffer: Buffer): string | null {
  const source = buffer.toString('latin1')
  if (!source.startsWith('%PDF-')) {
    return 'This file is not a valid PDF. Download the statement again or upload a CSV.'
  }
  if (/\/Encrypt\b/.test(source)) {
    return PDF_PROTECTION_ERROR
  }
  if (!/%%EOF\s*$/.test(source)) {
    return 'This PDF appears incomplete or malformed. Download the statement again or upload a CSV.'
  }
  return null
}

function aliasesFor(kind: HealthClaimKind): ReadonlyArray<ReadonlyArray<string>> {
  return kind === 'medicare' ? Object.values(MEDICARE_ALIASES) : Object.values(PRIVATE_ALIASES)
}

function isKnownHeader(value: string, kind: HealthClaimKind): boolean {
  const normalised = key(value)
  return aliasesFor(kind).some((aliases) => aliases.some((alias) => key(alias) === normalised))
}

function hasRequiredHeaders(headers: string[], kind: HealthClaimKind): boolean {
  const recognised = headers.filter((header) => isKnownHeader(header, kind))
  const dateAliases = kind === 'medicare' ? MEDICARE_ALIASES.serviceDate : PRIVATE_ALIASES.serviceDate
  const descriptionAliases = kind === 'medicare' ? MEDICARE_ALIASES.description : PRIVATE_ALIASES.description
  return recognised.length >= 2
    && headers.some((header) => dateAliases.some((alias) => key(alias) === key(header)))
    && headers.some((header) => descriptionAliases.some((alias) => key(alias) === key(header)))
}

function rowsFromHeaders(headers: string[], values: string[][], rowNumberOffset: number, kind: HealthClaimKind): ParsedHealthClaimRow[] {
  return values.slice(0, MAX_ROWS).map((row, index) => {
    const fields = Object.fromEntries(headers.map((header, i) => [key(header), row[i] ?? '']))
    const result = kind === 'medicare' ? normaliseMedicare(fields) : normalisePrivate(fields)
    return { rowNumber: rowNumberOffset + index, data: result.data, errors: result.errors, fingerprint: claimFingerprint(kind, result.data) }
  })
}

function parseSeparatedRows(text: string, delimiter: string): string[][] {
  if (delimiter === ',') return parseCsv(text)
  return text
    .split(/\r?\n/)
    .map((line) => line.split(delimiter).map((cell) => cell.trim()))
    .filter((row) => row.some((value) => value !== ''))
}

function parseDelimitedRows(text: string, kind: HealthClaimKind): ParsedHealthClaimRow[] {
  for (const delimiter of [',', '|', '\t', ';']) {
    const rows = parseSeparatedRows(text, delimiter)
    if (rows.length < 2) continue
    const headerIndexes = rows
      .map((candidate, index) => hasRequiredHeaders(candidate.map((value) => value.trim()), kind) ? index : -1)
      .filter((index) => index >= 0)
    if (headerIndexes.length) {
      return headerIndexes.flatMap((headerIndex, sectionIndex) => {
        const headers = rows[headerIndex].map((value) => value.trim())
        const nextHeaderIndex = headerIndexes[sectionIndex + 1] ?? rows.length
        const values = rows
          .slice(headerIndex + 1, nextHeaderIndex)
          .filter((row) => row.length >= 2 && row.some((value) => parseAustralianDate(value) != null))
        return rowsFromHeaders(headers, values, headerIndex + 2, kind)
      })
    }
  }

  // Many PDF text extractors retain column spacing but not delimiters.
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s{2,}|\t+/).map((value) => value.trim()))
  const headerIndexes = rows
    .map((candidate, index) => hasRequiredHeaders(candidate, kind) ? index : -1)
    .filter((index) => index >= 0)
  if (headerIndexes.length) {
    return headerIndexes.flatMap((headerIndex, sectionIndex) => {
      const nextHeaderIndex = headerIndexes[sectionIndex + 1] ?? rows.length
      const values = rows
        .slice(headerIndex + 1, nextHeaderIndex)
        .filter((row) => row.length >= 2 && row.some((value) => parseAustralianDate(value) != null))
      return rowsFromHeaders(rows[headerIndex], values, headerIndex + 2, kind)
    })
  }
  return []
}

function parsePdfCellRows(text: string, kind: HealthClaimKind): ParsedHealthClaimRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let headerStart = 0; headerStart < lines.length; headerStart += 1) {
    if (!isKnownHeader(lines[headerStart], kind)) continue
    const headers: string[] = []
    let cursor = headerStart
    while (cursor < lines.length && isKnownHeader(lines[cursor], kind)) {
      headers.push(lines[cursor])
      cursor += 1
    }
    if (!hasRequiredHeaders(headers, kind)) continue
    const values: string[][] = []
    while (cursor + headers.length <= lines.length && lines.slice(cursor, cursor + headers.length).every((line) => !isKnownHeader(line, kind))) {
      values.push(lines.slice(cursor, cursor + headers.length))
      cursor += headers.length
    }
    if (values.length) return rowsFromHeaders(headers, values, headerStart + headers.length + 1, kind)
  }
  return []
}

function parseLabelValueRows(text: string, kind: HealthClaimKind): ParsedHealthClaimRow[] {
  const lines = text.split(/\r?\n/)
  const fieldsRows: Array<{ line: number; fields: Record<string, string> }> = []
  let current: Record<string, string> = {}
  let startLine = 0
  const flush = () => {
    const hasDate = getField(current, kind === 'medicare' ? [...MEDICARE_ALIASES.serviceDate] : [...PRIVATE_ALIASES.serviceDate])
    const hasDescription = getField(current, kind === 'medicare' ? [...MEDICARE_ALIASES.description] : [...PRIVATE_ALIASES.description])
    if (hasDate || hasDescription) fieldsRows.push({ line: startLine, fields: current })
    current = {}
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim()
    if (!line) {
      if (Object.keys(current).length) flush()
      continue
    }
    const segments = line.split(/\s*[|;]\s*|\t+/).map((segment) => segment.trim()).filter(Boolean)
    const parsed: Array<[string, string]> = []
    for (const segment of segments) {
      const separator = segment.search(/\s*:\s*/)
      if (separator < 0) continue
      const label = segment.slice(0, separator).trim()
      const value = segment.slice(segment.indexOf(':', separator) + 1).trim()
      if (value && isKnownHeader(label, kind)) parsed.push([label, value])
    }
    if (!parsed.length) continue
    const dateAliases = kind === 'medicare' ? MEDICARE_ALIASES.serviceDate : PRIVATE_ALIASES.serviceDate
    if (parsed.some(([label]) => dateAliases.some((alias) => key(alias) === key(label))) && Object.keys(current).length) flush()
    if (!Object.keys(current).length) startLine = lineIndex + 1
    for (const [label, value] of parsed) current[key(label)] = value
  }
  if (Object.keys(current).length) flush()

  return fieldsRows.slice(0, MAX_ROWS).map(({ line, fields }) => {
    const result = kind === 'medicare' ? normaliseMedicare(fields) : normalisePrivate(fields)
    return { rowNumber: line, data: result.data, errors: result.errors, fingerprint: claimFingerprint(kind, result.data) }
  })
}

export function parseHealthClaimFile(kind: 'medicare', fileName: string, contentType: string, buffer: Buffer): Promise<ParsedHealthClaimResult<'medicare'>>
export function parseHealthClaimFile(kind: 'private_health', fileName: string, contentType: string, buffer: Buffer): Promise<ParsedHealthClaimResult<'private_health'>>
export function parseHealthClaimFile(kind: HealthClaimKind, fileName: string, contentType: string, buffer: Buffer): Promise<{ rows: ParsedHealthClaimRow[]; errors: string[]; detectedFields: string[] }>
export async function parseHealthClaimFile(kind: HealthClaimKind, fileName: string, contentType: string, buffer: Buffer): Promise<{ rows: ParsedHealthClaimRow[]; errors: string[]; detectedFields: string[] }> {
  if (buffer.byteLength > MAX_FILE_BYTES) return { rows: [], errors: ['File is larger than the 25 MB limit'], detectedFields: [] }
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (contentType === 'application/pdf' || extension === 'pdf') {
    const rejection = pdfRejection(buffer)
    if (rejection) return { rows: [], errors: [rejection], detectedFields: [] }
    let text: string
    let pageCount = 0
    try {
      text = await extractPdfText(buffer)
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const task = getDocument({ data: new Uint8Array(buffer), disableFontFace: true })
      try {
        pageCount = (await task.promise).numPages
      } finally {
        await task.destroy()
      }
    } catch (error) {
      const errorName = error instanceof Error ? error.name : ''
      if (errorName === 'PasswordException' || errorName === 'PdfProtectionError') {
        return { rows: [], errors: [PDF_PROTECTION_ERROR], detectedFields: [] }
      }
      if (errorName === 'PdfResourceLimitError') {
        return { rows: [], errors: ['This PDF is too complex to import safely. Upload a smaller statement or use a CSV.'], detectedFields: [] }
      }
      return { rows: [], errors: ['This PDF appears incomplete or malformed. Download the statement again or upload a CSV.'], detectedFields: [] }
    }
    // Prefer the least ambiguous representation. The fallback parsers are
    // for extractors that emit one cell per text object or labelled fields.
    let ocrConfidence: number | null = null
    if (!text.trim() && kind === 'medicare') {
      try {
        const ocr = await extractScannedMedicareText(buffer, pageCount)
        text = ocr.text
        ocrConfidence = ocr.confidence
      } catch (error) {
        const errorName = error instanceof Error ? error.name : ''
        if (errorName === 'OcrResourceLimitError' || (error instanceof Error && error.message.includes('timed out'))) {
          return { rows: [], errors: ['This scanned Medicare PDF is too large or complex to process safely. Upload a statement of 5 pages or fewer, or enter claims manually.'], detectedFields: [] }
        }
        return { rows: [], errors: ['This scanned Medicare PDF could not be read clearly enough. Try a higher-quality scan or enter claims manually.'], detectedFields: [] }
      }
    }
    const delimitedRows = parseDelimitedRows(text, kind)
    const cellRows = delimitedRows.length ? [] : parsePdfCellRows(text, kind)
    const rows = delimitedRows.length ? delimitedRows : cellRows.length ? cellRows : parseLabelValueRows(text, kind)
    if (!rows.length) {
      return { rows: [], errors: [ocrConfidence == null
        ? 'This PDF has no supported claim table. For scanned statements, upload a Medicare PDF of 5 pages or fewer; otherwise use a CSV or enter claims manually.'
        : 'This scanned Medicare PDF could not be read clearly enough to find claim rows. Try a higher-quality scan or enter claims manually.'], detectedFields: [] }
    }
    if (ocrConfidence != null && ocrConfidence < OCR_LOW_CONFIDENCE) {
      for (const row of rows) {
        const data = row.data as MedicareClaimData
        for (const field of MEDICARE_CLAIM_FIELDS.filter((name) => !['isForecast', 'countsToSafetyNet'].includes(name))) {
          if (data[field] != null && data[field] !== '') {
            row.errors.push(`OCR confidence is low for ${field}; check and change this field before confirming`)
          }
        }
      }
    }
    return { rows, errors: [], detectedFields: Object.keys(rows[0].data) }
  }
  if (contentType === 'text/csv' || contentType === 'application/vnd.ms-excel' || extension === 'csv') {
    const rows = parseDelimitedRows(buffer.toString('utf8').replace(/^\uFEFF/, ''), kind)
    if (!rows.length) return { rows: [], errors: ['CSV must include service date and description columns and at least one claim row'], detectedFields: [] }
    return { rows, errors: [], detectedFields: Object.keys(rows[0].data) }
  }
  return { rows: [], errors: ['Unsupported file format. Upload a CSV or Medicare PDF.'], detectedFields: [] }
}

async function extractScannedMedicareText(buffer: Buffer, pageCount: number): Promise<{ text: string; confidence: number }> {
  if (pageCount > MAX_OCR_PAGES) {
    throw Object.assign(new Error('OCR page limit exceeded'), { name: 'OcrResourceLimitError' })
  }
  const directory = await mkdtemp(join(tmpdir(), 'medicare-ocr-'))
  try {
    const source = join(directory, 'source.pdf')
    await writeFile(source, buffer)
    const pagePrefix = join(directory, 'page')
    await execFileAsync('pdftoppm', ['-png', '-r', '200', '-scale-to', '3000', '-f', '1', '-l', String(pageCount), source, pagePrefix], {
      timeout: OCR_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    })
    const pageLines: OcrLine[][] = []
    const pageImages = (await readdir(directory))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    if (pageImages.length !== pageCount) {
      throw Object.assign(new Error('OCR renderer returned an unexpected page count'), { name: 'OcrResourceLimitError' })
    }
    for (const pageImage of pageImages) {
      const imagePath = join(directory, pageImage)
      const imageStats = await import('node:fs/promises').then((fs) => fs.stat(imagePath))
      if (imageStats.size > 20 * 1024 * 1024) {
        throw Object.assign(new Error('OCR image limit exceeded'), { name: 'OcrResourceLimitError' })
      }
      const { stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '--dpi', '200', '--psm', '6', 'tsv'], {
        timeout: OCR_TIMEOUT_MS,
        maxBuffer: MAX_OCR_OUTPUT_CHARS,
      })
      pageLines.push(ocrLinesFromTsv(stdout))
    }
    const pages = pageLines.map((lines) => lines.map((line) => line.text).join('\n'))
    const output = pages.flatMap((page) => page ? [page] : [])
    if (!output.length) return { text: '', confidence: 0 }
    const lines = pageLines.flat()
    return {
      text: output.join('\n\n'),
      confidence: lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const OCR_LOW_CONFIDENCE = 85

const MAX_OCR_OUTPUT_CHARS = 250_000

const execFileAsync = promisify(execFile)

export function ocrLinesFromTsv(tsv: string): OcrLine[] {
  const lines = new Map<string, Array<{ x: number; width: number; text: string; confidence: number }>>()
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const cells = row.split('\t')
    if (cells.length < 12 || cells[0] !== '5') continue
    const text = clean(cells.slice(11).join('\t'))
    const confidence = Number(cells[10])
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue
    const lineKey = cells.slice(1, 5).join(':')
    const words = lines.get(lineKey) ?? []
    words.push({ x: Number(cells[6]), width: Number(cells[8]), text, confidence })
    lines.set(lineKey, words)
  }
  return [...lines.values()].map((words) => {
    words.sort((a, b) => a.x - b.x)
    let previousEnd = words[0]?.x ?? 0
    let text = ''
    for (const word of words) {
      const gap = word.x - previousEnd
      // OCR does not preserve table delimiters. A column gap is materially
      // wider than ordinary word spacing even when the preceding header is long.
      text += `${text ? (gap > 25 ? '  ' : ' ') : ''}${word.text}`
      previousEnd = word.x + word.width
    }
    return {
      text,
      confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
    }
  }).filter((line) => line.text)
}

const OCR_TIMEOUT_MS = 45_000
