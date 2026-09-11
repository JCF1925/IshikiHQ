type AnalyticsData = Record<string, string | number | boolean>

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void
    }
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return

  try {
    window.umami?.track(name, data)
  } catch {
    // Analytics must never interrupt the user flow.
  }
}

export function trackStudyImportPreview(data: {
  outcome: 'ready' | 'blocked' | 'request_failed'
  totalRows: number
  validRows: number
  duplicateRows: number
  errorRows: number
  canCommit: boolean
}): void {
  trackEvent('study_import_preview', {
    outcome: data.outcome,
    total_rows: data.totalRows,
    valid_rows: data.validRows,
    duplicate_rows: data.duplicateRows,
    error_rows: data.errorRows,
    can_commit: data.canCommit,
  })
}

export function trackStudyImportCommit(data: {
  createdCount: number
  skippedCount: number
  totalCount: number
}): void {
  trackEvent('study_import_commit', {
    created_count: data.createdCount,
    skipped_count: data.skippedCount,
    total_count: data.totalCount,
  })
}