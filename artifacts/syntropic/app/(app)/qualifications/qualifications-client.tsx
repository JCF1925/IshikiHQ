'use client'

import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, Plus, Upload, CalendarClock, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { StudyImportDialog } from './study-import-dialog'

const METHODS = ['percentage', 'wam', 'gpa4', 'gpa7', 'pass_fail', 'competency', 'custom']
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-AU', { timeZone: 'UTC' })

export function QualificationsClient() {
  const [programs, setPrograms] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [programOpen, setProgramOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [program, setProgram] = useState({ name: '', institution: '', gradingMethod: 'percentage' })
  const [unit, setUnit] = useState({ code: '', name: '', creditPoints: '', status: 'planned' })
  const [assessment, setAssessment] = useState({ unitId: '', name: '', dueAt: '', weight: '' })
  const [period, setPeriod] = useState({ name: '', startDate: '', endDate: '', censusDate: '', withdrawalDate: '' })
  const [evaluation, setEvaluation] = useState({ programId: '', method: 'percentage', input: '', evaluatedAt: '' })
  const [evaluationResult, setEvaluationResult] = useState<any>(null)

  const load = useCallback(async () => {
    const [p, s, a] = await Promise.all([fetch('/api/study/programs'), fetch('/api/study/suggestions'), fetch('/api/study/alerts')])
    if (p.ok) setPrograms(await p.json())
    if (s.ok) setSuggestions(await s.json())
    if (a.ok) setAlerts(await a.json())
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    setEvaluation((current) => current.evaluatedAt ? current : { ...current, evaluatedAt: new Date().toISOString().slice(0, 10) })
  }, [])

  async function send(url: string, body: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error?.message ?? 'Request failed')
    return data
  }

  async function createProgram() {
    try {
      await send('/api/study/programs', program)
      setProgramOpen(false); setProgram({ name: '', institution: '', gradingMethod: 'percentage' }); await load()
      toast.success('Program created')
    } catch (error: any) { toast.error(error.message) }
  }

  async function createUnit() {
    try {
      await send('/api/study/units', { ...unit, programId: selected, creditPoints: unit.creditPoints || null })
      setUnitOpen(false); setUnit({ code: '', name: '', creditPoints: '', status: 'planned' }); await load()
      toast.success('Unit added')
    } catch (error: any) { toast.error(error.message) }
  }

  async function createAssessment() {
    try {
      await send('/api/study/assessments', { ...assessment, dueAt: assessment.dueAt || null, weight: assessment.weight || null })
      setAssessmentOpen(false); setAssessment({ unitId: '', name: '', dueAt: '', weight: '' }); await load()
      toast.success('Assessment added')
    } catch (error: any) { toast.error(error.message) }
  }

  async function createPeriod() {
    try {
      await send('/api/study/periods', {
        ...period, programId: selected,
        censusDate: period.censusDate || null, withdrawalDate: period.withdrawalDate || null,
      })
      setPeriodOpen(false); setPeriod({ name: '', startDate: '', endDate: '', censusDate: '', withdrawalDate: '' }); await load()
      toast.success('Teaching period added')
    } catch (error: any) { toast.error(error.message) }
  }

  async function decide(id: string, decision: 'approve' | 'reject') {
    try { await send(`/api/study/suggestions/${id}`, { decision }); await load() }
    catch (error: any) { toast.error(error.message) }
  }

  async function updateCalendar(program: any, changes: any) {
    const response = await fetch(`/api/study/programs/${program.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    if (response.ok) await load()
    else toast.error('Could not save calendar settings')
  }

  async function evaluateScale(programId: string) {
    try {
      const result = await send('/api/study/grading-scales/evaluate', { ...evaluation, programId, input: evaluation.input })
      setEvaluationResult(result)
    } catch (error: any) { setEvaluationResult({ error: error.message }) }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-display text-2xl font-bold flex items-center gap-2"><GraduationCap className="h-6 w-6" /> Study</h1><p className="text-sm text-muted-foreground">Programs, results, deadlines and approved task hand-off.</p></div>
      <Button onClick={() => setProgramOpen(true)}><Plus className="h-4 w-4 mr-2" />Program</Button>
    </div>

    {alerts.length > 0 && <Card className="border-amber-500/40"><CardHeader><CardTitle className="text-base flex gap-2"><CalendarClock className="h-4 w-4" />Upcoming census &amp; withdrawal dates</CardTitle></CardHeader><CardContent className="space-y-2">{alerts.map((alert) => <div key={`${alert.periodId}-${alert.kind}`} className="text-sm flex justify-between"><span>{alert.program.name} · {alert.period} <Badge variant="outline">{alert.kind}</Badge></span><span>{formatDate(alert.at)}</span></div>)}</CardContent></Card>}

    {programs.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Create a program to start tracking units and assessments.</CardContent></Card> :
      programs.map((item) => <Card key={item.id}>
        <CardHeader><div className="flex justify-between gap-3"><div><CardTitle>{item.name}</CardTitle><p className="text-sm text-muted-foreground">{item.institution || 'Institution not set'} · {item.gradingMethod.toUpperCase()}</p></div><Badge>{item.status}</Badge></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setSelected(item.id); setUnitOpen(true) }}><Plus className="h-3 w-3 mr-1" />Unit</Button><Button size="sm" variant="outline" onClick={() => { setSelected(item.id); setPeriodOpen(true) }}><CalendarClock className="h-3 w-3 mr-1" />Teaching period</Button><Button size="sm" variant="outline" onClick={() => { setSelected(item.id); setImportOpen(true) }}><Upload className="h-3 w-3 mr-1" />CSV import</Button></div>
          {item.periods.length > 0 && <div className="flex flex-wrap gap-2">{item.periods.map((p: any) => <Badge key={p.id} variant="outline">{p.name}{p.censusDate ? ` · census ${formatDate(p.censusDate)}` : ''}</Badge>)}</div>}
          <div className="grid gap-2 md:grid-cols-2">{item.units.map((u: any) => <div key={u.id} className="rounded-md border p-3"><div className="font-medium">{u.code} · {u.name}</div><div className="text-xs text-muted-foreground">{u.creditPoints ? `${u.creditPoints} credits · ` : ''}{u.status}{u.finalValue != null ? ` · ${u.finalValue}` : ''}</div>{u.assessments.map((a: any) => <div key={a.id} className="mt-2 text-xs">↳ {a.name}{a.dueAt ? ` · due ${formatDate(a.dueAt)}` : ''}</div>)}<Button size="sm" variant="ghost" className="mt-2" onClick={() => { setAssessment({ ...assessment, unitId: u.id }); setAssessmentOpen(true) }}><Plus className="h-3 w-3 mr-1" />Assessment</Button></div>)}</div>
          <div className="border-t pt-3 space-y-2"><Label>Calendar category (explicit choice)</Label><Input value={item.calendarCategory ?? ''} placeholder="e.g. study" onChange={(e) => setPrograms(programs.map((p) => p.id === item.id ? { ...p, calendarCategory: e.target.value } : p))} onBlur={() => updateCalendar(item, { calendarCategory: item.calendarCategory || null })} /><div className="flex gap-5 text-sm"><label className="flex gap-2 items-center"><Switch checked={item.syncAssessmentCalendar} onCheckedChange={(checked) => updateCalendar(item, { syncAssessmentCalendar: checked })} />Assessments</label><label className="flex gap-2 items-center"><Switch checked={item.syncDeadlineCalendar} onCheckedChange={(checked) => updateCalendar(item, { syncDeadlineCalendar: checked })} />Census/withdrawal</label></div></div>
          <div className="border-t pt-3 space-y-2"><Label>Evaluate an effective grading scale</Label><p className="text-xs text-muted-foreground">Uses only a scale in force on the chosen date; it never converts between metrics.</p><div className="flex flex-wrap gap-2"><Select value={evaluation.programId === item.id ? evaluation.method : item.gradingMethod} onValueChange={(method) => setEvaluation({ ...evaluation, programId: item.id, method })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select><Input className="w-24" type="number" placeholder="Score" value={evaluation.programId === item.id ? evaluation.input : ''} onChange={(e) => setEvaluation({ ...evaluation, programId: item.id, input: e.target.value })} /><Input className="w-40" type="date" value={evaluation.evaluatedAt} onChange={(e) => setEvaluation({ ...evaluation, evaluatedAt: e.target.value })} /><Button size="sm" variant="outline" onClick={() => evaluateScale(item.id)}>Evaluate</Button></div>{evaluation.programId === item.id && evaluationResult && <p className={`text-xs ${evaluationResult.error ? 'text-destructive' : 'text-muted-foreground'}`}>{evaluationResult.error ?? `${evaluationResult.formula} Result: ${evaluationResult.value ?? evaluationResult.outcome}`}</p>}</div>
        </CardContent>
      </Card>)}

    <Card><CardHeader><div className="flex justify-between"><CardTitle className="text-base">Task suggestions</CardTitle><Button size="sm" variant="outline" onClick={async () => { await send('/api/study/suggestions', {}); await load() }}>Refresh suggestions</Button></div></CardHeader><CardContent className="space-y-2">{suggestions.filter((s) => s.status === 'pending').length === 0 ? <p className="text-sm text-muted-foreground">No suggestions awaiting approval. Nothing is created automatically.</p> : suggestions.filter((s) => s.status === 'pending').map((s) => <div key={s.id} className="flex items-center justify-between border rounded-md p-2 text-sm"><span>{s.title}{s.dueAt ? ` · ${formatDate(s.dueAt)}` : ''}</span><span><Button size="icon-sm" variant="ghost" onClick={() => decide(s.id, 'approve')}><Check className="h-4 w-4" /></Button><Button size="icon-sm" variant="ghost" onClick={() => decide(s.id, 'reject')}><X className="h-4 w-4" /></Button></span></div>)}</CardContent></Card>

    <Dialog open={programOpen} onOpenChange={setProgramOpen}><DialogContent><DialogHeader><DialogTitle>New program</DialogTitle></DialogHeader><Label>Name</Label><Input value={program.name} onChange={(e) => setProgram({ ...program, name: e.target.value })} /><Label>Institution</Label><Input value={program.institution} onChange={(e) => setProgram({ ...program, institution: e.target.value })} /><Label>Native grading method</Label><Select value={program.gradingMethod} onValueChange={(value) => setProgram({ ...program, gradingMethod: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select><Button onClick={createProgram}>Create</Button></DialogContent></Dialog>
    <Dialog open={unitOpen} onOpenChange={setUnitOpen}><DialogContent><DialogHeader><DialogTitle>Add unit</DialogTitle></DialogHeader><Label>Code</Label><Input value={unit.code} onChange={(e) => setUnit({ ...unit, code: e.target.value })} /><Label>Name</Label><Input value={unit.name} onChange={(e) => setUnit({ ...unit, name: e.target.value })} /><Label>Credit points</Label><Input type="number" value={unit.creditPoints} onChange={(e) => setUnit({ ...unit, creditPoints: e.target.value })} /><Button onClick={createUnit}>Add unit</Button></DialogContent></Dialog>
    <Dialog open={assessmentOpen} onOpenChange={setAssessmentOpen}><DialogContent><DialogHeader><DialogTitle>Add assessment</DialogTitle></DialogHeader><Label>Name</Label><Input value={assessment.name} onChange={(e) => setAssessment({ ...assessment, name: e.target.value })} /><Label>Due date</Label><Input type="datetime-local" value={assessment.dueAt} onChange={(e) => setAssessment({ ...assessment, dueAt: e.target.value })} /><Label>Weight (%)</Label><Input type="number" value={assessment.weight} onChange={(e) => setAssessment({ ...assessment, weight: e.target.value })} /><Button onClick={createAssessment}>Add assessment</Button></DialogContent></Dialog>
    <Dialog open={periodOpen} onOpenChange={setPeriodOpen}><DialogContent><DialogHeader><DialogTitle>Add teaching period</DialogTitle></DialogHeader><Label>Name</Label><Input value={period.name} onChange={(e) => setPeriod({ ...period, name: e.target.value })} /><div className="grid grid-cols-2 gap-3"><div><Label>Starts</Label><Input type="date" value={period.startDate} onChange={(e) => setPeriod({ ...period, startDate: e.target.value })} /></div><div><Label>Ends</Label><Input type="date" value={period.endDate} onChange={(e) => setPeriod({ ...period, endDate: e.target.value })} /></div><div><Label>Census date</Label><Input type="date" value={period.censusDate} onChange={(e) => setPeriod({ ...period, censusDate: e.target.value })} /></div><div><Label>Withdrawal date</Label><Input type="date" value={period.withdrawalDate} onChange={(e) => setPeriod({ ...period, withdrawalDate: e.target.value })} /></div></div><Button onClick={createPeriod}>Add period</Button></DialogContent></Dialog>
    <StudyImportDialog open={importOpen} onOpenChange={setImportOpen} programs={programs} initialProgramId={selected} onImported={load} />
  </div>
}
