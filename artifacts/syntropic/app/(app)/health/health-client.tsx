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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, Plus, Trash2, HeartPulse, Brain, Utensils, TrendingUp, TrendingDown, Minus, Droplet, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate, SafeTime, SafeNumber } from '@/components/safe-format'
import { HealthDisclaimer } from '@/components/health-disclaimer'

type SymLog = { id: string; severity: number; loggedAt: string; triggers: string[]; notes: string | null }
type Symptom = { id: string; name: string; severityScale: number; logs: SymLog[]; conditions: { id: string; name: string }[] }
type VitalLog = { id: string; value: number; loggedAt: string; device: string | null; notes: string | null }
type VitalType = { id: string; name: string; unit: string; normalRangeLow: number | null; normalRangeHigh: number | null; logs: VitalLog[] }
type MoodLog = { id: string; mood: number; energy: number; anxiety: number | null; questionnaire: string | null; score: number | null; journal: string | null; loggedAt: string }
type NutLog = { id: string; mealType: string | null; description: string; kilojoules: number | null; protein: number | null; carbs: number | null; fat: number | null; hydrationMl: number | null; loggedAt: string }

const todayStr = () => new Date().toISOString().slice(0, 10)
function trend(logs: { severity?: number; value?: number }[], key: 'severity' | 'value') {
  if (logs.length < 2) return 0
  const latest = logs[0][key] ?? 0
  const prev = logs[1][key] ?? 0
  return latest - prev
}

export function HealthClient() {
  return (
    <FadeIn className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
        <Activity className="h-6 w-6 text-primary" /> Health Metrics
      </h1>
      <HealthDisclaimer />
      <Tabs defaultValue="symptoms">
        <TabsList>
          <TabsTrigger value="symptoms">Symptoms</TabsTrigger>
          <TabsTrigger value="vitals">Vitals</TabsTrigger>
          <TabsTrigger value="mood">Mood</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
        </TabsList>
        <TabsContent value="symptoms" className="pt-4"><SymptomsTab /></TabsContent>
        <TabsContent value="vitals" className="pt-4"><VitalsTab /></TabsContent>
        <TabsContent value="mood" className="pt-4"><MoodTab /></TabsContent>
        <TabsContent value="nutrition" className="pt-4"><NutritionTab /></TabsContent>
      </Tabs>
    </FadeIn>
  )
}

function TrendIcon({ delta, invert }: { delta: number; invert?: boolean }) {
  if (delta === 0) return <Minus className="h-4 w-4 text-muted-foreground" />
  const worse = invert ? delta < 0 : delta > 0
  const Icon = delta > 0 ? TrendingUp : TrendingDown
  return <Icon className={`h-4 w-4 ${worse ? 'text-rose-400' : 'text-emerald-400'}`} />
}

/* ---------------- SYMPTOMS ---------------- */
function SymptomsTab() {
  const [loading, setLoading] = useState(true)
  const [symptoms, setSymptoms] = useState<Symptom[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [logFor, setLogFor] = useState<Symptom | null>(null)
  const [sev, setSev] = useState('5')
  const [triggers, setTriggers] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [logging, setLogging] = useState(false)

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/symptoms')
    if (res.ok) setSymptoms(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const addSymptom = async () => {
    if (!name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    const res = await fetch('/api/symptoms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    setSaving(false)
    if (res.ok) { toast.success('Symptom added'); setName(''); setAddOpen(false); fetchData() } else toast.error('Failed')
  }
  const delSymptom = async (id: string) => {
    const res = await fetch(`/api/symptoms/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchData() } else toast.error('Failed')
  }
  const openLog = (s: Symptom) => { setLogFor(s); setSev('5'); setTriggers(''); setLogNotes('') }
  const submitLog = async () => {
    if (!logFor) return
    setLogging(true)
    const res = await fetch('/api/symptom-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symptomId: logFor.id, severity: parseInt(sev), triggers: triggers.split(',').map((t) => t.trim()).filter(Boolean), notes: logNotes }) })
    setLogging(false)
    if (res.ok) { toast.success('Logged'); setLogFor(null); fetchData() } else toast.error('Failed')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add symptom</Button></div>
      {loading ? <Skeleton className="h-40 w-full" /> : symptoms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No symptoms tracked yet. Add one to start logging severity over time.</p>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {symptoms.map((s) => {
            const delta = trend(s.logs, 'severity')
            const latest = s.logs[0]
            return (
              <StaggerItem key={s.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        {s.conditions.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{s.conditions.map((c) => <Badge key={c.id} variant="outline" className="text-xs">{c.name}</Badge>)}</div>}
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => delSymptom(s.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {latest ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold">{latest.severity}</span>
                          <span className="text-xs text-muted-foreground">/ {s.severityScale}</span>
                          <TrendIcon delta={delta} invert />
                        </div>
                        <span className="text-xs text-muted-foreground"><SafeDate date={latest.loggedAt} options={{ dateStyle: 'medium' }} /></span>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">No logs yet.</p>}
                    {latest?.triggers && latest.triggers.length > 0 && <div className="flex flex-wrap gap-1">{latest.triggers.map((t, i) => <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>)}</div>}
                    <Button size="sm" variant="outline" className="w-full" onClick={() => openLog(s)}><Plus className="h-3 w-3 mr-1" /> Log severity</Button>
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add symptom</DialogTitle></DialogHeader>
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fatigue, brain fog, palpitations…" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button loading={saving} onClick={addSymptom}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Log {logFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Severity (1–{logFor?.severityScale ?? 10})</Label><Input type="number" min={1} max={logFor?.severityScale ?? 10} value={sev} onChange={(e) => setSev(e.target.value)} /></div>
            <div><Label>Triggers (comma-separated)</Label><Input value={triggers} onChange={(e) => setTriggers(e.target.value)} placeholder="heat, standing, stress" /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={logNotes} onChange={(e) => setLogNotes(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLogFor(null)}>Cancel</Button><Button loading={logging} onClick={submitLog}>Log</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- VITALS ---------------- */
function VitalsTab() {
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<VitalType[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', unit: '', normalRangeLow: '', normalRangeHigh: '' })
  const [saving, setSaving] = useState(false)
  const [logFor, setLogFor] = useState<VitalType | null>(null)
  const [val, setVal] = useState('')
  const [logging, setLogging] = useState(false)

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/vital-types')
    if (res.ok) setTypes(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const addType = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    const res = await fetch('/api/vital-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (res.ok) { toast.success('Vital added'); setForm({ name: '', unit: '', normalRangeLow: '', normalRangeHigh: '' }); setAddOpen(false); fetchData() } else toast.error('Failed')
  }
  const delType = async (id: string) => {
    const res = await fetch(`/api/vital-types/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchData() } else toast.error('Failed')
  }
  const openLog = (t: VitalType) => { setLogFor(t); setVal('') }
  const submitLog = async () => {
    if (!logFor || val === '') return
    setLogging(true)
    const res = await fetch('/api/vital-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vitalTypeId: logFor.id, value: val }) })
    setLogging(false)
    if (res.ok) { toast.success('Logged'); setLogFor(null); fetchData() } else toast.error('Failed')
  }

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-3">
          <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">Automatic sync from Apple Health and Home Assistant is scaffolded and coming soon. For now, log vitals manually — heart rate, HRV, sleep, temperature, steps, blood pressure and more.</p>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add vital type</Button></div>
      {loading ? <Skeleton className="h-40 w-full" /> : types.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vitals tracked yet. Add a vital type (e.g. Resting HR, HRV, Sleep hours) to begin.</p>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => {
            const latest = t.logs[0]
            const delta = trend(t.logs, 'value')
            const outOfRange = latest && ((t.normalRangeLow != null && latest.value < t.normalRangeLow) || (t.normalRangeHigh != null && latest.value > t.normalRangeHigh))
            return (
              <StaggerItem key={t.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" /> {t.name}</CardTitle>
                      <Button size="icon-sm" variant="ghost" onClick={() => delType(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {latest ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl font-bold ${outOfRange ? 'text-amber-400' : ''}`}><SafeNumber value={latest.value} /></span>
                          <span className="text-xs text-muted-foreground">{t.unit}</span>
                          <TrendIcon delta={delta} />
                        </div>
                        <span className="text-xs text-muted-foreground"><SafeDate date={latest.loggedAt} options={{ dateStyle: 'medium' }} /></span>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">No readings yet.</p>}
                    {(t.normalRangeLow != null || t.normalRangeHigh != null) && <p className="text-xs text-muted-foreground">Normal: {t.normalRangeLow ?? ''}–{t.normalRangeHigh ?? ''} {t.unit}</p>}
                    <Button size="sm" variant="outline" className="w-full" onClick={() => openLog(t)}><Plus className="h-3 w-3 mr-1" /> Log reading</Button>
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add vital type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Resting heart rate" /></div>
            <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="bpm" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Normal low</Label><Input type="number" step="any" value={form.normalRangeLow} onChange={(e) => setForm({ ...form, normalRangeLow: e.target.value })} /></div>
              <div><Label>Normal high</Label><Input type="number" step="any" value={form.normalRangeHigh} onChange={(e) => setForm({ ...form, normalRangeHigh: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button loading={saving} onClick={addType}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Log {logFor?.name}</DialogTitle></DialogHeader>
          <div><Label>Value ({logFor?.unit})</Label><Input type="number" step="any" value={val} onChange={(e) => setVal(e.target.value)} autoFocus /></div>
          <DialogFooter><Button variant="outline" onClick={() => setLogFor(null)}>Cancel</Button><Button loading={logging} onClick={submitLog}>Log</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- MOOD ---------------- */
function MoodTab() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<MoodLog[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ mood: '3', energy: '3', anxiety: '', questionnaire: 'none', score: '', journal: '' })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/mood-logs')
    if (res.ok) setLogs(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const save = async () => {
    setSaving(true)
    const body = { ...form, questionnaire: form.questionnaire === 'none' ? null : form.questionnaire }
    const res = await fetch('/api/mood-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (res.ok) { toast.success('Logged'); setForm({ mood: '3', energy: '3', anxiety: '', questionnaire: 'none', score: '', journal: '' }); setOpen(false); fetchData() } else toast.error('Failed')
  }

  const faces = ['😢', '🙁', '😐', '🙂', '😄']
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Log mood</Button></div>
      {loading ? <Skeleton className="h-40 w-full" /> : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mood entries yet.</p>
      ) : (
        <Stagger className="space-y-2">
          {logs.map((l) => (
            <StaggerItem key={l.id}>
              <Card>
                <CardContent className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{faces[Math.min(4, Math.max(0, l.mood - 1))]}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="flex items-center gap-1"><Brain className="h-3 w-3" /> Mood {l.mood}/5</Badge>
                        <Badge variant="outline">Energy {l.energy}/5</Badge>
                        {l.anxiety != null && <Badge variant="outline">Anxiety {l.anxiety}/5</Badge>}
                        {l.questionnaire && l.score != null && <Badge variant="secondary">{l.questionnaire.toUpperCase()} {l.score}</Badge>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0"><SafeDate date={l.loggedAt} options={{ dateStyle: 'medium' }} /> · <SafeTime date={l.loggedAt} options={{ hour: '2-digit', minute: '2-digit' }} /></span>
                  </div>
                  {l.journal && <p className="text-sm text-muted-foreground">{l.journal}</p>}
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log mood & energy</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Mood (1–5)</Label><Input type="number" min={1} max={5} value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} /></div>
              <div><Label>Energy (1–5)</Label><Input type="number" min={1} max={5} value={form.energy} onChange={(e) => setForm({ ...form, energy: e.target.value })} /></div>
              <div><Label>Anxiety (1–5)</Label><Input type="number" min={1} max={5} value={form.anxiety} onChange={(e) => setForm({ ...form, anxiety: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Questionnaire</Label>
                <Select value={form.questionnaire} onValueChange={(v) => setForm({ ...form, questionnaire: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="phq9">PHQ-9</SelectItem><SelectItem value="gad7">GAD-7</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Score</Label><Input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} disabled={form.questionnaire === 'none'} /></div>
            </div>
            <div><Label>Journal</Label><Textarea rows={3} value={form.journal} onChange={(e) => setForm({ ...form, journal: e.target.value })} placeholder="How are you feeling?" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- NUTRITION ---------------- */
function NutritionTab() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<NutLog[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ mealType: 'breakfast', description: '', kilojoules: '', protein: '', carbs: '', fat: '', hydrationMl: '' })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/nutrition-logs')
    if (res.ok) setLogs(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const save = async () => {
    if (!form.description.trim()) { toast.error('Description required'); return }
    setSaving(true)
    const res = await fetch('/api/nutrition-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (res.ok) { toast.success('Logged'); setForm({ mealType: 'breakfast', description: '', kilojoules: '', protein: '', carbs: '', fat: '', hydrationMl: '' }); setOpen(false); fetchData() } else toast.error('Failed')
  }

  const today = todayStr()
  const hydrationToday = logs.filter((l) => l.loggedAt.slice(0, 10) === today).reduce((s, l) => s + (l.hydrationMl || 0), 0)
  const kjToday = logs.filter((l) => l.loggedAt.slice(0, 10) === today).reduce((s, l) => s + (l.kilojoules || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="flex items-center gap-3 py-4"><Droplet className="h-8 w-8 text-blue-400" /><div><div className="text-2xl font-bold"><SafeNumber value={hydrationToday} /> ml</div><div className="text-xs text-muted-foreground">Hydration today</div></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4"><Utensils className="h-8 w-8 text-primary" /><div><div className="text-2xl font-bold"><SafeNumber value={kjToday} /> kJ</div><div className="text-xs text-muted-foreground">Energy today</div></div></CardContent></Card>
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Log meal / drink</Button></div>
      {loading ? <Skeleton className="h-40 w-full" /> : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No nutrition entries yet.</p>
      ) : (
        <Stagger className="space-y-2">
          {logs.map((l) => (
            <StaggerItem key={l.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {l.mealType && <Badge variant="outline" className="capitalize">{l.mealType}</Badge>}
                      <span className="font-medium truncate">{l.description}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      {l.kilojoules != null && <span>{l.kilojoules} kJ</span>}
                      {l.protein != null && <span>P {l.protein}g</span>}
                      {l.carbs != null && <span>C {l.carbs}g</span>}
                      {l.fat != null && <span>F {l.fat}g</span>}
                      {l.hydrationMl != null && l.hydrationMl > 0 && <span>{l.hydrationMl} ml</span>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0"><SafeDate date={l.loggedAt} options={{ dateStyle: 'medium' }} /></span>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log meal / drink</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Meal type</Label>
              <Select value={form.mealType} onValueChange={(v) => setForm({ ...form, mealType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="breakfast">Breakfast</SelectItem><SelectItem value="lunch">Lunch</SelectItem><SelectItem value="dinner">Dinner</SelectItem><SelectItem value="snack">Snack</SelectItem><SelectItem value="drink">Drink</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Oats with berries" /></div>
            <div className="grid grid-cols-4 gap-2">
              <div><Label className="text-xs">kJ</Label><Input type="number" value={form.kilojoules} onChange={(e) => setForm({ ...form, kilojoules: e.target.value })} /></div>
              <div><Label className="text-xs">Protein</Label><Input type="number" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} /></div>
              <div><Label className="text-xs">Carbs</Label><Input type="number" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: e.target.value })} /></div>
              <div><Label className="text-xs">Fat</Label><Input type="number" value={form.fat} onChange={(e) => setForm({ ...form, fat: e.target.value })} /></div>
            </div>
            <div><Label>Hydration (ml)</Label><Input type="number" value={form.hydrationMl} onChange={(e) => setForm({ ...form, hydrationMl: e.target.value })} placeholder="250" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
