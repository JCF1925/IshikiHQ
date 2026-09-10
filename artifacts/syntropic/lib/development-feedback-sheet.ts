import { ReplitConnectors } from '@replit/connectors-sdk'
import type { ProxyOptions } from '@replit/connectors-sdk'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

const SETTING_KEY = '_internal_development_feedback_spreadsheet_id'
const SHEET_NAME = 'Improvements'
export const DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE = 'Ishiki Development Improvements'
export const DEVELOPMENT_FEEDBACK_WORKSHEET_NAME = SHEET_NAME
const HEADERS = [
  'Submitted at',
  'Status',
  'Priority',
  'Category',
  'Summary',
  'Details',
  'Expected outcome',
  'Page',
  'Tester',
] as const

export type FeedbackRow = {
  submittedAt: string
  priority: string
  category: string
  summary: string
  details: string
  expectedOutcome: string
  page: string
  tester: string
}

export type DevelopmentFeedbackSheetRow = FeedbackRow & {
  rowNumber: number
  status: string
}

export type DevelopmentFeedbackSpreadsheet = {
  spreadsheetId: string
  spreadsheetUrl: string
  internallyManaged: boolean
  source: 'persisted' | 'configured'
  title: typeof DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE
  worksheetName: typeof DEVELOPMENT_FEEDBACK_WORKSHEET_NAME
}

export type DevelopmentFeedbackSheetMetadata = Omit<DevelopmentFeedbackSpreadsheet, 'source' | 'title' | 'worksheetName'> & {
  source: DevelopmentFeedbackSpreadsheet['source'] | 'candidate'
  title: string
  worksheetName: string
  rowCount: number
}

export type DevelopmentFeedbackComparison = {
  authoritative: DevelopmentFeedbackSheetMetadata
  candidate: DevelopmentFeedbackSheetMetadata
  counts: {
    authoritativeRows: number
    candidateRows: number
    matchingRows: number
    candidateOnlyRows: number
    authoritativeOnlyRows: number
  }
  candidateOnly: DevelopmentFeedbackSheetRow[]
  authoritativeOnly: DevelopmentFeedbackSheetRow[]
}

export type DevelopmentFeedbackRecoveryResult = {
  recoveredRowNumbers: number[]
  duplicateRowNumbers: number[]
  requestedRows: number
  recoveredRows: number
  duplicateRows: number
  candidatePreserved: true
  authoritative: DevelopmentFeedbackSheetMetadata
  candidate: DevelopmentFeedbackSheetMetadata
}

export type DevelopmentFeedbackCleanupOutcome = 'retained' | 'archived' | 'deleted'

export type DevelopmentFeedbackCleanupResult = {
  outcome: DevelopmentFeedbackCleanupOutcome
  candidate: DevelopmentFeedbackSheetMetadata
  authoritative: DevelopmentFeedbackSheetMetadata
  remainingUniqueRows: number
  consolidatedRows: number
}

export class DevelopmentFeedbackSheetError extends Error {
  constructor(
    message: string,
    readonly publicMessage: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'DevelopmentFeedbackSheetError'
  }
}
async function sheetsRequest(path: string, init: ProxyOptions, operation: 'read' | 'write' | 'cleanup' = 'write') {
  let response: Response
  try {
    response = await new ReplitConnectors().proxy('google-sheet', path, init)
  } catch {
    throw new DevelopmentFeedbackSheetError(
      'Google Sheets request failed before receiving a response',
      operation === 'read'
        ? 'Google Sheets could not read the feedback comparison. Check the Google Sheets connection and try again.'
        : operation === 'cleanup'
          ? 'Google Sheets could not complete feedback sheet cleanup. Check the Google Sheets connection and try again.'
        : 'Google Sheets could not save the improvement. Check the Google Sheets connection and try again.',
    )
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new DevelopmentFeedbackSheetError(
        'Google Sheets request failed with status 404',
        operation === 'read'
          ? 'The feedback spreadsheet or Improvements tab was not found. Check the spreadsheet ID and make sure the Improvements tab exists.'
          : operation === 'cleanup'
            ? 'The candidate feedback spreadsheet or Improvements tab was not found. Compare it again and try the cleanup again.'
          : 'The configured feedback spreadsheet or Improvements tab was not found. Check FEEDBACK_GOOGLE_SPREADSHEET_ID or remove it to create a new sheet.',
        response.status,
      )
    }
    if (response.status === 403) {
      throw new DevelopmentFeedbackSheetError(
        'Google Sheets request failed with status 403',
        operation === 'read'
          ? 'Google Sheets denied read access. Make sure the connected account can view the candidate spreadsheet.'
          : operation === 'cleanup'
            ? 'Google Sheets denied cleanup access. Make sure the connected account can edit the candidate spreadsheet.'
          : 'Google Sheets denied access. Reconnect Google Sheets and make sure the connected account can edit the configured spreadsheet.',
        response.status,
      )
    }
    throw new DevelopmentFeedbackSheetError(
      `Google Sheets request failed with status ${response.status}`,
      operation === 'read'
        ? 'Google Sheets could not read the feedback comparison. Check the Google Sheets connection and try again.'
        : operation === 'cleanup'
          ? 'Google Sheets could not complete feedback sheet cleanup. Check the Google Sheets connection and try again.'
        : 'Google Sheets could not save the improvement. Check the Google Sheets connection and try again.',
      response.status,
    )
  }
  return response
}

function spreadsheetUrl(spreadsheetId: string) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}`
}

export function normalizeDevelopmentFeedbackSpreadsheetId(input: string) {
  const value = input.trim()
  if (!value) {
    throw new DevelopmentFeedbackSheetError(
      'A candidate spreadsheet ID or URL was not provided',
      'Paste a Google Sheets URL or spreadsheet ID to compare.',
      400,
    )
  }

  let spreadsheetId = value
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value)
      const parts = url.pathname.split('/').filter(Boolean)
      const spreadsheetIndex = parts.indexOf('d')
      spreadsheetId = spreadsheetIndex >= 0 ? parts[spreadsheetIndex + 1] ?? '' : ''
    } catch {
      spreadsheetId = ''
    }
  }

  if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
    throw new DevelopmentFeedbackSheetError(
      'The candidate spreadsheet ID was not valid',
      'Use a Google Sheets URL or the spreadsheet ID from its URL.',
      400,
    )
  }
  return spreadsheetId
}

async function readJson(response: Response, message: string) {
  try {
    return await response.json() as unknown
  } catch {
    throw new DevelopmentFeedbackSheetError(
      'Google Sheets returned invalid JSON',
      message,
    )
  }
}

type GoogleSpreadsheetResource = {
  spreadsheetId: string
  spreadsheetUrl?: string
  properties?: { title?: string }
  sheets?: Array<{ properties?: { title?: string } }>
}

async function readSpreadsheetMetadata(spreadsheetId: string): Promise<DevelopmentFeedbackSheetMetadata> {
  const response = await sheetsRequest(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?includeGridData=false`,
    { method: 'GET' },
    'read',
  )
  const resource = await readJson(
    response,
    'Google Sheets returned an invalid spreadsheet while preparing the comparison. Try again.',
  )
  if (
    !resource
    || typeof resource !== 'object'
    || typeof (resource as GoogleSpreadsheetResource).spreadsheetId !== 'string'
  ) {
    throw new DevelopmentFeedbackSheetError(
      'Google Sheets returned incomplete spreadsheet metadata',
      'Google Sheets returned incomplete spreadsheet details. Check the candidate spreadsheet and try again.',
    )
  }

  const typedResource = resource as GoogleSpreadsheetResource
  const hasImprovementsTab = typedResource.sheets?.some(
    (sheet) => sheet.properties?.title === SHEET_NAME,
  )
  if (!hasImprovementsTab) {
    throw new DevelopmentFeedbackSheetError(
      'The spreadsheet did not contain an Improvements tab',
      'This spreadsheet does not contain an Improvements tab, so it cannot be compared as a feedback sheet.',
      400,
    )
  }

  return {
    spreadsheetId,
    spreadsheetUrl: typeof typedResource.spreadsheetUrl === 'string'
      ? typedResource.spreadsheetUrl
      : spreadsheetUrl(spreadsheetId),
    internallyManaged: false,
    source: 'candidate',
    title: typeof typedResource.properties?.title === 'string'
      ? typedResource.properties.title
      : DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE,
    worksheetName: DEVELOPMENT_FEEDBACK_WORKSHEET_NAME,
    rowCount: 0,
  }
}

function cellText(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function isHeaderRow(values: string[]) {
  return HEADERS.every((header, index) => values[index] === header)
}

async function readFeedbackRows(spreadsheetId: string) {
  const range = encodeURIComponent(`'${SHEET_NAME}'!A:I`)
  const response = await sheetsRequest(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?majorDimension=ROWS`,
    { method: 'GET' },
    'read',
  )
  const payload = await readJson(
    response,
    'Google Sheets returned an invalid row response while preparing the comparison. Try again.',
  )
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { values?: unknown }).values)) {
    throw new DevelopmentFeedbackSheetError(
      'Google Sheets returned incomplete row data',
      'Google Sheets returned incomplete feedback rows. Check the candidate spreadsheet and try again.',
    )
  }

  const values = (payload as { values: unknown[][] }).values
  const rows = values.map((row, index) => {
    const cells = Array.from({ length: HEADERS.length }, (_, cellIndex) => cellText(row?.[cellIndex]))
    return {
      rowNumber: index + 1,
      submittedAt: cells[0] ?? '',
      status: cells[1] ?? '',
      priority: cells[2] ?? '',
      category: cells[3] ?? '',
      summary: cells[4] ?? '',
      details: cells[5] ?? '',
      expectedOutcome: cells[6] ?? '',
      page: cells[7] ?? '',
      tester: cells[8] ?? '',
    }
  })
  const firstRow = Array.isArray(values[0]) ? values[0].map(cellText) : []
  return isHeaderRow(firstRow) ? rows.slice(1) : rows
}

function feedbackRowFingerprint(row: DevelopmentFeedbackSheetRow) {
  return JSON.stringify([
    row.submittedAt,
    row.status,
    row.priority,
    row.category,
    row.summary,
    row.details,
    row.expectedOutcome,
    row.page,
    row.tester,
  ])
}

function rowValues(row: DevelopmentFeedbackSheetRow) {
  return [
    row.submittedAt,
    row.status,
    row.priority,
    row.category,
    row.summary,
    row.details,
    row.expectedOutcome,
    row.page,
    row.tester,
  ]
}

export async function compareDevelopmentFeedbackSheets(
  userId: string,
  candidateInput: string,
): Promise<DevelopmentFeedbackComparison> {
  const candidateId = normalizeDevelopmentFeedbackSpreadsheetId(candidateInput)
  const authoritative = await getDevelopmentFeedbackSpreadsheet(userId)
  if (!authoritative) {
    throw new DevelopmentFeedbackSheetError(
      'There was no authoritative feedback spreadsheet to compare',
      'Submit one improvement first so there is an authoritative feedback sheet to compare against.',
      400,
    )
  }
  if (authoritative.spreadsheetId === candidateId) {
    throw new DevelopmentFeedbackSheetError(
      'The candidate spreadsheet was the authoritative spreadsheet',
      'Choose an older candidate spreadsheet, not the authoritative spreadsheet.',
      400,
    )
  }

  const [authoritativeMetadata, candidateMetadata, authoritativeRows, candidateRows] = await Promise.all([
    readSpreadsheetMetadata(authoritative.spreadsheetId),
    readSpreadsheetMetadata(candidateId),
    readFeedbackRows(authoritative.spreadsheetId),
    readFeedbackRows(candidateId),
  ])
  const authoritativeByFingerprint = new Map<string, DevelopmentFeedbackSheetRow[]>()
  for (const row of authoritativeRows) {
    const fingerprint = feedbackRowFingerprint(row)
    const bucket = authoritativeByFingerprint.get(fingerprint) ?? []
    bucket.push(row)
    authoritativeByFingerprint.set(fingerprint, bucket)
  }

  const candidateOnly: DevelopmentFeedbackSheetRow[] = []
  const matchedAuthoritativeRows = new Set<DevelopmentFeedbackSheetRow>()
  let matchingRows = 0
  for (const row of candidateRows) {
    const bucket = authoritativeByFingerprint.get(feedbackRowFingerprint(row))
    if (bucket?.length) {
      const matchedRow = bucket.shift()
      if (matchedRow) matchedAuthoritativeRows.add(matchedRow)
      matchingRows += 1
    } else {
      candidateOnly.push(row)
    }
  }
  const authoritativeOnly = authoritativeRows.filter((row) => !matchedAuthoritativeRows.has(row))

  return {
    authoritative: {
      ...authoritativeMetadata,
      internallyManaged: authoritative.internallyManaged,
      source: authoritative.source,
      rowCount: authoritativeRows.length,
    },
    candidate: { ...candidateMetadata, rowCount: candidateRows.length },
    counts: {
      authoritativeRows: authoritativeRows.length,
      candidateRows: candidateRows.length,
      matchingRows,
      candidateOnlyRows: candidateOnly.length,
      authoritativeOnlyRows: authoritativeOnly.length,
    },
    candidateOnly,
    authoritativeOnly,
  }
}

async function appendExistingRows(spreadsheetId: string, rows: DevelopmentFeedbackSheetRow[]) {
  if (!rows.length) return
  const range = encodeURIComponent(`'${SHEET_NAME}'!A:I`)
  await sheetsRequest(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows.map(rowValues) }),
    },
  )
}

async function updateSpreadsheetTitle(spreadsheetId: string, title: string) {
  await sheetsRequest(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          updateSpreadsheetProperties: {
            properties: { title },
            fields: 'title',
          },
        }],
      }),
    },
    'cleanup',
  )
}

async function deleteFeedbackRows(spreadsheetId: string) {
  const range = encodeURIComponent(`'${SHEET_NAME}'!A2:I`)
  await sheetsRequest(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:clear`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    'cleanup',
  )
}

function archivedSpreadsheetTitle(title: string) {
  return title.startsWith('[Archived]') ? title : `[Archived] ${title}`
}

export async function recoverDevelopmentFeedbackRows(
  userId: string,
  candidateInput: string,
  authoritativeSpreadsheetId: string,
  selectedRowNumbers: number[],
): Promise<DevelopmentFeedbackRecoveryResult> {
  const comparison = await compareDevelopmentFeedbackSheets(userId, candidateInput)
  if (comparison.authoritative.spreadsheetId !== authoritativeSpreadsheetId) {
    throw new DevelopmentFeedbackSheetError(
      'The authoritative feedback spreadsheet changed before recovery',
      'The authoritative sheet changed. Compare the sheets again before recovering rows.',
      409,
    )
  }

  const candidateRows = await readFeedbackRows(comparison.candidate.spreadsheetId)
  const candidateByRowNumber = new Map(candidateRows.map((row) => [row.rowNumber, row]))
  const missingRowNumbers = selectedRowNumbers.filter((rowNumber) => !candidateByRowNumber.has(rowNumber))
  if (missingRowNumbers.length) {
    throw new DevelopmentFeedbackSheetError(
      `Selected candidate rows were not found: ${missingRowNumbers.join(', ')}`,
      'One or more selected rows no longer exist in the candidate sheet. Compare the sheets again before recovering rows.',
      409,
    )
  }

  const candidateOnlyRowNumbers = new Set(comparison.candidateOnly.map((row) => row.rowNumber))
  const recoveredRows = selectedRowNumbers
    .filter((rowNumber) => candidateOnlyRowNumbers.has(rowNumber))
    .map((rowNumber) => candidateByRowNumber.get(rowNumber))
    .filter((row): row is DevelopmentFeedbackSheetRow => Boolean(row))
  const recoveredRowNumbers = recoveredRows.map((row) => row.rowNumber)
  const recoveredSet = new Set(recoveredRowNumbers)
  const duplicateRowNumbers = selectedRowNumbers.filter((rowNumber) => !recoveredSet.has(rowNumber))

  await appendExistingRows(comparison.authoritative.spreadsheetId, recoveredRows)

  return {
    recoveredRowNumbers,
    duplicateRowNumbers,
    requestedRows: selectedRowNumbers.length,
    recoveredRows: recoveredRowNumbers.length,
    duplicateRows: duplicateRowNumbers.length,
    candidatePreserved: true,
    authoritative: comparison.authoritative,
    candidate: comparison.candidate,
  }
}

export async function consolidateDevelopmentFeedbackSheet(
  userId: string,
  candidateInput: string,
  authoritativeSpreadsheetId: string,
): Promise<DevelopmentFeedbackCleanupResult> {
  const comparison = await compareDevelopmentFeedbackSheets(userId, candidateInput)
  if (comparison.authoritative.spreadsheetId !== authoritativeSpreadsheetId) {
    throw new DevelopmentFeedbackSheetError(
      'The authoritative feedback spreadsheet changed before consolidation',
      'The authoritative sheet changed. Compare the sheets again before consolidating rows.',
      409,
    )
  }

  await appendExistingRows(comparison.authoritative.spreadsheetId, comparison.candidateOnly)
  return {
    outcome: 'retained',
    candidate: comparison.candidate,
    authoritative: comparison.authoritative,
    remainingUniqueRows: 0,
    consolidatedRows: comparison.candidateOnly.length,
  }
}

export async function retainDevelopmentFeedbackSheet(
  userId: string,
  candidateInput: string,
  authoritativeSpreadsheetId: string,
): Promise<DevelopmentFeedbackCleanupResult> {
  const comparison = await compareDevelopmentFeedbackSheets(userId, candidateInput)
  if (comparison.authoritative.spreadsheetId !== authoritativeSpreadsheetId) {
    throw new DevelopmentFeedbackSheetError(
      'The authoritative feedback spreadsheet changed before retention',
      'The authoritative sheet changed. Compare the sheets again before retaining this candidate.',
      409,
    )
  }

  return {
    outcome: 'retained',
    candidate: comparison.candidate,
    authoritative: comparison.authoritative,
    remainingUniqueRows: comparison.counts.candidateOnlyRows,
    consolidatedRows: 0,
  }
}

export async function cleanupDevelopmentFeedbackSheet(
  userId: string,
  candidateInput: string,
  authoritativeSpreadsheetId: string,
  outcome: Exclude<DevelopmentFeedbackCleanupOutcome, 'retained'>,
): Promise<DevelopmentFeedbackCleanupResult> {
  const comparison = await compareDevelopmentFeedbackSheets(userId, candidateInput)
  if (comparison.authoritative.spreadsheetId !== authoritativeSpreadsheetId) {
    throw new DevelopmentFeedbackSheetError(
      'The authoritative feedback spreadsheet changed before cleanup',
      'The authoritative sheet changed. Compare the sheets again before cleaning up this candidate.',
      409,
    )
  }
  if (comparison.counts.candidateOnlyRows > 0) {
    throw new DevelopmentFeedbackSheetError(
      `The candidate spreadsheet still contains ${comparison.counts.candidateOnlyRows} unique feedback rows`,
      `Review or consolidate the ${comparison.candidate.title} sheet before ${outcome === 'archived' ? 'archiving' : 'deleting'} it. It still has ${comparison.counts.candidateOnlyRows} unique feedback row${comparison.counts.candidateOnlyRows === 1 ? '' : 's'}.`,
      409,
    )
  }

  if (outcome === 'archived') {
    await updateSpreadsheetTitle(comparison.candidate.spreadsheetId, archivedSpreadsheetTitle(comparison.candidate.title))
  } else {
    await deleteFeedbackRows(comparison.candidate.spreadsheetId)
  }

  return {
    outcome,
    candidate: comparison.candidate,
    authoritative: comparison.authoritative,
    remainingUniqueRows: 0,
    consolidatedRows: 0,
  }
}

async function createFeedbackSpreadsheet() {
  const response = await sheetsRequest('/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE },
      sheets: [{
        properties: { title: SHEET_NAME },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{
            values: HEADERS.map((value) => ({
              userEnteredValue: { stringValue: value },
            })),
          }],
        }],
      }],
    }),
  })
  let spreadsheet: unknown
  try {
    spreadsheet = await response.json()
  } catch {
    throw new DevelopmentFeedbackSheetError(
      'Google Sheets create response was not valid JSON',
      'Google Sheets returned an invalid response while creating the feedback spreadsheet. Reconnect Google Sheets and try again.',
    )
  }
  if (
    !spreadsheet
    || typeof spreadsheet !== 'object'
    || typeof (spreadsheet as { spreadsheetId?: unknown }).spreadsheetId !== 'string'
    || !(spreadsheet as { spreadsheetId: string }).spreadsheetId.trim()
    || typeof (spreadsheet as { spreadsheetUrl?: unknown }).spreadsheetUrl !== 'string'
  ) {
    throw new DevelopmentFeedbackSheetError(
      'Google Sheets create response was missing spreadsheet details',
      'Google Sheets returned an incomplete response while creating the feedback spreadsheet. Reconnect Google Sheets and try again.',
    )
  }
  return spreadsheet as { spreadsheetId: string; spreadsheetUrl: string }
}

function describeSpreadsheet(
  spreadsheetId: string,
  source: DevelopmentFeedbackSpreadsheet['source'],
): DevelopmentFeedbackSpreadsheet {
  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheetUrl(spreadsheetId),
    internallyManaged: source === 'persisted',
    source,
    title: DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE,
    worksheetName: DEVELOPMENT_FEEDBACK_WORKSHEET_NAME,
  }
}

async function findSpreadsheet(
  client: Pick<Prisma.TransactionClient, 'userSetting'>,
  userId: string,
) {
  const setting = await client.userSetting.findUnique({
    where: { userId_key: { userId, key: SETTING_KEY } },
  })
  if (!setting) return null

  return describeSpreadsheet(setting.value, 'persisted')
}

function configuredSpreadsheet() {
  const configuredSpreadsheetId = process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID?.trim()
  return configuredSpreadsheetId
    ? describeSpreadsheet(configuredSpreadsheetId, 'configured')
    : null
}

export function developmentFeedbackSpreadsheetSearchUrl() {
  return `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(`"${DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE}"`)}`
}

/**
 * Returns the current authoritative sheet without creating one or contacting
 * Google. This is intentionally read-only so owners can inspect recovery
 * candidates before deciding whether to copy, consolidate, or delete anything.
 */
export async function getDevelopmentFeedbackSpreadsheet(userId: string) {
  const configured = configuredSpreadsheet()
  if (configured) return configured
  return findSpreadsheet(prisma, userId)
}

async function getOrCreateSpreadsheet(userId: string) {
  const configured = configuredSpreadsheet()
  if (configured) return configured

  const existingSpreadsheet = await findSpreadsheet(prisma, userId)
  if (existingSpreadsheet) return existingSpreadsheet

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${SETTING_KEY}:${userId}`}, 0)
      )
    `

    const spreadsheetCreatedByConcurrentRequest = await findSpreadsheet(tx, userId)
    if (spreadsheetCreatedByConcurrentRequest) {
      return spreadsheetCreatedByConcurrentRequest
    }

    const spreadsheet = await createFeedbackSpreadsheet()
    await tx.userSetting.create({
      data: { userId, key: SETTING_KEY, value: spreadsheet.spreadsheetId },
    })
    return { ...spreadsheet, internallyManaged: true }
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  })
}

async function appendRow(spreadsheetId: string, row: FeedbackRow) {
  const range = encodeURIComponent(`'${SHEET_NAME}'!A:I`)
  await sheetsRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [[
          row.submittedAt,
          'New',
          row.priority,
          row.category,
          row.summary,
          row.details,
          row.expectedOutcome,
          row.page,
          row.tester,
        ]],
      }),
    },
  )
}
export async function appendDevelopmentFeedback(userId: string, row: FeedbackRow) {
  let spreadsheet = await getOrCreateSpreadsheet(userId)
  try {
    await appendRow(spreadsheet.spreadsheetId, row)
  } catch (error) {
    if (
      !(error instanceof DevelopmentFeedbackSheetError)
      || error.status !== 404
      || !spreadsheet.internallyManaged
    ) {
      throw error
    }

    await prisma.userSetting.deleteMany({
      where: {
        userId,
        key: SETTING_KEY,
        value: spreadsheet.spreadsheetId,
      },
    })
    spreadsheet = await getOrCreateSpreadsheet(userId)
    await appendRow(spreadsheet.spreadsheetId, row)
  }
  return spreadsheet
}
