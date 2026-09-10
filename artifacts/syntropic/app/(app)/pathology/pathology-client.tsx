'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { FlaskConical, Plus, Trash2, Upload, ScanLine, FileCheck2, AlertTriangle, Download, Save, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate, SafeNumber } from '@/components/safe-format'
import { HealthDisclaimer } from '@/components/health-disclaimer'

type Result = {
  id: string; analyte: string; resultType: string; value: number | null; valueText: string | null
  unit: string | null; refLow: number | null; refHigh: number | null; flag: string | null
}
type Panel = {
  id: string; name: string; category: string; discipline: string; collectedDate: string; provider: string | null
  summary: string | null; notes: string | null; results: Result[]
}
type DraftResult = { id: string; analyte: string; resultType: 'quantitative' | 'qualitative'; value: number | null; valueText: string | null; unit: string | null; refLow: number | null; refHigh: number | null; flag: 'normal' | 'high' | 'low' | 'abnormal' | null; collectedAt: string | null; comment: string | null; confidence: number; unresolved: string[]; sourceBox: null }
type Draft = { report: { title: string; provider: string | null; collectedAt: string | null; reportedAt: string | null; comments: string | null }; panels: Array<{ id: string; name: string; discipline: string; comments: string | null; sourceBox: null; results: DraftResult[] }> }
type ReviewReport = { id: string; fileName: string; contentType: string; byteSize: number; sha256: string; status: string; retentionState: string; extractedData: Draft; uploadedAt: string }

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = async (value: string | ArrayBuffer) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((part) => part.toString(16).padStart(2, '0')).join('')
}

const DISCIPLINES = [
  { value: 'haematology', label: 'Haematology' }, { value: 'biochemistry', label: 'Biochemistry' }, { value: 'endocrine', label: 'Endocrine' },
  { value: 'immunology', label: 'Immunology' }, { value: 'microbiology', label: 'Microbiology' }, { value: 'imaging', label: 'Imaging' }, { value: 'other', label: 'Other' },
]
const flagColor: Record<string, string> = {
  high: 'text-rose-400', low: 'text-amber-400', abnormal: 'text-rose-400', normal: 'text-emerald-400',
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const emptyResult = () => ({ analyte: '', resultType: 'quantitative', value: '', valueText: '', unit: '', refLow: '', refHigh: '', flag: '' })
const emptyPanel = { name: '', category: 'pathology', discipline: 'haematology', collectedDate: '', provider: '', summary: '', notes: '' }

export function PathologyClient() {
  const [loading, setLoading] = useState(true)
  const [panels, setPanels] = useState<Panel[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyPanel)
  const [results, setResults] = useState<ReturnType<typeof emptyResult>[]>([])
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [reports, setReports] = useState<ReviewReport[]>([])
  const [review, setReview] = useState<ReviewReport | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'json' | 'pdf' | null>(null)
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([])

  const fetchPanels = useCallback(async () => {
    const res = await fetch('/api/lab-panels')
    if (res.ok) setPanels(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchPanels() }, [fetchPanels])
  const fetchReports = useCallback(async () => {
    const res = await fetch('/api/pathology-reports')
    if (res.ok) setReports(await res.json())
  }, [])
  useEffect(() => { fetchReports() }, [fetchReports])

  const uploadReport = async (file?: File) => {
    if (!file) return
    setImporting(true)
    try {
      const sha256 = await digest(await file.arrayBuffer())
      const prepare = await fetch('/api/pathology-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type, byteSize: file.size, sha256 }) })
      const prepared = await prepare.json()
      if (!prepare.ok) throw new Error(prepared.error?.message ?? 'Upload could not be prepared')
      const put = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type, ...prepared.uploadHeaders }, body: file })
      if (!put.ok) throw new Error('Private upload failed')
      const complete = await fetch(`/api/pathology-reports/${prepared.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload_complete' }) })
      if (!complete.ok) throw new Error('The uploaded file could not be verified')
      toast.success('Report stored privately and ready for review')
      await fetchReports()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Upload failed') }
    finally { setImporting(false) }
  }

  const openReview = async (report: ReviewReport) => {
    setReview(structuredClone(report))
    setSelectedPanelIds(report.extractedData.panels.map((panel) => panel.id))
    setExportFormat(null)
    const res = await fetch(`/api/pathology-reports/${report.id}/download`)
    if (res.ok) setSourceUrl((await res.json()).url)
  }
  const updateResult = (panelIndex: number, resultIndex: number, patch: Partial<DraftResult>) => setReview((current) => {
    if (!current) return current
    const next = structuredClone(current)
    next.extractedData.panels[panelIndex].results[resultIndex] = { ...next.extractedData.panels[panelIndex].results[resultIndex], ...patch }
    return next
  })
  const reviewAction = async (action: 'save' | 'confirm' | 'reject') => {
    if (!review) return
    setSaving(true)
    const body = action === 'reject' ? { action } : { action, draft: review.extractedData }
    const res = await fetch(`/api/pathology-reports/${review.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) return toast.error(data.error?.message ?? 'Review update failed')
    toast.success(action === 'confirm' ? 'Reviewed results confirmed' : action === 'reject' ? 'Import rejected' : 'Review saved')
    setReview(null); setSourceUrl(''); fetchReports(); if (action === 'confirm') fetchPanels()
  }
  const exportReviewed = async () => {
    if (!review) return
    if (!exportFormat || !selectedPanelIds.length) return toast.error('Select at least one panel')
    const selection = { report: review.extractedData.report, panels: review.extractedData.panels.filter((panel) => selectedPanelIds.includes(panel.id)) }
    const previewHash = await digest(canonicalJson({ format: exportFormat, selection }))
    const res = await fetch(`/api/pathology-reports/${review.id}/exports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: exportFormat, panelIds: selectedPanelIds, previewHash }) })
    const data = await res.json()
    if (!res.ok) return toast.error(data.error?.message ?? 'Export failed')
    window.location.assign(data.downloadUrl)
    setExportFormat(null)
  }
  const deleteOriginal = async () => {
    if (!review || !window.confirm('Permanently delete the private original and its stored review snapshot? Confirmed health records and the non-deletable audit history will remain.')) return
    setSaving(true)
    const res = await fetch(`/api/pathology-reports/${review.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_deletion' }) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) return toast.error(data.error?.message ?? 'Original could not be deleted')
    toast.success('Private original deleted and export links revoked')
    setReview(null); setSourceUrl(''); fetchReports()
  }

  const openAdd = () => { setForm({ ...emptyPanel, collectedDate: todayStr() }); setResults([emptyResult()]); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Panel name required'); return }
    setSaving(true)
    const body = { ...form, results: results.filter((r) => r.analyte.trim()) }
    const res = await fetch('/api/lab-panels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (res.ok) { toast.success('Panel saved'); setOpen(false); fetchPanels() } else toast.error('Failed to save')
  }

  const del = async (id: string) => {
    const res = await fetch(`/api/lab-panels/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchPanels() } else toast.error('Failed')
  }

  const grouped = DISCIPLINES.map((d) => ({ ...d, panels: panels.filter((p) => p.discipline === d.value) })).filter((g) => g.panels.length > 0)

  return (
    <FadeIn className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" /> Pathology & Imaging
        </h1>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add results</Button>
      </div>
      <HealthDisclaimer />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" /> Private report review</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Upload a PDF or report image. It remains private, and no extracted value enters your health record until you confirm it.</p>
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Upload className="h-4 w-4" /> {importing ? 'Uploading…' : 'Upload report'}
            <Input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={importing} onChange={(event) => uploadReport(event.target.files?.[0])} />
          </Label>
          {reports.length > 0 && <div className="divide-y rounded-md border">
            {reports.map((report) => <div key={report.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{report.fileName}</p><p className="text-xs text-muted-foreground">{report.status.replace('_', ' ')} · {(report.byteSize / 1024).toFixed(0)} KB</p></div>
              <Button size="sm" variant="outline" onClick={() => openReview(report)} disabled={report.retentionState !== 'retained' || report.status === 'uploaded'}>{report.status === 'confirmed' ? 'View & export' : report.status === 'uploaded' ? 'Awaiting verification' : 'Review'}</Button>
            </div>)}
          </div>}
        </CardContent>
      </Card>

      {loading ? <Skeleton className="h-40 w-full" /> : panels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pathology or imaging results recorded yet.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.value} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{g.label}</h2>
              <Stagger className="space-y-2">
                {g.panels.map((p) => (
                  <StaggerItem key={p.id}>
                    <Card>
                      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded({ ...expanded, [p.id]: !expanded[p.id] })}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">{p.name}</CardTitle>
                            <div className="text-xs text-muted-foreground mt-1">
                              <SafeDate date={p.collectedDate} options={{ dateStyle: 'medium' }} />{p.provider ? ` · ${p.provider}` : ''} · {p.results.length} result{p.results.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="capitalize">{p.category}</Badge>
                            <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); del(p.id) }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      </CardHeader>
                      {expanded[p.id] && (
                        <CardContent className="space-y-2">
                          {p.summary && <p className="text-sm">{p.summary}</p>}
                          {p.results.length > 0 && (
                            <div className="divide-y divide-border rounded-md border border-border">
                              {p.results.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                  <span className="font-medium">{r.analyte}</span>
                                  <div className="flex items-center gap-3 text-right">
                                    {r.resultType === 'quantitative' ? (
                                      <span className={`font-semibold ${r.flag ? flagColor[r.flag] ?? '' : ''}`}>
                                        {r.value != null ? <SafeNumber value={r.value} /> : '—'} {r.unit ?? ''}
                                      </span>
                                    ) : (
                                      <span className={`font-semibold ${r.flag ? flagColor[r.flag] ?? '' : ''}`}>{r.valueText ?? '—'}</span>
                                    )}
                                    {(r.refLow != null || r.refHigh != null) && (
                                      <span className="text-xs text-muted-foreground min-w-[70px]">
                                        ({r.refLow != null ? r.refLow : ''}–{r.refHigh != null ? r.refHigh : ''})
                                      </span>
                                    )}
                                    {r.flag && <Badge variant="outline" className={`capitalize ${flagColor[r.flag] ?? ''}`}>{r.flag}</Badge>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                        </CardContent>
                      )}
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
      )}

      {/* Add panel dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add pathology / imaging results</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Panel name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full Blood Count" /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pathology">Pathology</SelectItem><SelectItem value="imaging">Imaging</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Discipline</Label>
              <Select value={form.discipline} onValueChange={(v) => setForm({ ...form, discipline: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DISCIPLINES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Collected date</Label><Input type="date" value={form.collectedDate} onChange={(e) => setForm({ ...form, collectedDate: e.target.value })} /></div>
            <div><Label>Provider / lab</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Summary</Label><Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Overall interpretation (optional)" /></div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label>Results</Label>
              <Button size="sm" variant="outline" onClick={() => setResults([...results, emptyResult()])}><Plus className="h-3 w-3 mr-1" /> Add result</Button>
            </div>
            {results.map((r, i) => (
              <div key={i} className="rounded-md border border-border p-2 space-y-2">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6"><Label className="text-xs">Analyte</Label><Input placeholder="Haemoglobin" value={r.analyte} onChange={(e) => { const n = [...results]; n[i] = { ...r, analyte: e.target.value }; setResults(n) }} /></div>
                  <div className="col-span-5"><Label className="text-xs">Type</Label>
                    <Select value={r.resultType} onValueChange={(v) => { const n = [...results]; n[i] = { ...r, resultType: v }; setResults(n) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="quantitative">Quantitative</SelectItem><SelectItem value="qualitative">Qualitative</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1"><Button size="icon-sm" variant="ghost" onClick={() => setResults(results.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
                {r.resultType === 'quantitative' ? (
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3"><Label className="text-xs">Value</Label><Input type="number" step="any" value={r.value} onChange={(e) => { const n = [...results]; n[i] = { ...r, value: e.target.value }; setResults(n) }} /></div>
                    <div className="col-span-3"><Label className="text-xs">Unit</Label><Input value={r.unit} onChange={(e) => { const n = [...results]; n[i] = { ...r, unit: e.target.value }; setResults(n) }} /></div>
                    <div className="col-span-2"><Label className="text-xs">Ref low</Label><Input type="number" step="any" value={r.refLow} onChange={(e) => { const n = [...results]; n[i] = { ...r, refLow: e.target.value }; setResults(n) }} /></div>
                    <div className="col-span-2"><Label className="text-xs">Ref high</Label><Input type="number" step="any" value={r.refHigh} onChange={(e) => { const n = [...results]; n[i] = { ...r, refHigh: e.target.value }; setResults(n) }} /></div>
                    <div className="col-span-2"><Label className="text-xs">Flag</Label>
                      <Select value={r.flag || 'none'} onValueChange={(v) => { const n = [...results]; n[i] = { ...r, flag: v === 'none' ? '' : v }; setResults(n) }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="none">—</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="abnormal">Abnormal</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div><Label className="text-xs">Result text</Label><Input value={r.valueText} onChange={(e) => { const n = [...results]; n[i] = { ...r, valueText: e.target.value }; setResults(n) }} placeholder="Not detected" /></div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!review} onOpenChange={(value) => { if (!value) { setReview(null); setSourceUrl('') } }}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review extracted pathology data</DialogTitle></DialogHeader>
          {review && <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Original report" className="min-h-[520px] rounded-md border bg-muted/20">
              {sourceUrl ? review.contentType === 'application/pdf'
                ? <iframe title="Original pathology report" src={sourceUrl} className="h-[70vh] w-full rounded-md" />
                // The source is an expiring signed URL and must not pass through Next's persistent image optimiser.
                : <img src={sourceUrl} alt="Original pathology report" className="h-auto max-h-[70vh] w-full object-contain" />
                : <Skeleton className="h-full min-h-[520px] w-full" />}
            </section>
            <section aria-label="Extracted fields" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Report title</Label><Input value={review.extractedData.report.title} onChange={(e) => setReview({ ...review, extractedData: { ...review.extractedData, report: { ...review.extractedData.report, title: e.target.value } } })} disabled={review.status === 'confirmed'} /></div>
                <div><Label>Provider / lab</Label><Input value={review.extractedData.report.provider ?? ''} onChange={(e) => setReview({ ...review, extractedData: { ...review.extractedData, report: { ...review.extractedData.report, provider: e.target.value || null } } })} disabled={review.status === 'confirmed'} /></div>
                <div><Label>Collected time</Label><Input type="datetime-local" value={review.extractedData.report.collectedAt?.slice(0, 16) ?? ''} onChange={(e) => setReview({ ...review, extractedData: { ...review.extractedData, report: { ...review.extractedData.report, collectedAt: e.target.value ? new Date(e.target.value).toISOString() : null } } })} disabled={review.status === 'confirmed'} /></div>
                <div><Label>Reported time</Label><Input type="datetime-local" value={review.extractedData.report.reportedAt?.slice(0, 16) ?? ''} onChange={(e) => setReview({ ...review, extractedData: { ...review.extractedData, report: { ...review.extractedData.report, reportedAt: e.target.value ? new Date(e.target.value).toISOString() : null } } })} disabled={review.status === 'confirmed'} /></div>
                <div><Label>Report comments</Label><Input value={review.extractedData.report.comments ?? ''} onChange={(e) => setReview({ ...review, extractedData: { ...review.extractedData, report: { ...review.extractedData.report, comments: e.target.value || null } } })} disabled={review.status === 'confirmed'} /></div>
              </div>
              {review.extractedData.panels.map((panel, panelIndex) => <Card key={panel.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Input aria-label="Panel name" value={panel.name} disabled={review.status === 'confirmed'} onChange={(event) => {
                      const next = structuredClone(review); next.extractedData.panels[panelIndex].name = event.target.value; setReview(next)
                    }} />
                    {review.status !== 'confirmed' && review.extractedData.panels.length > 1 && <Button aria-label={`Remove ${panel.name}`} size="icon-sm" variant="ghost" onClick={() => {
                      const next = structuredClone(review); next.extractedData.panels.splice(panelIndex, 1); setReview(next)
                    }}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={panel.discipline} disabled={review.status === 'confirmed'} onValueChange={(value) => {
                      const next = structuredClone(review); next.extractedData.panels[panelIndex].discipline = value; setReview(next)
                    }}>
                      <SelectTrigger aria-label="Discipline"><SelectValue /></SelectTrigger>
                      <SelectContent>{DISCIPLINES.map((discipline) => <SelectItem key={discipline.value} value={discipline.value}>{discipline.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input aria-label="Panel comments" placeholder="Panel comments" value={panel.comments ?? ''} disabled={review.status === 'confirmed'} onChange={(event) => {
                      const next = structuredClone(review); next.extractedData.panels[panelIndex].comments = event.target.value || null; setReview(next)
                    }} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[...panel.results].sort((a, b) => (a.unresolved.length ? 0 : a.confidence < .8 ? 1 : 2) - (b.unresolved.length ? 0 : b.confidence < .8 ? 1 : 2)).map((result) => {
                    const resultIndex = panel.results.findIndex((item) => item.id === result.id)
                    const needsReview = result.unresolved.length > 0 || result.confidence < .8
                    return <fieldset key={result.id} className={`rounded-md border p-3 ${needsReview ? 'border-amber-500/60 bg-amber-500/5' : ''}`}>
                      <legend className="px-1 text-xs font-medium">{needsReview && <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-500" />}{Math.round(result.confidence * 100)}% confidence {review.status !== 'confirmed' && <button className="ml-2 text-destructive underline" onClick={() => {
                        const next = structuredClone(review); next.extractedData.panels[panelIndex].results.splice(resultIndex, 1); setReview(next)
                      }}>Remove</button>}</legend>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2"><Label className="text-xs">Analyte</Label><Input value={result.analyte} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, { analyte: e.target.value, unresolved: result.unresolved.filter((v) => v !== 'analyte') })} /></div>
                        <div><Label className="text-xs">Value</Label><Input value={result.value ?? result.valueText ?? ''} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, result.resultType === 'quantitative' ? { value: e.target.value === '' ? null : Number(e.target.value), unresolved: result.unresolved.filter((v) => v !== 'value') } : { valueText: e.target.value, unresolved: result.unresolved.filter((v) => v !== 'value') })} /></div>
                        <div><Label className="text-xs">Unit</Label><Input value={result.unit ?? ''} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, { unit: e.target.value || null, unresolved: result.unresolved.filter((v) => v !== 'unit') })} /></div>
                        <div><Label className="text-xs">Reference low</Label><Input type="number" value={result.refLow ?? ''} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, { refLow: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                        <div><Label className="text-xs">Reference high</Label><Input type="number" value={result.refHigh ?? ''} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, { refHigh: e.target.value === '' ? null : Number(e.target.value), unresolved: result.unresolved.filter((v) => v !== 'range') })} /></div>
                        <div><Label className="text-xs">Flag</Label><Select value={result.flag ?? 'none'} disabled={review.status === 'confirmed'} onValueChange={(value) => updateResult(panelIndex, resultIndex, { flag: value === 'none' ? null : value as DraftResult['flag'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="abnormal">Abnormal</SelectItem></SelectContent></Select></div>
                        <div><Label className="text-xs">Result time</Label><Input type="datetime-local" value={result.collectedAt?.slice(0, 16) ?? ''} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, { collectedAt: e.target.value ? new Date(e.target.value).toISOString() : null, unresolved: result.unresolved.filter((v) => v !== 'time') })} /></div>
                        <div className="col-span-2"><Label className="text-xs">Comment</Label><Input value={result.comment ?? ''} disabled={review.status === 'confirmed'} onChange={(e) => updateResult(panelIndex, resultIndex, { comment: e.target.value || null, unresolved: result.unresolved.filter((v) => v !== 'comment') })} /></div>
                      </div>
                    </fieldset>
                  })}
                  {review.status !== 'confirmed' && <Button size="sm" variant="outline" disabled={panel.results.length >= 500} onClick={() => {
                    const next = structuredClone(review)
                    next.extractedData.panels[panelIndex].results.push({ id: crypto.randomUUID(), analyte: '', resultType: 'quantitative', value: null, valueText: null, unit: null, refLow: null, refHigh: null, flag: null, collectedAt: null, comment: null, confidence: 1, unresolved: ['analyte', 'value'], sourceBox: null })
                    setReview(next)
                  }}><Plus className="mr-1 h-3 w-3" /> Add result</Button>}
                </CardContent>
              </Card>)}
              {review.status !== 'confirmed' && <Button variant="outline" disabled={review.extractedData.panels.length >= 50} onClick={() => {
                const next = structuredClone(review)
                next.extractedData.panels.push({ id: crypto.randomUUID(), name: 'New panel', discipline: 'other', comments: null, sourceBox: null, results: [] })
                setReview(next)
              }}><Plus className="mr-1 h-4 w-4" /> Add panel</Button>}
            </section>
          </div>}
          {review?.status === 'confirmed' && exportFormat && <Card className="border-primary/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm">One-time {exportFormat.toUpperCase()} export preview</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Only the checked panels below will be included. The download expires after 10 minutes and can be used once.</p>
              <div className="flex flex-wrap gap-4">
                {review.extractedData.panels.map((panel) => <Label key={panel.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={selectedPanelIds.includes(panel.id)} onChange={(event) => setSelectedPanelIds((current) => event.target.checked ? [...current, panel.id] : current.filter((id) => id !== panel.id))} />
                  {panel.name}
                </Label>)}
              </div>
              <pre className="max-h-52 overflow-auto rounded bg-muted p-3 text-[11px]">{JSON.stringify({ report: review.extractedData.report, panels: review.extractedData.panels.filter((panel) => selectedPanelIds.includes(panel.id)) }, null, 2)}</pre>
              <Button onClick={exportReviewed} disabled={!selectedPanelIds.length}><Download className="mr-1 h-4 w-4" /> Create one-time download</Button>
            </CardContent>
          </Card>}
          <DialogFooter className="flex-wrap">
            <Button variant="destructive" onClick={deleteOriginal} disabled={saving}><Trash2 className="mr-1 h-4 w-4" /> Delete private original</Button>
            {review?.status === 'confirmed' ? <>
              <Button variant="outline" onClick={() => setExportFormat('json')}><Download className="mr-1 h-4 w-4" /> Preview JSON export</Button>
              <Button variant="outline" onClick={() => setExportFormat('pdf')}><Download className="mr-1 h-4 w-4" /> Preview PDF export</Button>
            </> : <>
              <Button variant="destructive" onClick={() => reviewAction('reject')}><XCircle className="mr-1 h-4 w-4" /> Reject import</Button>
              <Button variant="outline" onClick={() => reviewAction('save')}><Save className="mr-1 h-4 w-4" /> Save review</Button>
              <Button onClick={() => reviewAction('confirm')}><FileCheck2 className="mr-1 h-4 w-4" /> Confirm into health record</Button>
            </>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FadeIn>
  )
}
