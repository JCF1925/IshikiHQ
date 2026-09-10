import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

const fixture = {
  session: { user: { id: 'owner-1', email: 'owner@example.com' } } as { user: { id?: string; email?: string } } | null,
  authoritative: {
    spreadsheetId: 'authoritative-sheet',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/authoritative-sheet',
    source: 'persisted' as const,
    title: 'Ishiki Development Improvements' as const,
    worksheetName: 'Improvements' as const,
  } as {
    spreadsheetId: string
    spreadsheetUrl: string
    source: 'persisted' | 'configured'
    title: 'Ishiki Development Improvements'
    worksheetName: 'Improvements'
  } | null,
  lookupCalls: 0,
  appendError: null as Error | null,
  appendCalls: 0,
  recoveryCalls: [] as unknown[][],
  cleanupCalls: [] as unknown[][],
}

const auth = async () => fixture.session
const getDevelopmentFeedbackSpreadsheet = async () => {
  fixture.lookupCalls += 1
  return fixture.authoritative
}
const appendDevelopmentFeedback = async () => {
  fixture.appendCalls += 1
  if (fixture.appendError) throw fixture.appendError
  return fixture.authoritative
}
const recoverDevelopmentFeedbackRows = async (...args: unknown[]) => {
  fixture.recoveryCalls.push(args)
  return {
    requestedRows: 2,
    recoveredRows: 1,
    duplicateRows: 1,
    recoveredRowNumbers: [3],
    duplicateRowNumbers: [2],
    candidatePreserved: true,
  }
}
const consolidateDevelopmentFeedbackSheet = async (...args: unknown[]) => {
  fixture.cleanupCalls.push(['consolidate', ...args])
  return {
    outcome: 'retained',
    candidate: { title: 'Older feedback sheet' },
    authoritative: { title: 'Ishiki Development Improvements' },
    remainingUniqueRows: 0,
    consolidatedRows: 2,
  }
}
const retainDevelopmentFeedbackSheet = async (...args: unknown[]) => {
  fixture.cleanupCalls.push(['retained', ...args])
  return {
    outcome: 'retained',
    candidate: { title: 'Older feedback sheet' },
    authoritative: { title: 'Ishiki Development Improvements' },
    remainingUniqueRows: 0,
    consolidatedRows: 0,
  }
}
const cleanupDevelopmentFeedbackSheet = async (...args: unknown[]) => {
  fixture.cleanupCalls.push(['cleanup', ...args])
  return {
    outcome: args.at(-1),
    candidate: { title: 'Older feedback sheet' },
    authoritative: { title: 'Ishiki Development Improvements' },
    remainingUniqueRows: 0,
    consolidatedRows: 0,
  }
}
const developmentFeedbackSpreadsheetSearchUrl = () =>
  'https://drive.google.com/drive/u/0/search?q=%22Ishiki%20Development%20Improvements%22'
const DevelopmentFeedbackSheetError = class extends Error {}

mock.module('@/auth', { namedExports: { auth } })
mock.module('@/lib/development-feedback-sheet', {
  namedExports: {
    appendDevelopmentFeedback,
    developmentFeedbackSpreadsheetSearchUrl,
    DevelopmentFeedbackSheetError,
    DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE: 'Ishiki Development Improvements',
    DEVELOPMENT_FEEDBACK_WORKSHEET_NAME: 'Improvements',
    getDevelopmentFeedbackSpreadsheet,
    recoverDevelopmentFeedbackRows,
    consolidateDevelopmentFeedbackSheet,
    retainDevelopmentFeedbackSheet,
    cleanupDevelopmentFeedbackSheet,
  },
})

const routeModule = import('../app/api/development-feedback/route.ts')

beforeEach(() => {
  Reflect.set(process.env, 'NODE_ENV', 'development')
  fixture.session = { user: { id: 'owner-1', email: 'owner@example.com' } }
  fixture.authoritative = {
    spreadsheetId: 'authoritative-sheet',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/authoritative-sheet',
    source: 'persisted',
    title: 'Ishiki Development Improvements',
    worksheetName: 'Improvements',
  }
  fixture.lookupCalls = 0
  fixture.appendError = null
  fixture.appendCalls = 0
  fixture.recoveryCalls = []
  fixture.cleanupCalls = []
})

afterEach(() => {
  Reflect.deleteProperty(process.env, 'NODE_ENV')
})

describe('development feedback lookup route', () => {
  it('returns the owner sheet and complete recovery guidance in development', async () => {
    const { GET } = await routeModule
    const response = await GET(new Request('http://feedback.test/api/development-feedback'))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      authoritative: fixture.authoritative,
      likelyOlderSheets: {
        title: 'Ishiki Development Improvements',
        worksheetName: 'Improvements',
        searchUrl: 'https://drive.google.com/drive/u/0/search?q=%22Ishiki%20Development%20Improvements%22',
        guidance: 'Search Google Drive for the exact title, then compare each Improvements tab with the authoritative sheet before recovering any rows.',
      },
      recovery: {
        preservesRows: true,
        requiresExplicitConfirmation: true,
        guidance: 'Do not delete or consolidate a candidate automatically. Review and copy any missing rows to the authoritative sheet first, then get explicit owner confirmation before any deletion or consolidation.',
      },
      cleanup: {
        requiresExplicitConfirmation: true,
        requiresZeroCandidateOnlyRows: true,
        outcomes: ['retained', 'archived', 'deleted'],
        guidance: 'Cleanup rechecks the live comparison. Consolidation and cleanup are separate confirmations; the authoritative sheet can never be cleaned up.',
      },
    })
    assert.equal(fixture.lookupCalls, 1)
  })

  it('rejects unauthenticated lookup requests before touching the sheet', async () => {
    fixture.session = null

    const { GET } = await routeModule
    const response = await GET(new Request('http://feedback.test/api/development-feedback'))

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), {
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    })
    assert.equal(fixture.lookupCalls, 0)
  })

  it('hides the lookup endpoint outside development', async () => {
    Reflect.set(process.env, 'NODE_ENV', 'production')

    const { GET } = await routeModule
    const response = await GET(new Request('http://feedback.test/api/development-feedback'))

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'Development feedback is not available' },
    })
    assert.equal(fixture.lookupCalls, 0)
  })
})

describe('development feedback submission route', () => {
  it('returns and logs a safe contract when Google rejects before responding', async () => {
    const sensitive = 'ETIMEDOUT https://sheets.googleapis.test/secret-sheet fixture-credential request-body'
    fixture.appendError = new Error(sensitive)
    const logged: unknown[][] = []
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      logged.push(args)
    }

    try {
      const { POST } = await routeModule
      const response = await POST(new Request('http://feedback.test/api/development-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          priority: 'high',
          category: 'improvement',
          summary: 'Safe summary',
          details: 'Safe details',
          expectedOutcome: 'Safe outcome',
          page: '/dashboard',
        }),
      }))
      const responseBody = await response.json()
      const diagnostics = JSON.stringify({ logged, responseBody })

      assert.equal(response.status, 502)
      assert.deepEqual(responseBody, {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Could not save the improvement to Google Sheets',
        },
      })
      assert.deepEqual(logged, [['Development feedback submission failed']])
      assert.doesNotMatch(
        diagnostics,
        /secret-sheet|sheets\.googleapis|fixture-credential|request-body|ETIMEDOUT/i,
      )
      assert.equal(fixture.appendCalls, 1)
    } finally {
      console.error = originalConsoleError
    }
  })
})

describe('development feedback recovery route', () => {
  it('requires explicit confirmation and passes selected rows to the guarded recovery', async () => {
    const { PATCH } = await routeModule
    const response = await PATCH(new Request('http://feedback.test/api/development-feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'recover',
        candidateSpreadsheetId: 'candidate-sheet',
        authoritativeSpreadsheetId: 'authoritative-sheet',
        selectedRowNumbers: [2, 3],
        confirmed: true,
      }),
    }))

    assert.equal(response.status, 200)
    assert.equal(fixture.recoveryCalls.length, 1)
    assert.deepEqual(fixture.recoveryCalls[0], [
      'owner-1',
      'candidate-sheet',
      'authoritative-sheet',
      [2, 3],
    ])
    assert.deepEqual(await response.json(), {
      recovery: {
        requestedRows: 2,
        recoveredRows: 1,
        duplicateRows: 1,
        recoveredRowNumbers: [3],
        duplicateRowNumbers: [2],
        candidatePreserved: true,
      },
    })
  })

  it('rejects recovery without confirmation', async () => {
    const { PATCH } = await routeModule
    const response = await PATCH(new Request('http://feedback.test/api/development-feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'recover',
        candidateSpreadsheetId: 'candidate-sheet',
        authoritativeSpreadsheetId: 'authoritative-sheet',
        selectedRowNumbers: [3],
        confirmed: false,
      }),
    }))

    assert.equal(response.status, 400)
    assert.equal(fixture.recoveryCalls.length, 0)
  })

  it('requires a separate confirmation for consolidation', async () => {
    const { PATCH } = await routeModule
    const response = await PATCH(new Request('http://feedback.test/api/development-feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'consolidate',
        candidateSpreadsheetId: 'candidate-sheet',
        authoritativeSpreadsheetId: 'authoritative-sheet',
        confirmed: false,
      }),
    }))

    assert.equal(response.status, 400)
    assert.equal(fixture.cleanupCalls.length, 0)
  })

  it('routes cleanup outcomes independently and names the requested disposition', async () => {
    const { PATCH } = await routeModule
    const response = await PATCH(new Request('http://feedback.test/api/development-feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'cleanup',
        candidateSpreadsheetId: 'candidate-sheet',
        authoritativeSpreadsheetId: 'authoritative-sheet',
        outcome: 'archived',
        confirmed: true,
      }),
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(fixture.cleanupCalls[0], [
      'cleanup',
      'owner-1',
      'candidate-sheet',
      'authoritative-sheet',
      'archived',
    ])
    assert.equal((await response.json()).cleanup.outcome, 'archived')
  })

  it('rejects cleanup without explicit confirmation', async () => {
    const { PATCH } = await routeModule
    const response = await PATCH(new Request('http://feedback.test/api/development-feedback', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'cleanup',
        candidateSpreadsheetId: 'candidate-sheet',
        authoritativeSpreadsheetId: 'authoritative-sheet',
        outcome: 'deleted',
        confirmed: false,
      }),
    }))

    assert.equal(response.status, 400)
    assert.equal(fixture.cleanupCalls.length, 0)
  })
})