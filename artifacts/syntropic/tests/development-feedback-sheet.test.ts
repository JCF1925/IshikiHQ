import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

type ProxyCall = { connector: string; path: string; init: { body?: string; method?: string } }
const fixture = {
  responses: [] as Array<Response | Error>,
  calls: [] as ProxyCall[],
  setting: null as { value: string } | null,
  creates: [] as unknown[],
  deletes: [] as unknown[],
  transactionTail: Promise.resolve(),
}

class ReplitConnectors {
  async proxy(connector: string, path: string, init: { body?: string; method?: string }) {
    fixture.calls.push({ connector, path, init })
    const response = fixture.responses.shift()
    if (!response) throw new Error('Unexpected Google Sheets request')
    if (response instanceof Error) throw response
    return response
  }
}

const prisma = {
  userSetting: {
    findUnique: async () => fixture.setting,
    create: async (args: { data: { value: string } }) => {
      fixture.creates.push(args)
      fixture.setting = { value: args.data.value }
      return args
    },
    deleteMany: async (args: unknown) => {
      fixture.deletes.push(args)
      fixture.setting = null
      return { count: 1 }
    },
  },
  $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
    const previousTransaction = fixture.transactionTail
    let releaseTransaction!: () => void
    fixture.transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve
    })
    await previousTransaction
    try {
      return await callback({
        userSetting: prisma.userSetting,
        $executeRaw: async () => undefined,
      })
    } finally {
      releaseTransaction()
    }
  },
}

mock.module('@replit/connectors-sdk', { namedExports: { ReplitConnectors } })
mock.module('@/lib/db', { namedExports: { prisma } })

const sheetModule = import('../lib/development-feedback-sheet.ts')
const appendDevelopmentFeedback = async (
  userId: string,
  feedbackRow: typeof row,
) => (await sheetModule).appendDevelopmentFeedback(userId, feedbackRow)

const row = {
  submittedAt: '2026-09-08T12:34:56.000Z',
  priority: 'High',
  category: 'Usability',
  summary: '=unsafe summary',
  details: '+unsafe details',
  expectedOutcome: '@unsafe outcome',
  page: '/settings?token=fixture-secret',
  tester: 'tester@example.com',
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})
beforeEach(() => {
  fixture.responses = []
  fixture.calls = []
  fixture.setting = null
  fixture.creates = []
  fixture.deletes = []
  fixture.transactionTail = Promise.resolve()
  delete process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID
})

afterEach(() => {
  delete process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID
})

describe('development feedback Google Sheet', () => {
  it('creates the Improvements tab and all headers in one request', async () => {
    fixture.responses.push(
      jsonResponse({ spreadsheetId: 'created-sheet', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/created-sheet' }),
      jsonResponse({ updates: { updatedRows: 1 } }),
    )

    await appendDevelopmentFeedback('user-1', row)

    assert.equal(fixture.calls.length, 2)
    assert.equal(fixture.calls[0].connector, 'google-sheet')
    assert.equal(fixture.calls[0].path, '/v4/spreadsheets')
    const createBody = JSON.parse(fixture.calls[0].init.body ?? '{}')

    assert.equal(createBody.sheets[0].properties.title, 'Improvements')
    assert.deepEqual(
      createBody.sheets[0].data[0].rowData[0].values.map(
        (cell: { userEnteredValue: { stringValue: string } }) => cell.userEnteredValue.stringValue,
      ),
      ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester'],
    )
    assert.equal(fixture.creates.length, 1)
  })

  it('serializes concurrent first submissions onto one persisted spreadsheet', async () => {
    fixture.responses.push(
      jsonResponse({ spreadsheetId: 'authoritative-sheet', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/authoritative-sheet' }),
      jsonResponse({ updates: { updatedRows: 1 } }),
      jsonResponse({ updates: { updatedRows: 1 } }),
    )

    const [first, second] = await Promise.all([
      appendDevelopmentFeedback('user-1', row),
      appendDevelopmentFeedback('user-1', { ...row, summary: 'Concurrent report' }),
    ])

    assert.equal(fixture.calls.filter(({ path }) => path === '/v4/spreadsheets').length, 1)
    assert.equal(fixture.creates.length, 1)
    assert.equal(fixture.setting?.value, 'authoritative-sheet')
    assert.equal(first.spreadsheetId, 'authoritative-sheet')
    assert.equal(second.spreadsheetId, 'authoritative-sheet')
    assert.equal(
      fixture.calls.filter(({ path }) => path.startsWith('/v4/spreadsheets/authoritative-sheet/values/')).length,
      2,
    )
  })

  it('appends a literal sanitized row to the configured spreadsheet', async () => {
    process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID = 'configured-sheet'
    fixture.responses.push(jsonResponse({ updates: { updatedRows: 1 } }))

    await appendDevelopmentFeedback('user-1', row)

    assert.equal(fixture.calls.length, 1)
    assert.match(fixture.calls[0].path, /^\/v4\/spreadsheets\/configured-sheet\/values\//)
    assert.match(fixture.calls[0].path, /valueInputOption=RAW/)
    assert.deepEqual(JSON.parse(fixture.calls[0].init.body ?? '{}').values, [[
      row.submittedAt,
      'New',
      row.priority,
      row.category,
      row.summary,
      row.details,
      row.expectedOutcome,
      row.page,
      row.tester,
    ]])
  })

  it('reports the persisted authoritative spreadsheet without creating or contacting Google', async () => {
    fixture.setting = { value: 'authoritative-sheet' }

    const feedbackSheetModule = await sheetModule
    const spreadsheet = await feedbackSheetModule.getDevelopmentFeedbackSpreadsheet('user-1')

    assert.deepEqual(spreadsheet, {
      spreadsheetId: 'authoritative-sheet',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/authoritative-sheet',
      internallyManaged: true,
      source: 'persisted',
      title: 'Ishiki Development Improvements',
      worksheetName: 'Improvements',
    })
    assert.equal(fixture.calls.length, 0)
    assert.equal(fixture.creates.length, 0)
  })

  it('reports a configured authoritative spreadsheet before the per-user setting', async () => {
    process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID = 'configured-sheet'
    fixture.setting = { value: 'older-user-sheet' }

    const spreadsheet = await (await sheetModule).getDevelopmentFeedbackSpreadsheet('user-1')

    assert.equal(spreadsheet?.spreadsheetId, 'configured-sheet')
    assert.equal(spreadsheet?.source, 'configured')
    assert.equal(spreadsheet?.internallyManaged, false)
    assert.equal(fixture.calls.length, 0)
  })

  it('compares candidate rows read-only and preserves duplicate row differences', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    const shared = [
      '2026-09-08T12:00:00.000Z',
      'New',
      'High',
      'Usability',
      'Shared feedback',
      'Shared details',
      '',
      '/home',
      'tester@example.com',
    ]
    const authoritativeOnly = [
      '2026-09-08T12:01:00.000Z',
      'New',
      'Low',
      'Content',
      'Authoritative feedback',
      'Authoritative details',
      '',
      '/settings',
      'tester@example.com',
    ]
    const candidateOnly = [
      '2026-09-08T12:02:00.000Z',
      'New',
      'Medium',
      'Bug',
      'Candidate feedback',
      'Candidate details',
      'Expected fix',
      '/dashboard',
      'tester@example.com',
    ]
    const headers = ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester']
    const metadata = (id: string, title: string) => jsonResponse({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
      properties: { title },
      sheets: [{ properties: { title: 'Improvements' } }],
    })
    fixture.responses.push(
      metadata('authoritative-sheet', 'Authoritative feedback'),
      metadata('candidate-sheet', 'Older feedback'),
      jsonResponse({ values: [headers, shared, authoritativeOnly] }),
      jsonResponse({ values: [headers, shared, candidateOnly, candidateOnly] }),
    )

    const comparison = await (await sheetModule).compareDevelopmentFeedbackSheets(
      'user-1',
      'https://docs.google.com/spreadsheets/d/candidate-sheet/edit',
    )

    assert.equal(comparison.authoritative.title, 'Authoritative feedback')
    assert.equal(comparison.candidate.title, 'Older feedback')
    assert.deepEqual(comparison.counts, {
      authoritativeRows: 2,
      candidateRows: 3,
      matchingRows: 1,
      candidateOnlyRows: 2,
      authoritativeOnlyRows: 1,
    })
    assert.deepEqual(comparison.candidateOnly.map((row) => row.summary), ['Candidate feedback', 'Candidate feedback'])
    assert.deepEqual(comparison.authoritativeOnly.map((row) => row.summary), ['Authoritative feedback'])
    assert.equal(fixture.creates.length, 0)
    assert.equal(fixture.deletes.length, 0)
    assert.equal(fixture.calls.length, 4)
    assert.ok(fixture.calls.every((call) => call.init.method === 'GET'))
  })

  it('rejects comparing a spreadsheet without the Improvements tab', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    fixture.responses.push(jsonResponse({
      spreadsheetId: 'authoritative-sheet',
      properties: { title: 'Authoritative feedback' },
      sheets: [{ properties: { title: 'Improvements' } }],
    }), jsonResponse({
      spreadsheetId: 'candidate-sheet',
      properties: { title: 'Unrelated sheet' },
      sheets: [{ properties: { title: 'Responses' } }],
    }), jsonResponse({ values: [] }), jsonResponse({ values: [] }))

    await assert.rejects(
      (await sheetModule).compareDevelopmentFeedbackSheets('user-1', 'candidate-sheet'),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        const sheetError = error as Error & { publicMessage: string; status?: number }
        assert.equal(sheetError.status, 400)
        assert.match(sheetError.publicMessage, /Improvements tab/i)
        return true
      },
    )
    assert.equal(fixture.creates.length, 0)
    assert.equal(fixture.deletes.length, 0)
  })

  it('recovers selected candidate-only rows and reports rows already present', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    const headers = ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester']
    const shared = ['2026-09-01', 'New', 'Medium', 'Bug', 'Shared', 'Shared details', '', '/dashboard', 'owner']
    const missing = ['2026-09-02', 'Triaged', 'High', 'Bug', 'Missing', 'Missing details', 'Fix it', '/health', 'owner']
    const metadata = (id: string, title: string) => jsonResponse({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
      properties: { title },
      sheets: [{ properties: { title: 'Improvements' } }],
    })
    fixture.responses.push(
      metadata('authoritative-sheet', 'Authoritative feedback'),
      metadata('candidate-sheet', 'Older feedback'),
      jsonResponse({ values: [headers, shared] }),
      jsonResponse({ values: [headers, shared, missing] }),
      jsonResponse({ values: [headers, shared, missing] }),
      jsonResponse({ updates: { updatedRows: 1 } }),
    )

    const result = await (await sheetModule).recoverDevelopmentFeedbackRows(
      'user-1',
      'candidate-sheet',
      'authoritative-sheet',
      [2, 3],
    )

    assert.deepEqual(result.recoveredRowNumbers, [3])
    assert.deepEqual(result.duplicateRowNumbers, [2])
    assert.equal(result.candidatePreserved, true)
    assert.equal(fixture.calls.filter((call) => call.init.method === 'POST').length, 1)
    assert.deepEqual(JSON.parse(fixture.calls.at(-1)?.init.body ?? '{}').values, [missing])
    assert.equal(fixture.deletes.length, 0)
  })

  it('consolidates all remaining candidate-only rows without deleting the candidate', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    const headers = ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester']
    const shared = ['2026-09-01', 'New', 'Medium', 'Bug', 'Shared', 'Shared details', '', '/dashboard', 'owner']
    const missing = ['2026-09-02', 'Triaged', 'High', 'Bug', 'Missing', 'Missing details', 'Fix it', '/health', 'owner']
    const metadata = (id: string, title: string) => jsonResponse({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
      properties: { title },
      sheets: [{ properties: { title: 'Improvements' } }],
    })
    fixture.responses.push(
      metadata('authoritative-sheet', 'Authoritative feedback'),
      metadata('candidate-sheet', 'Older feedback'),
      jsonResponse({ values: [headers, shared] }),
      jsonResponse({ values: [headers, shared, missing] }),
      jsonResponse({ updates: { updatedRows: 1 } }),
    )

    const result = await (await sheetModule).consolidateDevelopmentFeedbackSheet(
      'user-1',
      'candidate-sheet',
      'authoritative-sheet',
    )

    assert.equal(result.outcome, 'retained')
    assert.equal(result.consolidatedRows, 1)
    assert.equal(result.remainingUniqueRows, 0)
    assert.deepEqual(JSON.parse(fixture.calls.at(-1)?.init.body ?? '{}').values, [missing])
    assert.equal(fixture.deletes.length, 0)
  })

  it('archives a candidate only after the live comparison has no unique rows', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    const headers = ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester']
    const shared = ['2026-09-01', 'New', 'Medium', 'Bug', 'Shared', 'Shared details', '', '/dashboard', 'owner']
    const metadata = (id: string, title: string) => jsonResponse({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
      properties: { title },
      sheets: [{ properties: { title: 'Improvements' } }],
    })
    fixture.responses.push(
      metadata('authoritative-sheet', 'Authoritative feedback'),
      metadata('candidate-sheet', 'Older feedback'),
      jsonResponse({ values: [headers, shared] }),
      jsonResponse({ values: [headers, shared] }),
      jsonResponse({ spreadsheetId: 'candidate-sheet' }),
    )

    const result = await (await sheetModule).cleanupDevelopmentFeedbackSheet(
      'user-1',
      'candidate-sheet',
      'authoritative-sheet',
      'archived',
    )

    assert.equal(result.outcome, 'archived')
    assert.equal(fixture.calls.at(-1)?.path, '/v4/spreadsheets/candidate-sheet:batchUpdate')
    assert.deepEqual(JSON.parse(fixture.calls.at(-1)?.init.body ?? '{}'), {
      requests: [{
        updateSpreadsheetProperties: {
          properties: { title: '[Archived] Older feedback' },
          fields: 'title',
        },
      }],
    })
  })

  it('blocks archive and delete while a candidate still has unique rows', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    const headers = ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester']
    const missing = ['2026-09-02', 'Triaged', 'High', 'Bug', 'Missing', 'Missing details', 'Fix it', '/health', 'owner']
    const metadata = (id: string, title: string) => jsonResponse({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
      properties: { title },
      sheets: [{ properties: { title: 'Improvements' } }],
    })
    fixture.responses.push(
      metadata('authoritative-sheet', 'Authoritative feedback'),
      metadata('candidate-sheet', 'Older feedback'),
      jsonResponse({ values: [headers] }),
      jsonResponse({ values: [headers, missing] }),
    )

    await assert.rejects(
      (await sheetModule).cleanupDevelopmentFeedbackSheet(
        'user-1',
        'candidate-sheet',
        'authoritative-sheet',
        'deleted',
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        const sheetError = error as Error & { status?: number; publicMessage: string }
        assert.equal(sheetError.status, 409)
        assert.match(sheetError.publicMessage, /Older feedback.*still has 1 unique feedback row/i)
        return true
      },
    )
    assert.equal(fixture.calls.length, 4)
  })

  it('deletes only candidate feedback rows after proving they are all present authoritatively', async () => {
    fixture.setting = { value: 'authoritative-sheet' }
    const headers = ['Submitted at', 'Status', 'Priority', 'Category', 'Summary', 'Details', 'Expected outcome', 'Page', 'Tester']
    const shared = ['2026-09-01', 'New', 'Medium', 'Bug', 'Shared', 'Shared details', '', '/dashboard', 'owner']
    const metadata = (id: string, title: string) => jsonResponse({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
      properties: { title },
      sheets: [{ properties: { title: 'Improvements' } }],
    })
    fixture.responses.push(
      metadata('authoritative-sheet', 'Authoritative feedback'),
      metadata('candidate-sheet', 'Older feedback'),
      jsonResponse({ values: [headers, shared] }),
      jsonResponse({ values: [headers, shared] }),
      jsonResponse({ clearedRange: "'Improvements'!A2:I" }),
    )

    const result = await (await sheetModule).cleanupDevelopmentFeedbackSheet(
      'user-1',
      'candidate-sheet',
      'authoritative-sheet',
      'deleted',
    )

    assert.equal(result.outcome, 'deleted')
    assert.match(fixture.calls.at(-1)?.path ?? '', /\/values\/.*:clear$/)
    assert.equal(fixture.calls.at(-1)?.init.method, 'POST')
    assert.deepEqual(JSON.parse(fixture.calls.at(-1)?.init.body ?? '{}'), {})
  })

  it('never cleans up the authoritative spreadsheet', async () => {
    fixture.setting = { value: 'authoritative-sheet' }

    await assert.rejects(
      (await sheetModule).cleanupDevelopmentFeedbackSheet(
        'user-1',
        'authoritative-sheet',
        'authoritative-sheet',
        'deleted',
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        const sheetError = error as Error & { status?: number; publicMessage: string }
        assert.equal(sheetError.status, 400)
        assert.match(sheetError.publicMessage, /older candidate spreadsheet/i)
        return true
      },
    )
    assert.equal(fixture.calls.length, 0)
  })

  it('replaces a deleted internally managed spreadsheet and retries once', async () => {
    fixture.setting = { value: 'deleted-sheet' }
    fixture.responses.push(
      jsonResponse({ error: 'not found' }, 404),
      jsonResponse({ spreadsheetId: 'replacement-sheet', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/replacement-sheet' }),
      jsonResponse({ updates: { updatedRows: 1 } }),
    )

    const spreadsheet = await appendDevelopmentFeedback('user-1', row)

    assert.equal(spreadsheet.spreadsheetId, 'replacement-sheet')
    assert.match(fixture.calls[0].path, /^\/v4\/spreadsheets\/deleted-sheet\/values\//)
    assert.equal(fixture.calls[1].path, '/v4/spreadsheets')
    assert.match(fixture.calls[2].path, /^\/v4\/spreadsheets\/replacement-sheet\/values\//)
    assert.equal(fixture.deletes.length, 1)
    assert.deepEqual(fixture.deletes[0], {
      where: {
        userId: 'user-1',
        key: '_internal_development_feedback_spreadsheet_id',
        value: 'deleted-sheet',
      },
    })
    assert.equal(fixture.creates.length, 1)
  })

  it('does not replace an explicitly configured spreadsheet after a 404', async () => {
    process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID = 'configured-sheet'
    fixture.responses.push(jsonResponse({ error: 'not found' }, 404))

    await assert.rejects(
      appendDevelopmentFeedback('user-1', row),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        const sheetError = error as Error & { publicMessage: string }
        assert.match(sheetError.publicMessage, /check FEEDBACK_GOOGLE_SPREADSHEET_ID/i)
        return true
      },
    )

    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.deletes.length, 0)
    assert.equal(fixture.creates.length, 0)
  })

  it('does not replace an internally managed spreadsheet after a 403', async () => {
    fixture.setting = { value: 'managed-sheet' }
    fixture.responses.push(jsonResponse({ error: 'access temporarily denied' }, 403))

    await assert.rejects(
      appendDevelopmentFeedback('user-1', row),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.name, 'DevelopmentFeedbackSheetError')
        const sheetError = error as Error & { publicMessage: string }
        assert.match(sheetError.publicMessage, /denied access/i)
        return true
      },
    )

    assert.equal(fixture.calls.length, 1)
    assert.match(fixture.calls[0].path, /^\/v4\/spreadsheets\/managed-sheet\/values\//)
    assert.deepEqual(fixture.setting, { value: 'managed-sheet' })
    assert.equal(fixture.deletes.length, 0)
    assert.equal(fixture.creates.length, 0)
  })

  for (const status of [429, 500, 503] as const) {
    it(`does not replace an internally managed spreadsheet after a ${status}`, async () => {
      fixture.setting = { value: 'managed-sheet' }
      fixture.responses.push(jsonResponse({
        error: `temporary Google failure with fixture credential and ${row.summary}`,
      }, status))

      await assert.rejects(
        appendDevelopmentFeedback('user-1', row),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.name, 'DevelopmentFeedbackSheetError')
          const sheetError = error as Error & { publicMessage: string }
          assert.equal(
            sheetError.publicMessage,
            'Google Sheets could not save the improvement. Check the Google Sheets connection and try again.',
          )
          assert.doesNotMatch(
            sheetError.message + sheetError.publicMessage,
            /fixture credential|unsafe summary/,
          )
          return true
        },
      )

      assert.equal(fixture.calls.length, 1)
      assert.match(fixture.calls[0].path, /^\/v4\/spreadsheets\/managed-sheet\/values\//)
      assert.deepEqual(fixture.setting, { value: 'managed-sheet' })
      assert.equal(fixture.deletes.length, 0)
      assert.equal(fixture.creates.length, 0)
    })
  }

  for (const [failure, providerText] of [
    ['timeout', 'ETIMEDOUT calling https://sheets.googleapis.test with fixture credential'],
    ['transport rejection', `socket closed while sending ${JSON.stringify(row)}`],
  ] as const) {
    it(`retains the internally managed spreadsheet after a pre-response ${failure}`, async () => {
      fixture.setting = { value: 'managed-sheet-secret-id' }
      fixture.responses.push(new Error(providerText))

      await assert.rejects(
        appendDevelopmentFeedback('user-1', row),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.name, 'DevelopmentFeedbackSheetError')
          const sheetError = error as Error & { publicMessage: string; status?: number }
          assert.equal(
            sheetError.publicMessage,
            'Google Sheets could not save the improvement. Check the Google Sheets connection and try again.',
          )
          assert.equal(sheetError.status, undefined)
          assert.doesNotMatch(
            sheetError.message + sheetError.publicMessage,
            /managed-sheet-secret-id|sheets\.googleapis|fixture credential|unsafe summary|unsafe details|socket closed|ETIMEDOUT/i,
          )
          return true
        },
      )

      assert.equal(fixture.calls.length, 1)
      assert.match(fixture.calls[0].path, /^\/v4\/spreadsheets\/managed-sheet-secret-id\/values\//)
      assert.deepEqual(fixture.setting, { value: 'managed-sheet-secret-id' })
      assert.equal(fixture.deletes.length, 0)
      assert.equal(fixture.creates.length, 0)
      assert.equal(fixture.calls.filter(({ path }) => path === '/v4/spreadsheets').length, 0)
    })
  }

  for (const [status, expected] of [
    [404, 'not found'],
    [403, 'denied access'],
  ] as const) {
    it(`turns Google ${status} responses into safe actionable errors`, async () => {
      process.env.FEEDBACK_GOOGLE_SPREADSHEET_ID = 'configured-sheet'
      fixture.responses.push(jsonResponse({
        error: `fixture credential and ${row.summary} ${row.details}`,
      }, status))

      await assert.rejects(
        appendDevelopmentFeedback('user-1', row),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.name, 'DevelopmentFeedbackSheetError')
          const sheetError = error as Error & { publicMessage: string }
          assert.match(sheetError.publicMessage, new RegExp(expected, 'i'))
          assert.doesNotMatch(sheetError.message + sheetError.publicMessage, /fixture credential|unsafe summary|unsafe details/)
          return true
        },
      )
    })
  }

  it('rejects malformed create responses without persisting or exposing feedback', async () => {
    fixture.responses.push(jsonResponse({ spreadsheetUrl: row.details }))

    await assert.rejects(
      appendDevelopmentFeedback('user-1', row),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.name, 'DevelopmentFeedbackSheetError')
        const sheetError = error as Error & { publicMessage: string }
        assert.match(sheetError.publicMessage, /incomplete response/i)
        assert.doesNotMatch(sheetError.message + sheetError.publicMessage, /unsafe details/)
        return true
      },
    )
    assert.equal(fixture.creates.length, 0)
  })
})
