'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Archive, CheckCircle2, ExternalLink, GitCompareArrows, Lightbulb, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ApiErrorResponse = { error?: { message?: string } }
type FeedbackDifferenceRow = {
  rowNumber: number
  submittedAt: string
  status: string
  priority: string
  category: string
  summary: string
  details: string
  expectedOutcome: string
  page: string
  tester: string
}
type FeedbackComparison = {
  authoritative: {
    spreadsheetId: string
    spreadsheetUrl: string
    source: 'persisted' | 'configured'
    internallyManaged: boolean
    title: string
    worksheetName: string
    rowCount: number
  }
  candidate: {
    spreadsheetId: string
    spreadsheetUrl: string
    source: string
    internallyManaged: boolean
    title: string
    worksheetName: string
    rowCount: number
  }
  counts: {
    authoritativeRows: number
    candidateRows: number
    matchingRows: number
    candidateOnlyRows: number
    authoritativeOnlyRows: number
  }
  candidateOnly: FeedbackDifferenceRow[]
  authoritativeOnly: FeedbackDifferenceRow[]
}
type FeedbackCleanupOutcome = 'retained' | 'archived' | 'deleted'
type FeedbackCleanupResult = {
  outcome: FeedbackCleanupOutcome
  candidate: FeedbackComparison['candidate']
  authoritative: FeedbackComparison['authoritative']
  remainingUniqueRows: number
  consolidatedRows: number
}
type FeedbackSheetStatus = {
  authoritative: {
    spreadsheetUrl: string
    source: 'persisted' | 'configured'
    title: string
    worksheetName: string
  } | null
  likelyOlderSheets: {
    searchUrl: string
    title: string
    worksheetName: string
    guidance: string
  }
  recovery: {
    preservesRows: boolean
    requiresExplicitConfirmation: boolean
    guidance: string
  }
  cleanup: {
    requiresExplicitConfirmation: boolean
    requiresZeroCandidateOnlyRows: boolean
    outcomes: FeedbackCleanupOutcome[]
    guidance: string
  }
}

function FeedbackDifferenceTable({
  title,
  rows,
  emptyMessage,
  selectedRowNumbers,
  onSelectionChange,
}: {
  title: string
  rows: FeedbackDifferenceRow[]
  emptyMessage: string
  selectedRowNumbers?: Set<number>
  onSelectionChange?: (rowNumber: number, selected: boolean) => void
}) {
  const selectable = Boolean(selectedRowNumbers && onSelectionChange)
  const allSelected = selectable && rows.length > 0 && rows.every((row) => selectedRowNumbers?.has(row.rowNumber) === true)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Badge variant={rows.length ? 'secondary' : 'outline'}>{rows.length}</Badge>
      </div>
      {!rows.length ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => rows.forEach((row) => onSelectionChange?.(row.rowNumber, checked === true))}
                      aria-label="Select all candidate-only rows"
                    />
                  </TableHead>
                )}
                <TableHead className="w-16">Row</TableHead>
                <TableHead className="min-w-48">Summary</TableHead>
                <TableHead className="min-w-32">Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="min-w-56">Details</TableHead>
                <TableHead className="min-w-44">Expected outcome</TableHead>
                <TableHead className="min-w-40">Page</TableHead>
                <TableHead className="min-w-40">Tester</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.rowNumber}-${row.submittedAt}-${row.summary}`}>
                  {selectable && (
                    <TableCell className="align-top">
                      <Checkbox
                        checked={selectedRowNumbers?.has(row.rowNumber)}
                        onCheckedChange={(checked) => onSelectionChange?.(row.rowNumber, checked === true)}
                        aria-label={`Select candidate row ${row.rowNumber}: ${row.summary || 'Untitled feedback'}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="align-top text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                  <TableCell className="max-w-72 align-top whitespace-normal font-medium">{row.summary || '—'}</TableCell>
                  <TableCell className="align-top whitespace-nowrap text-xs">{row.submittedAt || '—'}</TableCell>
                  <TableCell className="align-top">{row.status || '—'}</TableCell>
                  <TableCell className="align-top">{row.priority || '—'}</TableCell>
                  <TableCell className="align-top">{row.category || '—'}</TableCell>
                  <TableCell className="max-w-80 align-top whitespace-normal text-xs">{row.details || '—'}</TableCell>
                  <TableCell className="max-w-64 align-top whitespace-normal text-xs">{row.expectedOutcome || '—'}</TableCell>
                  <TableCell className="max-w-56 align-top whitespace-normal text-xs">{row.page || '—'}</TableCell>
                  <TableCell className="max-w-48 align-top whitespace-normal text-xs">{row.tester || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function FeedbackComparisonView({
  comparison,
  selectedRowNumbers,
  onSelectionChange,
  onRecover,
  onConsolidate,
  onCleanup,
}: {
  comparison: FeedbackComparison
  selectedRowNumbers: Set<number>
  onSelectionChange: (rowNumber: number, selected: boolean) => void
  onRecover: () => void
  onConsolidate: () => void
  onCleanup: (outcome: FeedbackCleanupOutcome) => void
}) {
  return (
    <div className="space-y-4 border-t border-border/60 pt-3">
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Review before recovery</AlertTitle>
        <AlertDescription>
          Comparing does not change either sheet. You can select candidate-only rows to copy after a separate confirmation. Consolidation and deletion are not part of recovery and remain separate owner-confirmed actions.
        </AlertDescription>
      </Alert>

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md border bg-background/60 p-2">
          <p className="font-medium">Authoritative sheet</p>
          <a className="break-all text-primary underline underline-offset-4" href={comparison.authoritative.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
            {comparison.authoritative.title}
          </a>
          <p className="text-muted-foreground">{comparison.authoritative.rowCount} feedback rows</p>
        </div>
        <div className="rounded-md border bg-background/60 p-2">
          <p className="font-medium">Candidate sheet</p>
          <a className="break-all text-primary underline underline-offset-4" href={comparison.candidate.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
            {comparison.candidate.title}
          </a>
          <p className="text-muted-foreground">{comparison.candidate.rowCount} feedback rows</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <p className="text-lg font-semibold">{comparison.counts.matchingRows}</p>
          <p className="text-xs text-muted-foreground">Matching rows</p>
        </div>
        <div className="rounded-md bg-amber-500/10 p-2 text-center">
          <p className="text-lg font-semibold">{comparison.counts.candidateOnlyRows}</p>
          <p className="text-xs text-muted-foreground">Only in candidate</p>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-center">
          <p className="text-lg font-semibold">{comparison.counts.authoritativeOnlyRows}</p>
          <p className="text-xs text-muted-foreground">Only in authoritative</p>
        </div>
      </div>

      <FeedbackDifferenceTable
        title="Rows only in the candidate"
        rows={comparison.candidateOnly}
        emptyMessage="Every candidate row also appears in the authoritative sheet."
        selectedRowNumbers={selectedRowNumbers}
        onSelectionChange={onSelectionChange}
      />
      {comparison.candidateOnly.length > 0 && (
        <>
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedRowNumbers.size} selected. Recovery copies rows only; the candidate sheet stays unchanged.
            </p>
            <Button type="button" onClick={onRecover} disabled={selectedRowNumbers.size === 0}>
              Review recovery
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs">
              <p className="font-medium">Consolidate the remaining unique rows</p>
              <p className="text-muted-foreground">
                Copy all {comparison.counts.candidateOnlyRows} candidate-only row{comparison.counts.candidateOnlyRows === 1 ? '' : 's'} to the authoritative sheet before cleanup.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onConsolidate}>
              Review consolidation
            </Button>
          </div>
        </>
      )}
      {comparison.candidateOnly.length === 0 && (
        <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 text-xs">
              <p className="font-medium">Candidate is ready for cleanup</p>
              <p className="text-muted-foreground">
                No rows are unique to “{comparison.candidate.title}”. You can keep, archive, or delete its feedback rows; each action is confirmed separately.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" onClick={() => onCleanup('retained')}>
              Keep candidate
            </Button>
            <Button type="button" variant="outline" onClick={() => onCleanup('archived')}>
              <Archive className="mr-2 h-4 w-4" />
              Archive candidate
            </Button>
            <Button type="button" variant="destructive" onClick={() => onCleanup('deleted')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete candidate rows
            </Button>
          </div>
        </div>
      )}
      <FeedbackDifferenceTable
        title="Rows only in the authoritative sheet"
        rows={comparison.authoritativeOnly}
        emptyMessage="Every authoritative row also appears in the candidate sheet."
      />
    </div>
  )
}

export function DevelopmentFeedback() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [category, setCategory] = useState('improvement')
  const [priority, setPriority] = useState('medium')
  const [sheetStatus, setSheetStatus] = useState<FeedbackSheetStatus | null>(null)
  const [loadingSheetStatus, setLoadingSheetStatus] = useState(false)
  const [candidateSpreadsheetId, setCandidateSpreadsheetId] = useState('')
  const [comparison, setComparison] = useState<FeedbackComparison | null>(null)
  const [loadingComparison, setLoadingComparison] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [selectedRowNumbers, setSelectedRowNumbers] = useState<Set<number>>(new Set())
  const [recoveryConfirmationOpen, setRecoveryConfirmationOpen] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [consolidationConfirmationOpen, setConsolidationConfirmationOpen] = useState(false)
  const [consolidating, setConsolidating] = useState(false)
  const [cleanupConfirmation, setCleanupConfirmation] = useState<FeedbackCleanupOutcome | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<FeedbackCleanupResult | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSheetStatus(null)
    setCleanupResult(null)
    setLoadingSheetStatus(true)
    void fetch('/api/development-feedback')
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<FeedbackSheetStatus>
      })
      .then((status) => {
        if (!cancelled && status) setSheetStatus(status)
      })
      .catch(() => {
        // Submission remains available if the read-only owner guidance is unavailable.
      })
      .finally(() => {
        if (!cancelled) setLoadingSheetStatus(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const reset = () => {
    setSummary('')
    setDetails('')
    setExpectedOutcome('')
    setCategory('improvement')
    setPriority('medium')
  }

  const compareSheets = async () => {
    if (!candidateSpreadsheetId.trim()) return
    setLoadingComparison(true)
    setComparisonError('')
    try {
      const query = encodeURIComponent(candidateSpreadsheetId.trim())
      const response = await fetch(`/api/development-feedback?candidateSpreadsheetId=${query}`)
      const result = await response.json() as ApiErrorResponse & { comparison?: FeedbackComparison }
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not compare feedback sheets')
      setComparison(result.comparison ?? null)
      setSelectedRowNumbers(new Set())
      setCleanupResult(null)
    } catch (error) {
      setComparison(null)
      setSelectedRowNumbers(new Set())
      setCleanupResult(null)
      setComparisonError(error instanceof Error ? error.message : 'Could not compare feedback sheets')
    } finally {
      setLoadingComparison(false)
    }
  }

  const updateSelection = (rowNumber: number, selected: boolean) => {
    setSelectedRowNumbers((current) => {
      const next = new Set(current)
      if (selected) next.add(rowNumber)
      else next.delete(rowNumber)
      return next
    })
  }

  const recoverSelectedRows = async () => {
    if (!comparison || selectedRowNumbers.size === 0) return
    setRecovering(true)
    try {
      const response = await fetch('/api/development-feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recover',
          candidateSpreadsheetId: comparison.candidate.spreadsheetId,
          authoritativeSpreadsheetId: comparison.authoritative.spreadsheetId,
          selectedRowNumbers: [...selectedRowNumbers],
          confirmed: true,
        }),
      })
      const result = await response.json() as ApiErrorResponse & {
        recovery?: { recoveredRows: number; duplicateRows: number }
      }
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not recover feedback rows')
      const recovered = result.recovery?.recoveredRows ?? 0
      const duplicates = result.recovery?.duplicateRows ?? 0
      toast.success(
        duplicates
          ? `Recovered ${recovered} row${recovered === 1 ? '' : 's'}; skipped ${duplicates} already present`
          : `Recovered ${recovered} row${recovered === 1 ? '' : 's'} to the authoritative sheet`,
      )
      setRecoveryConfirmationOpen(false)
      await compareSheets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not recover feedback rows')
    } finally {
      setRecovering(false)
    }
  }

  const consolidateCandidate = async () => {
    if (!comparison) return
    setConsolidating(true)
    try {
      const response = await fetch('/api/development-feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'consolidate',
          candidateSpreadsheetId: comparison.candidate.spreadsheetId,
          authoritativeSpreadsheetId: comparison.authoritative.spreadsheetId,
          confirmed: true,
        }),
      })
      const result = await response.json() as ApiErrorResponse & { cleanup?: FeedbackCleanupResult }
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not consolidate feedback rows')
      const consolidatedRows = result.cleanup?.consolidatedRows ?? 0
      toast.success(`Consolidated ${consolidatedRows} candidate-only row${consolidatedRows === 1 ? '' : 's'} to the authoritative sheet`)
      setConsolidationConfirmationOpen(false)
      await compareSheets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not consolidate feedback rows')
    } finally {
      setConsolidating(false)
    }
  }

  const cleanupCandidate = async () => {
    if (!comparison || !cleanupConfirmation) return
    setCleaningUp(true)
    try {
      const response = await fetch('/api/development-feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cleanup',
          candidateSpreadsheetId: comparison.candidate.spreadsheetId,
          authoritativeSpreadsheetId: comparison.authoritative.spreadsheetId,
          outcome: cleanupConfirmation,
          confirmed: true,
        }),
      })
      const result = await response.json() as ApiErrorResponse & { cleanup?: FeedbackCleanupResult }
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update the candidate sheet')
      if (!result.cleanup) throw new Error('The cleanup result was missing')
      setCleanupResult(result.cleanup)
      setCleanupConfirmation(null)
      toast.success(
        result.cleanup.outcome === 'archived'
          ? `Archived “${result.cleanup.candidate.title}”`
          : result.cleanup.outcome === 'deleted'
            ? `Deleted the feedback rows from “${result.cleanup.candidate.title}”`
            : `Kept “${result.cleanup.candidate.title}”`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the candidate sheet')
    } finally {
      setCleaningUp(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setComparison(null)
      setComparisonError('')
      setCleanupResult(null)
      setConsolidationConfirmationOpen(false)
      setCleanupConfirmation(null)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const response = await fetch('/api/development-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          details,
          expectedOutcome,
          category,
          priority,
          page: pathname,
        }),
      })
      const result = await response.json() as ApiErrorResponse & { spreadsheetUrl?: string }
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not save improvement')

      toast.success('Improvement added to Google Sheets', {
        action: result.spreadsheetUrl
          ? { label: 'Open sheet', onClick: () => window.open(result.spreadsheetUrl, '_blank', 'noopener,noreferrer') }
          : undefined,
      })
      reset()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save improvement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="fixed bottom-20 left-4 z-30 gap-2 border-amber-500/50 bg-background/95 shadow-lg backdrop-blur lg:bottom-6 lg:left-[15.5rem]"
        onClick={() => setOpen(true)}
        aria-label="Suggest an improvement while testing"
      >
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className="hidden sm:inline">Suggest improvement</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Suggest an improvement</DialogTitle>
            <DialogDescription>
              Development only. Your report and current page will be added to the private testing spreadsheet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
              <div className="flex items-start gap-2">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">Testing spreadsheet</p>
                  {loadingSheetStatus && <p className="text-muted-foreground">Checking the current sheet…</p>}
                  {!loadingSheetStatus && sheetStatus?.authoritative && (
                    <>
                      <a
                        className="inline-flex items-center gap-1 break-all text-primary underline underline-offset-4"
                        href={sheetStatus.authoritative.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open authoritative “{sheetStatus.authoritative.title}”
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {sheetStatus.authoritative.source === 'persisted'
                          ? 'This is the spreadsheet currently persisted for this feedback owner.'
                          : 'This is the spreadsheet configured for this development environment.'}
                      </p>
                    </>
                  )}
                  {!loadingSheetStatus && !sheetStatus?.authoritative && (
                    <p className="text-xs text-muted-foreground">
                      No authoritative sheet exists for this feedback owner yet. It will be created when the first report is submitted.
                    </p>
                  )}
                </div>
              </div>
              {sheetStatus?.authoritative && (
                <div className="space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <a
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                    href={sheetStatus.likelyOlderSheets.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Search Drive for likely older “{sheetStatus.likelyOlderSheets.title}” sheets
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <p>{sheetStatus.likelyOlderSheets.guidance}</p>
                  <p>{sheetStatus.recovery.guidance}</p>
                </div>
              )}
            </div>

            <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3" aria-labelledby="feedback-comparison-heading">
              <div className="flex items-start gap-2">
                <GitCompareArrows className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 space-y-1">
                  <h3 id="feedback-comparison-heading" className="font-medium">Compare an older sheet</h3>
                  <p className="text-xs text-muted-foreground">
                    Paste a likely older spreadsheet URL or ID to see which feedback rows are unique to each sheet. This never edits either sheet.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={candidateSpreadsheetId}
                  onChange={(event) => setCandidateSpreadsheetId(event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/… or spreadsheet ID"
                  aria-label="Older feedback spreadsheet URL or ID"
                  disabled={!sheetStatus?.authoritative || loadingComparison}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={compareSheets}
                  loading={loadingComparison}
                  disabled={!sheetStatus?.authoritative || !candidateSpreadsheetId.trim()}
                  className="shrink-0"
                >
                  Compare read-only
                </Button>
              </div>
              {!sheetStatus?.authoritative && !loadingSheetStatus && (
                <p className="text-xs text-muted-foreground">
                  Submit one improvement first to create an authoritative sheet for comparison.
                </p>
              )}
              {comparisonError && (
                <p className="text-sm text-destructive" role="alert">{comparisonError}</p>
              )}
              {comparison && (
                <FeedbackComparisonView
                  comparison={comparison}
                  selectedRowNumbers={selectedRowNumbers}
                  onSelectionChange={updateSelection}
                  onRecover={() => setRecoveryConfirmationOpen(true)}
                  onConsolidate={() => setConsolidationConfirmationOpen(true)}
                  onCleanup={setCleanupConfirmation}
                />
              )}
              {cleanupResult && (
                <Alert className="border-emerald-500/40 bg-emerald-500/5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertTitle>Cleanup result: {cleanupResult.outcome}</AlertTitle>
                  <AlertDescription>
                    “{cleanupResult.candidate.title}” was {cleanupResult.outcome === 'retained' ? 'kept' : cleanupResult.outcome}. It has {cleanupResult.remainingUniqueRows} remaining unique row{cleanupResult.remainingUniqueRows === 1 ? '' : 's'} compared with “{cleanupResult.authoritative.title}”.
                  </AlertDescription>
                </Alert>
              )}
            </section>

            <div className="space-y-2">
              <Label htmlFor="feedback-summary">Summary</Label>
              <Input
                id="feedback-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Make account balances easier to scan"
                maxLength={200}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feedback-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="feedback-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="improvement">Improvement</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="accessibility">Accessibility</SelectItem>
                    <SelectItem value="content">Content</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback-priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="feedback-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-details">What did you notice?</Label>
              <Textarea
                id="feedback-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Describe what happened, what was confusing, or what could work better."
                maxLength={3000}
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-outcome">Expected outcome <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="feedback-outcome"
                value={expectedOutcome}
                onChange={(event) => setExpectedOutcome(event.target.value)}
                placeholder="What would a better experience look like?"
                maxLength={1000}
                rows={3}
              />
            </div>

            <p className="text-xs text-muted-foreground">Page: {pathname}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              loading={submitting}
              disabled={summary.trim().length < 5 || details.trim().length < 10}
            >
              Add to testing sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recoveryConfirmationOpen} onOpenChange={(nextOpen) => !recovering && setRecoveryConfirmationOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy selected feedback rows?</DialogTitle>
            <DialogDescription>
              Confirm copying {selectedRowNumbers.size} selected row{selectedRowNumbers.size === 1 ? '' : 's'} from candidate “{comparison?.candidate.title}” / “{comparison?.candidate.worksheetName}” into authoritative “{comparison?.authoritative.title}” / “{comparison?.authoritative.worksheetName}”.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>The candidate stays intact</AlertTitle>
            <AlertDescription>
              Rows already present in the authoritative sheet will be skipped and reported. This does not consolidate or delete either sheet.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRecoveryConfirmationOpen(false)} disabled={recovering}>
              Cancel
            </Button>
            <Button type="button" onClick={recoverSelectedRows} loading={recovering}>
              Confirm and copy rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={consolidationConfirmationOpen} onOpenChange={(nextOpen) => !consolidating && setConsolidationConfirmationOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consolidate the older feedback sheet?</DialogTitle>
            <DialogDescription>
              Confirm copying every remaining unique row from “{comparison?.candidate.title}” into the authoritative “{comparison?.authoritative.title}”.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>This is a separate confirmation</AlertTitle>
            <AlertDescription>
              Consolidation copies rows only. It does not archive or delete “{comparison?.candidate.title}”. Compare again before choosing a separate cleanup action.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConsolidationConfirmationOpen(false)} disabled={consolidating}>
              Cancel
            </Button>
            <Button type="button" onClick={consolidateCandidate} loading={consolidating}>
              Confirm and consolidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cleanupConfirmation !== null} onOpenChange={(nextOpen) => !cleaningUp && !nextOpen && setCleanupConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cleanupConfirmation === 'retained'
                ? 'Keep this older feedback sheet?'
                : cleanupConfirmation === 'archived'
                  ? 'Archive this older feedback sheet?'
                  : 'Delete this older sheet’s feedback rows?'}
            </DialogTitle>
            <DialogDescription>
              This action affects only “{comparison?.candidate.title}” / “{comparison?.candidate.worksheetName}”. The authoritative “{comparison?.authoritative.title}” cannot be targeted by cleanup.
            </DialogDescription>
          </DialogHeader>
          <Alert className={cleanupConfirmation === 'deleted' ? 'border-destructive/40 bg-destructive/5' : undefined}>
            {cleanupConfirmation === 'deleted' ? <Trash2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            <AlertTitle>
              {cleanupConfirmation === 'retained'
                ? 'The candidate will stay unchanged'
                : cleanupConfirmation === 'archived'
                  ? 'The candidate will be renamed, not erased'
                  : 'The authoritative evidence stays safe'}
            </AlertTitle>
            <AlertDescription>
              {cleanupConfirmation === 'retained'
                ? 'Record that the older sheet is being retained for reference.'
                : cleanupConfirmation === 'archived'
                  ? 'The candidate will be renamed with an [Archived] prefix and its rows will remain available.'
                  : 'The live comparison must still show zero unique candidate rows. Deletion clears only the candidate Improvements rows; the header and authoritative rows remain.'}
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCleanupConfirmation(null)} disabled={cleaningUp}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={cleanupConfirmation === 'deleted' ? 'destructive' : 'default'}
              onClick={cleanupCandidate}
              loading={cleaningUp}
            >
              Confirm {cleanupConfirmation === 'retained' ? 'retain' : cleanupConfirmation}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}