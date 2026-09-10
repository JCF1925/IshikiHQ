'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Heart, Plus, Trash2, Pencil, Activity, Pill } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate } from '@/components/safe-format'
import { HealthDisclaimer } from '@/components/health-disclaimer'

type Med = { id: string; name: string; strength: string | null; unit: string | null }
type Condition = {
  id: string; name: string; icd10Code: string | null; diagnosedDate: string | null; status: string; notes: string | null
  medications: Med[]; symptoms: { id: string; name: string }[]
  flares: { id: string; startDate: string; endDate: string | null; severity: number | null }[]
}

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'managed', label: 'Managed' },
  { value: 'in_remission', label: 'In remission' },
  { value: 'resolved', label: 'Resolved' },
]
const statusColor: Record<string, string> = {
  active: 'bg-red-500/15 text-red-400 border-red-500/30',
  managed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  in_remission: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}
const labelOf = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s

const emptyForm = { name: '', icd10Code: '', diagnosedDate: '', status: 'active', notes: '', medicationIds: [] as string[] }

export function ConditionsClient() {
  const [conditions, setConditions] = useState<Condition[]>([])
  const [meds, setMeds] = useState<Med[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Condition | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const fetchData = useCallback(async () => {
    try {
      const [cRes, mRes] = await Promise.all([fetch('/api/conditions'), fetch('/api/medications')])
      if (!cRes.ok || !mRes.ok) throw new Error()
      setConditions(await cRes.json())
      setMeds(await mRes.json())
    } catch { toast.error('Failed to load conditions') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setShowDialog(true) }
  const openEdit = (c: Condition) => {
    setEditing(c)
    setForm({
      name: c.name, icd10Code: c.icd10Code ?? '', diagnosedDate: c.diagnosedDate ? c.diagnosedDate.slice(0, 10) : '',
      status: c.status, notes: c.notes ?? '', medicationIds: c.medications.map((m) => m.id),
    })
    setShowDialog(true)
  }

  const toggleMed = (id: string) => {
    setForm((f) => ({ ...f, medicationIds: f.medicationIds.includes(id) ? f.medicationIds.filter((x) => x !== id) : [...f.medicationIds, id] }))
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/conditions/${editing.id}` : '/api/conditions'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Condition updated' : 'Condition added')
      setShowDialog(false)
      fetchData()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const remove = async (c: Condition) => {
    if (!confirm(`Delete "${c.name}"?`)) return
    try {
      const res = await fetch(`/api/conditions/${c.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted')
      fetchData()
    } catch { toast.error('Failed to delete') }
  }

  const medLabel = (m: Med) => `${m.name}${m.strength ? ` ${m.strength}${m.unit ?? ''}` : ''}`

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Conditions</h1>
            <p className="text-sm text-muted-foreground mt-1">Your medical history, diagnoses and linked treatments.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add condition</Button>
        </div>
      </FadeIn>

      <HealthDisclaimer />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : conditions.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No conditions recorded yet. Add your first to start tracking.</CardContent></Card>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2">
          {conditions.map((c) => {
            const activeFlare = c.flares.find((f) => !f.endDate)
            return (
              <StaggerItem key={c.id}>
                <Card className="h-full">
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{c.name}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <Badge variant="outline" className={statusColor[c.status] ?? ''}>{labelOf(c.status)}</Badge>
                        {c.icd10Code && <span className="text-xs text-muted-foreground">ICD-10 {c.icd10Code}</span>}
                        {activeFlare && <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">Active flare</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {c.diagnosedDate && <p className="text-xs text-muted-foreground">Diagnosed <SafeDate date={c.diagnosedDate} options={{ dateStyle: 'medium' }} /></p>}
                    {c.medications.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Pill className="h-3 w-3" /> Medications</p>
                        <div className="flex flex-wrap gap-1">{c.medications.map((m) => <Badge key={m.id} variant="secondary" className="text-xs">{medLabel(m)}</Badge>)}</div>
                      </div>
                    )}
                    {c.symptoms.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Activity className="h-3 w-3" /> Symptoms</p>
                        <div className="flex flex-wrap gap-1">{c.symptoms.map((s) => <Badge key={s.id} variant="outline" className="text-xs">{s.name}</Badge>)}</div>
                      </div>
                    )}
                    {c.flares.length > 0 && <p className="text-xs text-muted-foreground">{c.flares.length} flare{c.flares.length > 1 ? 's' : ''} recorded</p>}
                    {c.notes && <p className="text-xs text-muted-foreground line-clamp-2">{c.notes}</p>}
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent aria-describedby="condition-dialog-description" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit condition' : 'Add condition'}</DialogTitle></DialogHeader>
          <p id="condition-dialog-description" className="sr-only">Add or edit a health condition and its details.</p>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Postural Orthostatic Tachycardia Syndrome" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ICD-10 code</Label>
                <Input value={form.icd10Code} onChange={(e) => setForm({ ...form, icd10Code: e.target.value })} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Diagnosed date</Label>
              <Input type="date" value={form.diagnosedDate} onChange={(e) => setForm({ ...form, diagnosedDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Linked medications</Label>
              {meds.length === 0 ? (
                <p className="text-xs text-muted-foreground">No medications yet. Add them on the Medications page.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {meds.map((m) => (
                    <button key={m.id} type="button" onClick={() => toggleMed(m.id)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${form.medicationIds.includes(m.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                      {medLabel(m)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add condition'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
