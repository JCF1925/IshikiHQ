export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { z } from 'zod'
import {
  appendDevelopmentFeedback,
  compareDevelopmentFeedbackSheets,
  cleanupDevelopmentFeedbackSheet,
  consolidateDevelopmentFeedbackSheet,
  developmentFeedbackSpreadsheetSearchUrl,
  DevelopmentFeedbackSheetError,
  DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE,
  DEVELOPMENT_FEEDBACK_WORKSHEET_NAME,
  getDevelopmentFeedbackSpreadsheet,
  recoverDevelopmentFeedbackRows,
  retainDevelopmentFeedbackSheet,
} from '@/lib/development-feedback-sheet'
import { developmentFeedbackSchema } from '@/lib/validation'

const recoverySchema = z.object({
  action: z.literal('recover'),
  candidateSpreadsheetId: z.string().trim().min(1),
  authoritativeSpreadsheetId: z.string().trim().min(1),
  selectedRowNumbers: z.array(z.number().int().positive()).min(1).max(500)
    .refine((rows) => new Set(rows).size === rows.length, 'Selected rows must be unique'),
  confirmed: z.literal(true),
})

const consolidationSchema = z.object({
  action: z.literal('consolidate'),
  candidateSpreadsheetId: z.string().trim().min(1),
  authoritativeSpreadsheetId: z.string().trim().min(1),
  confirmed: z.literal(true),
})

const cleanupSchema = z.object({
  action: z.enum(['cleanup', 'retire']),
  candidateSpreadsheetId: z.string().trim().min(1),
  authoritativeSpreadsheetId: z.string().trim().min(1),
  outcome: z.enum(['retained', 'archived', 'deleted']),
  confirmed: z.literal(true),
})

const patchSchema = z.union([
  recoverySchema,
  consolidationSchema,
  cleanupSchema,
])

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return apiError('NOT_FOUND', 'Development feedback is not available', 404)
  }

  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const parsed = await parseBody(request, developmentFeedbackSchema)
  if (!parsed.success) return parsed.response

  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const sheet = await appendDevelopmentFeedback(userId, {
      ...parsed.data,
      expectedOutcome: parsed.data.expectedOutcome ?? '',
      submittedAt: new Date().toISOString(),
      tester: session.user.email ?? session.user.name ?? userId,
    })
    return apiSuccess({ submitted: true, spreadsheetUrl: sheet.spreadsheetUrl })
  } catch (error) {
    console.error('Development feedback submission failed')
    const message = error instanceof DevelopmentFeedbackSheetError
      ? error.publicMessage
      : 'Could not save the improvement to Google Sheets'
    return apiError('INTERNAL_ERROR', message, 502)
  }
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return apiError('NOT_FOUND', 'Development feedback is not available', 404)
  }

  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const requestUrl = new URL(request.url)
    const candidateSpreadsheetId = requestUrl.searchParams.get('candidateSpreadsheetId')?.trim()
    if (candidateSpreadsheetId) {
      const comparison = await compareDevelopmentFeedbackSheets(userId, candidateSpreadsheetId)
      return apiSuccess({
        comparison,
        recovery: {
          preservesRows: true,
          requiresExplicitConfirmation: true,
          guidance: 'This comparison is read-only. Keep both sheets intact; any future copy, consolidation, or deletion must be explicitly confirmed by the owner after reviewing these differences.',
        },
      })
    }

    const authoritative = await getDevelopmentFeedbackSpreadsheet(userId)
    return apiSuccess({
      authoritative: authoritative
        ? {
            spreadsheetId: authoritative.spreadsheetId,
            spreadsheetUrl: authoritative.spreadsheetUrl,
            source: authoritative.source,
            title: authoritative.title,
            worksheetName: authoritative.worksheetName,
          }
        : null,
      likelyOlderSheets: {
        title: DEVELOPMENT_FEEDBACK_SPREADSHEET_TITLE,
        worksheetName: DEVELOPMENT_FEEDBACK_WORKSHEET_NAME,
        searchUrl: developmentFeedbackSpreadsheetSearchUrl(),
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
  } catch (error) {
    console.error('Development feedback spreadsheet lookup failed')
    if (error instanceof DevelopmentFeedbackSheetError && error.status === 400) {
      return apiError('VALIDATION_ERROR', error.publicMessage, 400)
    }
    const message = error instanceof DevelopmentFeedbackSheetError
      ? error.publicMessage
      : 'Could not look up the development feedback spreadsheet'
    return apiError('INTERNAL_ERROR', message, 502)
  }
}

export async function PATCH(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return apiError('NOT_FOUND', 'Development feedback is not available', 404)
  }

  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as { id?: string }).id
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const parsed = await parseBody(request, patchSchema)
  if (!parsed.success) return parsed.response

  try {
    if (parsed.data.action === 'recover') {
      const recovery = await recoverDevelopmentFeedbackRows(
        userId,
        parsed.data.candidateSpreadsheetId,
        parsed.data.authoritativeSpreadsheetId,
        parsed.data.selectedRowNumbers,
      )
      return apiSuccess({ recovery })
    }
    if (parsed.data.action === 'consolidate') {
      const cleanup = await consolidateDevelopmentFeedbackSheet(
        userId,
        parsed.data.candidateSpreadsheetId,
        parsed.data.authoritativeSpreadsheetId,
      )
      return apiSuccess({ cleanup })
    }

    const cleanup = parsed.data.outcome === 'retained'
      ? await retainDevelopmentFeedbackSheet(
          userId,
          parsed.data.candidateSpreadsheetId,
          parsed.data.authoritativeSpreadsheetId,
        )
      : await cleanupDevelopmentFeedbackSheet(
          userId,
          parsed.data.candidateSpreadsheetId,
          parsed.data.authoritativeSpreadsheetId,
          parsed.data.outcome,
        )
    return apiSuccess({ cleanup })
  } catch (error) {
    console.error('Development feedback maintenance failed')
    if (error instanceof DevelopmentFeedbackSheetError && error.status === 400) {
      return apiError('VALIDATION_ERROR', error.publicMessage, 400)
    }
    if (error instanceof DevelopmentFeedbackSheetError && error.status === 409) {
      return apiError('CONFLICT', error.publicMessage, 409)
    }
    const message = error instanceof DevelopmentFeedbackSheetError
      ? error.publicMessage
      : 'Could not update the feedback sheet'
    return apiError('INTERNAL_ERROR', message, 502)
  }
}
