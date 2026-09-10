'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Target, Plus, Trash2, Pencil, CheckCircle2, ListChecks, FolderGit2, Link2, History, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'
import { SafeDate } from '@/components/safe-format'

type Measure = {
  id: string
  text: string
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  done: boolean
  dueDate?: string | null
  completedAt?: string | null
}

const categoryColors: Record<string, string> = {
  health: 'bg-red-500/20 text-red-400',
  financial: 'bg-emerald-500/20 text-emerald-400',
  personal: 'bg-primary/20 text-primary',
  career: 'bg-blue-500/20 text-blue-400',
  study: 'bg-purple-500/20 text-purple-400',
}
const statusColors: Record<string, string> = {
  active: 'bg-primary/20 text-primary',
  completed: 'bg-emerald-500/20 text-emerald-400',
  paused: 'bg-amber-500/20 text-amber-400',
  abandoned: 'bg-muted text-muted-foreground',
}
const CATEGORIES = ['personal', 'health', 'financial', 'career', 'study']
const STATUSES = ['active', 'completed', 'paused', 'abandoned']

const emptyForm = {
  id: '', title: '', category: 'personal', targetValue: '', currentValue: '', unit: '',
  targetDate: '', progressDate: '', status: 'active', notes: '',
}

function uid() { return Math.random().toString(36).slice(2, 10) }
function today() { return new Date().toISOString().slice(0, 10) }
function isOverdue(measure: Measure) {
  return Boolean(!measure.done && measure.dueDate && new Date(`${measure.dueDate.slice(0, 10)}T23:59:59`).getTime() < Date.now())
}

const HISTORY_PAGE_SIZE = 20

export function GoalsClient() {
  const [goals, setGoals] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('active')
  const [form, setForm] = useState({ ...emptyForm })
  const [measures, setMeasures] = useState<Measure[]>([])
  const [newMeasure, setNewMeasure] = useState('')
  const [linkFor, setLinkFor] = useState<any | null>(null)
  const [progressCorrection, setProgressCorrection] = useState<{
    goalId: string
    entryId: string
    value: string
    recordedAt: string
  } | null>(null)
  const [savingProgressCorrection, setSavingProgressCorrection] = useState(false)
  const [historyGoal, setHistoryGoal] = useState<any | null>(null)
  const [historyEntries, setHistoryEntries] = useState<any[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPagination, setHistoryPagination] = useState<any | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([fetch('/api/goals'), fetch('/api/projects')])
      if (!g.ok || !p.ok) throw new Error()
      setGoals(await g.json())
      setProjects(await p.json())
    } catch { toast.error('Failed to load goals') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openHistory = async (goal: any, page = 1) => {
    setHistoryGoal(goal)
    setHistoryPage(page)
    setHistoryLoading(true)
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(goal.id)}?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`)
      if (!response.ok) throw new Error()
      const data = await response.json()
      setHistoryEntries(data.progressEntries ?? [])
      setHistoryPagination(data.pagination ?? null)
    } catch {
      toast.error('Failed to load progress history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openAdd = () => { setForm({ ...emptyForm, progressDate: today() }); setMeasures([]); setNewMeasure(''); setShowEdit(true) }
  const openEdit = (goal: any) => {
    setForm({
      id: goal.id, title: goal.title ?? '', category: goal.category ?? 'personal',
      targetValue: goal.targetValue?.toString() ?? '', currentValue: goal.currentValue?.toString() ?? '',
      unit: goal.unit ?? '', targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : '',
      progressDate: today(), status: goal.status ?? 'active', notes: goal.notes ?? '',
    })
    let ms: Measure[] = []
    try { ms = goal.milestones ? JSON.parse(goal.milestones) : [] } catch { ms = [] }
    setMeasures(Array.isArray(ms) ? ms : [])
    setNewMeasure('')
    setShowEdit(true)
  }

  const addMeasure = () => {
    if (!newMeasure.trim()) return
    setMeasures([...measures, { id: uid(), text: newMeasure.trim(), targetValue: null, currentValue: null, unit: null, done: false }])
    setNewMeasure('')
  }
  const toggleMeasure = (id: string) => setMeasures(measures.map((m) => {
    if (m.id !== id) return m
    const done = !m.done
    return { ...m, done, completedAt: done ? new Date().toISOString() : null }
  }))
  const setMeasureDueDate = (id: string, dueDate: string) => setMeasures(measures.map((m) => m.id === id ? { ...m, dueDate: dueDate || null } : m))
  const removeMeasure = (id: string) => setMeasures(measures.filter((m) => m.id !== id))

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      category: form.category,
      targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
      currentValue: form.currentValue ? parseFloat(form.currentValue) : 0,
      unit: form.unit || null,
      targetDate: form.targetDate || null,
      progressDate: form.progressDate || null,
      status: form.status,
      milestones: measures,
      notes: form.notes || null,
    }
    try {
      const res = await fetch(form.id ? `/api/goals/${form.id}` : '/api/goals', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(form.id ? 'Goal updated' : 'Goal created')
      setShowEdit(false)
      fetchAll()
    } catch { toast.error('Failed to save goal') }
    finally { setSaving(false) }
  }

  const quickStatus = async (goal: any, status: string) => {
    try {
      await fetch(`/api/goals/${goal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      toast.success(`Marked ${status}`)
      fetchAll()
    } catch { toast.error('Failed to update') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this goal? Linked projects will be unlinked but not deleted.')) return
    try {
      await fetch(`/api/goals/${id}`, { method: 'DELETE' })
      toast.success('Goal deleted')
      fetchAll()
    } catch { toast.error('Failed to delete') }
  }

  const openProgressCorrection = (goal: any, entry: any) => {
    setProgressCorrection({
      goalId: goal.id,
      entryId: entry.id,
      value: String(entry.value),
      recordedAt: entry.recordedAt?.slice(0, 10) ?? today(),
    })
  }

  const saveProgressCorrection = async () => {
    if (!progressCorrection) return
    const value = Number(progressCorrection.value)
    if (!Number.isFinite(value)) {
      toast.error('Enter a valid progress value')
      return
    }
    if (!progressCorrection.recordedAt) {
      toast.error('Choose a progress date')
      return
    }
    if (!confirm('Correct this progress entry? The goal’s current value will follow the newest entry.')) return

    setSavingProgressCorrection(true)
    try {
      const response = await fetch(`/api/goals/${progressCorrection.goalId}/progress/${progressCorrection.entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value,
          recordedAt: progressCorrection.recordedAt,
          confirmed: true,
        }),
      })
      if (!response.ok) throw new Error()
      setProgressCorrection(null)
      toast.success('Progress entry corrected')
      await fetchAll()
    } catch {
      toast.error('Failed to correct progress entry')
    } finally {
      setSavingProgressCorrection(false)
    }
  }

  const removeProgressEntry = async (goal: any, entry: any) => {
    if (!confirm('Remove this progress entry? The goal’s current value will follow the newest remaining entry.')) return
    try {
      const response = await fetch(`/api/goals/${goal.id}/progress/${entry.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
      if (!response.ok) throw new Error()
      toast.success('Progress entry removed')
      await fetchAll()
    } catch {
      toast.error('Failed to remove progress entry')
    }
  }

  const toggleProjectLink = async (project: any, goalId: string) => {
    const newGoalId = project.goalId === goalId ? '' : goalId
    try {
      await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId: newGoalId }) })
      fetchAll()
    } catch { toast.error('Failed to link project') }
  }

  const progressPct = (goal: any) => {
    if (goal.targetValue && goal.targetValue > 0) {
      return Math.min(100, Math.round(((goal.currentValue ?? 0) / goal.targetValue) * 100))
    }
    let ms: Measure[] = []
    try { ms = goal.milestones ? JSON.parse(goal.milestones) : [] } catch { ms = [] }
    if (ms.length > 0) return Math.round((ms.filter((m) => m.done).length / ms.length) * 100)
    return goal.status === 'completed' ? 100 : 0
  }

  const visible = (goals ?? []).filter((g: any) => tab === 'all' ? true : g.status === tab)
  const counts = STATUSES.reduce((acc, s) => { acc[s] = (goals ?? []).filter((g: any) => g.status === s).length; return acc }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-6 w-6" /> Goals &amp; Objectives
            </h1>
            <p className="text-muted-foreground text-sm mt-1">SMART goals with measurable objectives, linked to your projects.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> New Goal</Button>
        </div>
      </FadeIn>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active{counts.active ? ` (${counts.active})` : ''}</TabsTrigger>
          <TabsTrigger value="completed">Completed{counts.completed ? ` (${counts.completed})` : ''}</TabsTrigger>
          <TabsTrigger value="paused">Paused{counts.paused ? ` (${counts.paused})` : ''}</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : visible.length === 0 ? (
        <FadeIn>
          <Card className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground mt-4">No {tab === 'all' ? '' : tab} goals yet</p>
            <Button variant="outline" className="mt-4" onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Create your first goal</Button>
          </Card>
        </FadeIn>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((goal: any) => {
            let ms: Measure[] = []
            try { ms = goal.milestones ? JSON.parse(goal.milestones) : [] } catch { ms = [] }
            const pct = progressPct(goal)
            return (
              <FadeIn key={goal.id}>
                <Card className="h-full">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[10px] ${categoryColors[goal.category] ?? categoryColors.personal}`}>{goal.category}</Badge>
                          <Badge className={`text-[10px] ${statusColors[goal.status] ?? statusColors.active}`}>{goal.status}</Badge>
                        </div>
                        <h3 className="font-semibold leading-tight">{goal.title}</h3>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(goal)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(goal.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>
                          {goal.targetValue && goal.targetValue > 0
                            ? `${goal.currentValue ?? 0} / ${goal.targetValue}${goal.unit ? ' ' + goal.unit : ''}`
                            : `${pct}%`}
                        </span>
                      </div>
                      <Progress value={pct} />
                    </div>

                    {(goal.progressEntryCount ?? goal._count?.progressEntries ?? goal.progressEntries?.length ?? 0) > 0 && (
                      <div className="rounded-md border border-border/60 px-3 py-2">
                        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <History className="h-3.5 w-3.5" />
                          <span>Progress history · Recent progress</span>
                          <span className="ml-auto">
                            {goal.progressEntryCount ?? goal._count?.progressEntries ?? goal.progressEntries?.length ?? 0} entries
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                          {goal.progressEntries.map((entry: any) => (
                            <div key={entry.id} className="flex items-center gap-2 text-xs">
                              <SafeDate date={entry.recordedAt} options={{ year: 'numeric', month: 'short', day: 'numeric' }} />
                              <span className="font-medium">{entry.value}{goal.unit ? ` ${goal.unit}` : ''}</span>
                              <div className="ml-auto flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-6 w-6"
                                  title="Correct progress entry"
                                  aria-label={`Correct progress entry from ${entry.recordedAt?.slice(0, 10) ?? 'unknown date'}`}
                                  onClick={() => openProgressCorrection(goal, entry)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  title="Remove progress entry"
                                  aria-label={`Remove progress entry from ${entry.recordedAt?.slice(0, 10) ?? 'unknown date'}`}
                                  onClick={() => removeProgressEntry(goal, entry)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button type="button" variant="link" size="xs" className="mt-1 h-auto px-0 text-xs" onClick={() => openHistory(goal)}>
                          View complete history
                        </Button>
                      </div>
                    )}

                    {goal.targetDate && (
                      <p className="text-xs text-muted-foreground">Target: <SafeDate date={goal.targetDate} options={{ year: 'numeric', month: 'long', day: 'numeric' }} /></p>
                    )}

                    {ms.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> Objectives</p>
                        <div className="space-y-1">
                          {ms.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 text-sm flex-wrap">
                              <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${m.done ? 'text-emerald-400' : 'text-muted-foreground/40'}`} />
                              <span className={m.done ? 'line-through text-muted-foreground' : ''}>{m.text}</span>
                              {m.dueDate && (
                                <Badge variant="outline" className={`ml-auto text-[10px] ${isOverdue(m) ? 'border-destructive/60 text-destructive' : ''}`}>
                                  {isOverdue(m) && <AlertTriangle className="mr-1 h-3 w-3" />}
                                  {isOverdue(m) ? 'Overdue · ' : 'Due '}
                                  <SafeDate date={m.dueDate} options={{ month: 'short', day: 'numeric' }} />
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FolderGit2 className="h-3.5 w-3.5" /> Linked projects</p>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setLinkFor(goal)}><Link2 className="h-3 w-3 mr-1" /> Manage</Button>
                      </div>
                      {(goal.projects ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground/60">No projects linked</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {goal.projects.map((p: any) => (
                            <Badge key={p.id} variant="outline" className="text-[10px]">{p.name} · {p._count?.tasks ?? 0} tasks</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {goal.notes && <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{goal.notes}</p>}

                    {goal.status !== 'completed' && (
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => quickStatus(goal, 'completed')}>Mark complete</Button>
                        {goal.status === 'active'
                          ? <Button variant="ghost" size="sm" className="text-xs" onClick={() => quickStatus(goal, 'paused')}>Pause</Button>
                          : <Button variant="ghost" size="sm" className="text-xs" onClick={() => quickStatus(goal, 'active')}>Resume</Button>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>
            )
          })}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? 'Edit Goal' : 'New Goal'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="Run a 5km without a POTS flare" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v: string) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><Label>Current</Label><Input type="number" value={form.currentValue} onChange={(e: any) => setForm({ ...form, currentValue: e.target.value })} placeholder="0" /></div>
              <div><Label>Target</Label><Input type="number" value={form.targetValue} onChange={(e: any) => setForm({ ...form, targetValue: e.target.value })} placeholder="5" /></div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })} placeholder="km" /></div>
            </div>
            {form.targetValue && (
              <div>
                <Label>Progress recorded on</Label>
                <Input type="date" value={form.progressDate} onChange={(e: any) => setForm({ ...form, progressDate: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">Changing the current value adds a history entry on this date.</p>
              </div>
            )}
            <div><Label>Target date (Time-bound)</Label><Input type="date" value={form.targetDate} onChange={(e: any) => setForm({ ...form, targetDate: e.target.value })} /></div>

            <div className="space-y-2">
              <Label>Objectives / measures</Label>
              {measures.length > 0 && (
                <div className="space-y-1.5">
                  {measures.map((m) => (
                    <div key={m.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-border/50 p-2">
                      <Checkbox checked={m.done} onCheckedChange={() => toggleMeasure(m.id)} aria-label={`Mark ${m.text} complete`} />
                      <span className={`text-sm ${m.done ? 'line-through text-muted-foreground' : ''}`}>{m.text}</span>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeMeasure(m.id)} aria-label={`Remove ${m.text}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      <div className="col-start-2 col-span-2 flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground" htmlFor={`due-${m.id}`}>Due</Label>
                        <Input id={`due-${m.id}`} className="h-8 max-w-44" type="date" value={m.dueDate?.slice(0, 10) ?? ''} onChange={(e: any) => setMeasureDueDate(m.id, e.target.value)} />
                        {isOverdue(m) && <span className="text-xs text-destructive">Overdue</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={newMeasure} onChange={(e: any) => setNewMeasure(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addMeasure() } }} placeholder="Add a measurable objective" />
                <Button type="button" variant="outline" onClick={addMeasure}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>

            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="Why this matters, how you'll measure it, any constraints" /></div>
            <Button onClick={handleSave} className="w-full" loading={saving}>{form.id ? 'Save changes' : 'Create goal'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress correction dialog */}
      <Dialog open={!!progressCorrection} onOpenChange={(open: boolean) => { if (!open && !savingProgressCorrection) setProgressCorrection(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Correct progress entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="progress-correction-value">Value</Label>
              <Input
                id="progress-correction-value"
                type="number"
                value={progressCorrection?.value ?? ''}
                onChange={(event: any) => setProgressCorrection((current) => current ? { ...current, value: event.target.value } : current)}
              />
            </div>
            <div>
              <Label htmlFor="progress-correction-date">Recorded on</Label>
              <Input
                id="progress-correction-date"
                type="date"
                value={progressCorrection?.recordedAt ?? ''}
                onChange={(event: any) => setProgressCorrection((current) => current ? { ...current, recordedAt: event.target.value } : current)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Correcting this entry changes the goal’s current value when this becomes the newest entry.
            </p>
            <Button onClick={saveProgressCorrection} className="w-full" loading={savingProgressCorrection}>Correct entry</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full progress history dialog */}
      <Dialog open={!!historyGoal} onOpenChange={(open: boolean) => {
        if (!open) {
          setHistoryGoal(null)
          setHistoryEntries([])
          setHistoryPagination(null)
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Progress history{historyGoal ? ` · ${historyGoal.title}` : ''}</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="space-y-2" aria-label="Loading progress history">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No progress entries recorded.</p>
          ) : (
            <div className="space-y-1">
              {historyEntries.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-sm">
                  <SafeDate date={entry.recordedAt} options={{ year: 'numeric', month: 'short', day: 'numeric' }} />
                  <span className="font-medium">{entry.value}{historyGoal?.unit ? ` ${historyGoal.unit}` : ''}</span>
                </div>
              ))}
            </div>
          )}
          {historyPagination && historyPagination.totalEntries > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
              <span className="text-xs text-muted-foreground">
                Page {historyPage} of {historyPagination.totalPages} · {historyPagination.totalEntries} entries
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous history page"
                  disabled={!historyPagination.hasPreviousPage || historyLoading}
                  onClick={() => historyGoal && openHistory(historyGoal, historyPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next history page"
                  disabled={!historyPagination.hasNextPage || historyLoading}
                  onClick={() => historyGoal && openHistory(historyGoal, historyPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link projects dialog */}
      <Dialog open={!!linkFor} onOpenChange={(o: boolean) => { if (!o) setLinkFor(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Link projects to “{linkFor?.title}”</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(projects ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet. Create projects from the Tasks module.</p>
            ) : (
              projects.map((p: any) => {
                const linkedHere = p.goalId === linkFor?.id
                const linkedElsewhere = p.goalId && p.goalId !== linkFor?.id
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <Checkbox checked={linkedHere} onCheckedChange={() => linkFor && toggleProjectLink(p, linkFor.id)} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    {linkedElsewhere && <Badge variant="outline" className="text-[10px]">linked to another goal</Badge>}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
