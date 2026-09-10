'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckSquare, Plus, Trash2, List, LayoutGrid, Sparkles, FolderGit2, Building2, CalendarDays, Target } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'
import { SafeDate } from '@/components/safe-format'

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const priorityColors: Record<string, string> = {
  urgent: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-muted text-muted-foreground',
}
const statusLabels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled' }

export function TasksClient() {
  const [tasks, setTasks] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [organisations, setOrganisations] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genSaving, setGenSaving] = useState(false)
  const [candidates, setCandidates] = useState<any[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>('kanban')
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '', dueTime: '', tags: '', projectId: '', isUrgent: false, isImportant: false })
  const [showProject, setShowProject] = useState(false)
  const [projectSaving, setProjectSaving] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', description: '', organisationId: '', goalId: '' })

  const fetchTasks = useCallback(async () => {
    try {
      const [res, projectRes, orgRes, goalRes] = await Promise.all([
        fetch('/api/tasks'), fetch('/api/projects'), fetch('/api/organisations'), fetch('/api/goals'),
      ])
      if (!res.ok || !projectRes.ok || !orgRes.ok || !goalRes.ok) throw new Error()
      const [taskData, projectData, orgData, goalData] = await Promise.all([res.json(), projectRes.json(), orgRes.json(), goalRes.json()])
      setTasks(taskData)
      setProjects(projectData)
      setOrganisations(orgData)
      setGoals(goalData)
    } catch { toast.error('Failed to load tasks') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleAdd = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()) : [] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Task added')
      setShowAdd(false)
       setForm({ title: '', description: '', priority: 'medium', dueDate: '', dueTime: '', tags: '', projectId: '', isUrgent: false, isImportant: false })
      fetchTasks()
    } catch { toast.error('Failed to add task') }
    finally { setSaving(false) }
  }

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      fetchTasks()
    } catch { toast.error('Failed to update') }
  }

  const createProject = async () => {
    if (!projectForm.name.trim()) { toast.error('Project name is required'); return }
    setProjectSaving(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectForm,
          organisationId: projectForm.organisationId || null,
          goalId: projectForm.goalId || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Work project created')
      setShowProject(false)
      setProjectForm({ name: '', description: '', organisationId: '', goalId: '' })
      fetchTasks()
    } catch { toast.error('Failed to create project') }
    finally { setProjectSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      toast.success('Task deleted')
      fetchTasks()
    } catch { toast.error('Failed to delete') }
  }

  const openGenerate = async () => {
    setShowGen(true)
    setGenLoading(true)
    setCandidates([])
    try {
      const res = await fetch('/api/tasks/generate')
      if (!res.ok) throw new Error()
      const data = await res.json()
      const cands = data?.candidates ?? []
      setCandidates(cands)
      const initial: Record<string, boolean> = {}
      cands.forEach((c: any) => { initial[c.moduleRef] = true })
      setPicked(initial)
    } catch { toast.error('Failed to scan for suggestions') }
    finally { setGenLoading(false) }
  }

  const handleGenerate = async () => {
    const moduleRefs = Object.keys(picked).filter((k) => picked[k])
    if (moduleRefs.length === 0) { toast.error('Select at least one suggestion'); return }
    setGenSaving(true)
    try {
      const res = await fetch('/api/tasks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleRefs }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success(`Created ${data?.created ?? moduleRefs.length} task${(data?.created ?? moduleRefs.length) === 1 ? '' : 's'}`)
      setShowGen(false)
      fetchTasks()
    } catch { toast.error('Failed to create tasks') }
    finally { setGenSaving(false) }
  }

  const sourceColors: Record<string, string> = {
    stock: 'bg-orange-500/20 text-orange-400',
    prescription: 'bg-purple-500/20 text-purple-400',
    bill: 'bg-amber-500/20 text-amber-400',
    appointment: 'bg-sky-500/20 text-sky-400',
  }

  const statuses = ['todo', 'in_progress', 'done']

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
              <CheckSquare className="h-6 w-6" /> Tasks
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your to-do list, projects, and deadlines.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-lg p-0.5">
              <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'kanban' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setView('list')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="outline" onClick={openGenerate}><Sparkles className="h-4 w-4 mr-2" /> Generate</Button>
            <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" /> Add Task</Button>
          </div>
        </div>
      </FadeIn>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><FolderGit2 className="h-4 w-4" /> Work projects</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Connect work to your organisations, goals, tasks and Calendar events.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowProject(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Project</Button>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? <p className="text-sm text-muted-foreground">No work projects yet.</p> : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project: any) => (
                <div key={project.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">{project.name}</span><Badge variant="outline">{project.status}</Badge></div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {project.organisation && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{project.organisation.name}</span>}
                    {project.goal && <span className="flex items-center gap-1"><Target className="h-3 w-3" />{project.goal.title}</span>}
                    <span>{project._count?.tasks ?? 0} tasks</span>
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{project._count?.events ?? 0} events</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statuses.map((status) => {
            const statusTasks = (tasks ?? []).filter((t: any) => t?.status === status)
              .sort((a: any, b: any) => (priorityOrder[a?.priority ?? 'medium'] ?? 2) - (priorityOrder[b?.priority ?? 'medium'] ?? 2))
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-medium text-sm">{statusLabels[status] ?? status}</h3>
                  <Badge variant="secondary" className="text-[10px]">{statusTasks.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px] p-2 rounded-lg bg-muted/30">
                  {statusTasks.map((t: any) => (
                    <Card key={t?.id} className="transition-all hover:shadow-md">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium">{t?.title ?? 'Untitled'}</p>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(t?.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        {t?.dueDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Due <SafeDate date={t.dueDate} options={{ dateStyle: 'medium' }} />
                          </p>
                        )}
                        {(t?.isUrgent || t?.isImportant) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {t?.isUrgent && <Badge className="text-[9px] bg-destructive/20 text-destructive">Urgent</Badge>}
                            {t?.isImportant && <Badge className="text-[9px] bg-primary/20 text-primary">Important</Badge>}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <Badge className={`text-[10px] ${priorityColors[t?.priority ?? 'medium']}`}>{t?.priority ?? 'medium'}</Badge>
                          <Select value={t?.status ?? 'todo'} onValueChange={(v: string) => updateStatus(t?.id, v)}>
                            <SelectTrigger className="h-6 text-[10px] w-auto border-0 bg-transparent px-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statuses.map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(t?.tags?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(t?.tags ?? []).map((tag: string) => (
                              <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">{tag}</span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <FadeIn>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(tasks ?? []).length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">No tasks yet</div>
                )}
                {(tasks ?? []).map((t: any) => (
                  <div key={t?.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={t?.status === 'done'}
                        onChange={() => updateStatus(t?.id, t?.status === 'done' ? 'todo' : 'done')}
                        className="rounded border-border"
                      />
                      <div>
                        <p className={`text-sm font-medium ${t?.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t?.title ?? 'Untitled'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {t?.dueDate && <span className="text-xs text-muted-foreground"><SafeDate date={t.dueDate} options={{ dateStyle: 'short' }} /></span>}
                          {t?.project && <span className="text-xs text-muted-foreground">{t.project.name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${priorityColors[t?.priority ?? 'medium']}`}>{t?.priority ?? 'medium'}</Badge>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(t?.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Add task dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="What needs doing?" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="Optional details" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: string) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(e: any) => setForm({ ...form, dueDate: e.target.value })} /></div>
            </div>
            <div><Label>Tags (comma-separated)</Label><Input value={form.tags} onChange={(e: any) => setForm({ ...form, tags: e.target.value })} placeholder="health, finance" /></div>
            <div>
              <Label>Work project</Label>
              <Select value={form.projectId || 'none'} onValueChange={(v) => setForm({ ...form, projectId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent><SelectItem value="none">No project</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.isUrgent} onChange={(e) => setForm({ ...form, isUrgent: e.target.checked })} className="rounded border-border h-4 w-4" />
                <span className="text-sm">Urgent</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.isImportant} onChange={(e) => setForm({ ...form, isImportant: e.target.checked })} className="rounded border-border h-4 w-4" />
                <span className="text-sm">Important</span>
              </label>
            </div>
            <Button onClick={handleAdd} className="w-full" loading={saving}>Add Task</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showProject} onOpenChange={setShowProject}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New work project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Organisation</Label>
                <Select value={projectForm.organisationId || 'none'} onValueChange={(v) => setProjectForm({ ...projectForm, organisationId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{organisations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Goal</Label>
                <Select value={projectForm.goalId || 'none'} onValueChange={(v) => setProjectForm({ ...projectForm, goalId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{goals.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Tasks can be assigned below. Calendar events can be linked through the project API while retaining their visibility settings.</p>
            <Button className="w-full" onClick={createProject} loading={projectSaving}>Create project</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate tasks dialog */}
      <Dialog open={showGen} onOpenChange={setShowGen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Suggested Tasks</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Automatically generated from your medications, bills, and appointments. Pick the ones you want to add.</p>
            {genLoading ? (
              <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Nothing needs attention right now. You&apos;re all caught up! 🎉</div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {candidates.map((c: any) => (
                  <label key={c.moduleRef} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors">
                    <Checkbox checked={!!picked[c.moduleRef]} onCheckedChange={(v: any) => setPicked((p) => ({ ...p, [c.moduleRef]: !!v }))} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.title}</span>
                        <Badge className={sourceColors[c.source] ?? 'bg-muted text-muted-foreground'} variant="secondary">{c.source}</Badge>
                        {c.priority && <Badge className={priorityColors[c.priority] ?? ''} variant="secondary">{c.priority}</Badge>}
                      </div>
                      {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                      {c.dueDate && <p className="text-xs text-muted-foreground mt-1">Due <SafeDate date={c.dueDate} /></p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
            {candidates.length > 0 && (
              <Button onClick={handleGenerate} className="w-full" loading={genSaving}>
                Create {Object.values(picked).filter(Boolean).length} task{Object.values(picked).filter(Boolean).length === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
