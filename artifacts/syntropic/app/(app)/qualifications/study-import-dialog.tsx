'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileUp, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { parseStudyCsv } from '@/lib/study-csv'

type Program = { id: string; name: string; periods: Array<{ id: string; name: string }> }
type Mapping = { code: string; name: string; creditPoints?: string; status?: string }
type Preview = {
  valid: Array<{ row: number; code: string; name: string; creditPoints: number | null; status: string }>
  errors: Array<{ row: number; field: string; message: string }>
  duplicates: Array<{ row: number; code: string; reason: 'already_exists' | 'duplicate_in_file' }>
  total: number
  skipped: number
  canCommit: boolean
}
type ImportedUnit = { id: string; code: string; name: string; creditPoints: number | null; status: string }
type ImportResult = { created: number; skipped: number; total: number; batchId: string | null; units: ImportedUnit[]; undone?: boolean; removed?: number }
type UndoPreview = { batchId: string; units: ImportedUnit[]; count: number; createdAt: string }

const EMPTY_MAPPING: Mapping = { code: '', name: '' }

export function StudyImportDialog({
  open, onOpenChange, programs, initialProgramId, onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  programs: Program[]
  initialProgramId: string
  onImported: () => Promise<void>
}) {
  const [csv, setCsv] = useState('code,name,creditPoints,status\n')
  const [programId, setProgramId] = useState(initialProgramId)
  const [periodId, setPeriodId] = useState('none')
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [undoPreview, setUndoPreview] = useState<UndoPreview | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mappedHeaderSignature = useRef('')
  const parsed = useMemo(() => parseStudyCsv(csv), [csv])
  const headers = useMemo(() => parsed.headers.filter((header) => header.length > 0), [parsed.headers])
  const program = programs.find((item) => item.id === programId)

  useEffect(() => {
    if (!open) return
    setProgramId(initialProgramId)
    setPeriodId('none')
    setMapping(EMPTY_MAPPING)
    mappedHeaderSignature.current = ''
    setPreview(null)
    setResult(null)
    setUndoPreview(null)
    setUndoError(null)
  }, [open, initialProgramId])

  useEffect(() => {
    if (!headers.length) return
    const signature = headers.join('\u0000')
    if (signature === mappedHeaderSignature.current) return
    mappedHeaderSignature.current = signature
    setMapping((current) => ({
      code: headers.includes(current.code) ? current.code : headers.find((h) => /^(unit_?)?code$/i.test(h)) ?? '',
      name: headers.includes(current.name) ? current.name : headers.find((h) => /^(unit_?)?name$/i.test(h)) ?? '',
      creditPoints: headers.includes(current.creditPoints ?? '') ? current.creditPoints : headers.find((h) => /^(credit_?points|credits)$/i.test(h)),
      status: headers.includes(current.status ?? '') ? current.status : headers.find((h) => /^status$/i.test(h)),
    }))
  }, [headers])

  function invalidate() {
    setPreview(null)
    setResult(null)
    setUndoPreview(null)
    setUndoError(null)
  }

  async function request(action: 'preview' | 'commit') {
    if (!programId || parsed.error || !mapping.code || !mapping.name) return
    setBusy(true)
    try {
      const response = await fetch('/api/study/units/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          programId,
          teachingPeriodId: periodId === 'none' ? null : periodId,
          rows: parsed.rows,
          mapping: {
            code: mapping.code,
            name: mapping.name,
            ...(mapping.creditPoints ? { creditPoints: mapping.creditPoints } : {}),
            ...(mapping.status ? { status: mapping.status } : {}),
          },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Import review failed')
      if (action === 'preview') setPreview(data)
      else {
        setResult(data)
        setPreview(null)
        setUndoPreview(null)
        setUndoError(null)
        await onImported()
      }
    } catch (error) {
      setPreview(null)
      setResult(null)
      const message = error instanceof Error ? error.message : 'Import review failed'
      setPreview({ valid: [], duplicates: [], total: parsed.rows.length, skipped: 0, canCommit: false, errors: [{ row: 0, field: 'CSV', message }] })
    } finally {
      setBusy(false)
    }
  }

  async function reviewUndo() {
    if (!result?.batchId) return
    setBusy(true)
    try {
      const response = await fetch('/api/study/units/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo-preview', batchId: result.batchId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not review undo')
      setUndoPreview(data)
      setUndoError(null)
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : 'Could not review undo')
    } finally {
      setBusy(false)
    }
  }

  async function undoImport() {
    if (!undoPreview) return
    setBusy(true)
    try {
      const response = await fetch('/api/study/units/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', batchId: undoPreview.batchId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message ?? 'Could not undo import')
      setResult({ ...result!, created: 0, skipped: 0, batchId: null, units: [], undone: true, removed: data.removed })
      setUndoPreview(null)
      setUndoError(null)
      await onImported()
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : 'Could not undo import')
    } finally {
      setBusy(false)
    }
  }

  const canPreview = !!programId && parsed.rows.length > 0 && !parsed.error && !!mapping.code && !!mapping.name
  const destination = `${program?.name ?? 'selected program'}${periodId !== 'none' ? ` · ${program?.periods.find((p) => p.id === periodId)?.name}` : ''}`

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Review unit CSV import</DialogTitle>
        <DialogDescription>Choose the destination, map your columns, and review every row before saving.</DialogDescription>
      </DialogHeader>

      {result ? <div className="space-y-4" role="status" data-testid="status-import-complete">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{result.undone ? 'Import undone' : 'Import complete'}</p>
          <p className="mt-1 text-sm">{result.undone ? `${result.removed ?? 0} imported units were removed from ${destination}.` : `${result.created} created and ${result.skipped} skipped in ${destination}. No duplicates were created.`}</p>
        </div>
        {!result.undone && result.batchId && !undoPreview && <Button variant="outline" disabled={busy} onClick={reviewUndo} data-testid="button-review-undo-import"><RotateCcw className="mr-2 h-4 w-4" />Review units to remove</Button>}
        {undoError && <p className="text-sm text-destructive" role="alert">{undoError}</p>}
        {undoPreview && <div className="space-y-3 rounded-lg border border-destructive/40 p-4" data-testid="status-import-undo-preview">
          <div><p className="font-medium">Review units to remove</p><p className="text-sm text-muted-foreground">Undo will remove only these {undoPreview.count} units created by this import. This cannot be reversed.</p></div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">{undoPreview.units.map((unit) => <li key={unit.id} className="flex justify-between gap-3 border-b py-1 last:border-0"><span className="font-medium">{unit.code}</span><span className="text-right text-muted-foreground">{unit.name}</span></li>)}</ul>
          <div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy || undoPreview.count === 0} onClick={undoImport} data-testid="button-confirm-undo-import">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Undo this import</Button><Button variant="ghost" disabled={busy} onClick={() => setUndoPreview(null)}>Keep these units</Button></div>
        </div>}
        <Button onClick={() => onOpenChange(false)} data-testid="button-close-import-result">Done</Button>
      </div> : <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Program</Label><Select value={programId} onValueChange={(value) => { setProgramId(value); setPeriodId('none'); invalidate() }}><SelectTrigger data-testid="select-import-program"><SelectValue placeholder="Choose program" /></SelectTrigger><SelectContent>{programs.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Teaching period</Label><Select value={periodId} onValueChange={(value) => { setPeriodId(value); invalidate() }}><SelectTrigger data-testid="select-import-period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No teaching period</SelectItem>{program?.periods.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="study-csv">CSV data</Label><Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-upload-csv"><FileUp className="mr-2 h-4 w-4" />Choose CSV file</Button></div>
          <Input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose unit CSV file" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setCsv(await file.text()); invalidate() } }} data-testid="input-csv-file" />
          <Textarea id="study-csv" className="min-h-36 font-mono text-xs" value={csv} onChange={(event) => { setCsv(event.target.value); invalidate() }} aria-describedby="csv-help csv-error" data-testid="input-csv-text" />
          <p id="csv-help" className="text-xs text-muted-foreground">Paste CSV or upload a .csv file. The first row must contain unique column names.</p>
          {parsed.error && <p id="csv-error" role="alert" className="flex gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{parsed.error}</p>}
        </div>

        {headers.length > 0 && <fieldset className="space-y-3">
          <legend className="font-medium">Column mapping</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['code', 'Unit code', true],
              ['name', 'Unit name', true],
              ['creditPoints', 'Credit points', false],
              ['status', 'Status', false],
            ] as const).map(([field, label, required]) => <div key={field} className="space-y-1.5"><Label>{label}{required ? ' *' : ''}</Label><Select value={mapping[field] || 'unmapped'} onValueChange={(value) => { setMapping({ ...mapping, [field]: value === 'unmapped' ? undefined : value }); invalidate() }}><SelectTrigger data-testid={`select-mapping-${field}`}><SelectValue placeholder="Choose column" /></SelectTrigger><SelectContent><SelectItem value="unmapped">{required ? 'Choose column' : 'Not included'}</SelectItem>{headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectContent></Select></div>)}
          </div>
        </fieldset>}

        <Button variant="outline" disabled={!canPreview || busy} onClick={() => request('preview')} data-testid="button-preview-import">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Review {parsed.rows.length || ''} rows</Button>

        {preview && <section className="space-y-3" aria-live="polite" data-testid="status-import-preview">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{preview.valid.length} ready</Badge>
            <Badge variant="outline">{preview.duplicates.length} duplicates</Badge>
            <Badge variant={preview.errors.length ? 'destructive' : 'outline'}>{preview.errors.length} errors</Badge>
          </div>
          {preview.errors.length > 0 && <div className="rounded-md border border-destructive/40 p-3"><p className="font-medium text-destructive">Fix these blocking errors, then review again</p><ul className="mt-2 space-y-1 text-sm">{preview.errors.map((error, index) => <li key={`${error.row}-${error.field}-${index}`}><strong>{error.row ? `Row ${error.row}` : 'Import'} · {error.field}:</strong> {error.message}</li>)}</ul></div>}
          {preview.duplicates.length > 0 && <div className="rounded-md border p-3"><p className="font-medium">Duplicates will be skipped</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{preview.duplicates.map((duplicate) => <li key={`${duplicate.row}-${duplicate.code}`}>Row {duplicate.row} · {duplicate.code} — {duplicate.reason === 'already_exists' ? 'already in this program' : 'repeated in this file'}</li>)}</ul></div>}
          {preview.valid.length > 0 && <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="bg-muted/60"><tr><th className="p-2">Row</th><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Credits</th><th className="p-2">Status</th></tr></thead><tbody>{preview.valid.map((row) => <tr key={row.row} className="border-t"><td className="p-2">{row.row}</td><td className="p-2 font-medium">{row.code}</td><td className="p-2">{row.name}</td><td className="p-2">{row.creditPoints ?? '—'}</td><td className="p-2">{row.status}</td></tr>)}</tbody></table></div>}
          <div className="rounded-md bg-muted/50 p-3 text-sm"><strong>Confirm:</strong> create exactly {preview.valid.length} units in {destination}; skip {preview.duplicates.length} duplicates.</div>
          <Button disabled={!preview.canCommit || preview.valid.length === 0 || busy} onClick={() => request('commit')} data-testid="button-commit-import">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import {preview.valid.length} units</Button>
        </section>}
      </div>}
    </DialogContent>
  </Dialog>
}