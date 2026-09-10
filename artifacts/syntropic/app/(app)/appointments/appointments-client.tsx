'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarClock, Plus, Trash2, MapPin, Stethoscope, Pencil, Zap, ClipboardList, FileEdit, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate, SafeTime, SafeNumber } from '@/components/safe-format'
import { AgendaManager } from '@/components/appointments/agenda-manager'
import { OutcomeManager } from '@/components/appointments/outcome-manager'

type Appt = {
  id: string; title: string; appointmentType: string | null; startTime: string; durationMinutes: number | null
  location: string | null; status: string; cost: number | null; medicareItem: string | null; medicareRebate: number | null
  outOfPocket: number | null; notes: string | null
  medicareRebateEligible: boolean; medicareRebateWarning: string | null
  referralStatus: string; referralStatusMessage: string; referralRemaining: number | null
  practitioner: { id: string; name: string; role: string | null; referralRequired: boolean } | null
  organisation: { id: string; name: string } | null
}

const TYPES = [
  { value: 'gp', label: 'GP' }, { value: 'specialist', label: 'Specialist' }, { value: 'procedure', label: 'Procedure' },
  { value: 'pathology', label: 'Pathology' }, { value: 'imaging', label: 'Imaging' }, { value: 'allied_health', label: 'Allied health' }, { value: 'dental', label: 'Dental' },
]
const typeLabel = (t: string | null) => TYPES.find((x) => x.value === t)?.label ?? t ?? 'Appointment'
const statusColor: Record<string, string> = {
  scheduled: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

const emptyForm = { title: '', appointmentType: '', practitionerId: '', organisationId: '', offeringId: '', referralId: '', startTime: '', durationMinutes: '', location: '', status: 'scheduled', cost: '', medicareItem: '', medicareRebate: '', outOfPocket: '', notes: '' }

export function AppointmentsClient() {
  const [appts, setAppts] = useState<Appt[]>([])
  const [practitioners, setPractitioners] = useState<{ id: string; name: string; role: string | null; referralRequired: boolean }[]>([])
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [referrals, setReferrals] = useState<any[]>([])
  const [symptoms, setSymptoms] = useState<{ id: string; name: string }[]>([])
  const [careData, setCareData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [editing, setEditing] = useState<Appt | null>(null)
  const [activeAgendaAppt, setActiveAgendaAppt] = useState<Appt | null>(null)
  const [activeOutcomeAppt, setActiveOutcomeAppt] = useState<Appt | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [quickForm, setQuickForm] = useState({ practitionerId: '', appointmentType: '', startTime: '', durationMinutes: '', location: '', cost: '', status: 'scheduled' })
  const [addingPract, setAddingPract] = useState(false)
  const [practForm, setPractForm] = useState({ name: '', role: '', phone: '', email: '', organisationId: '' })
  const [savingPract, setSavingPract] = useState(false)
  const selectedPractitioner = practitioners.find((p) => p.id === form.practitionerId)
  const selectedReferral = referrals.find((r) => r.id === form.referralId)

  const fetchAll = useCallback(async () => {
    try {
      const [aRes, pRes, oRes, rRes, sRes, careRes] = await Promise.all([
        fetch('/api/appointments'), fetch('/api/people'), fetch('/api/organisations'), fetch('/api/referrals'), fetch('/api/symptoms'), fetch('/api/appointment-care'),
      ])
      setAppts(await aRes.json())
      const people = await pRes.json()
      setPractitioners((people ?? []).filter((p: any) => p.type === 'practitioner').map((p: any) => ({ id: p.id, name: p.name, role: p.role, referralRequired: Boolean(p.referralRequired) })))
      setOrgs((await oRes.json()).map((o: any) => ({ id: o.id, name: o.name })))
      setReferrals(await rRes.json())
      setSymptoms((await sRes.json()).map((s: any) => ({ id: s.id, name: s.name })))
      setCareData(await careRes.json())
    } catch { toast.error('Failed to load appointments') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const createPractitioner = async (): Promise<string | null> => {
    if (!practForm.name.trim()) { toast.error('Practitioner name is required'); return null }
    setSavingPract(true)
    try {
      const res = await fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...practForm, type: 'practitioner', organisationId: practForm.organisationId || null }) })
      if (!res.ok) throw new Error()
      const p = await res.json()
      setPractitioners((prev) => [...prev, { id: p.id, name: p.name, role: p.role, referralRequired: Boolean(p.referralRequired) }].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Practitioner added')
      setPractForm({ name: '', role: '', phone: '', email: '', organisationId: '' })
      setAddingPract(false)
      return p.id
    } catch { toast.error('Failed to add practitioner'); return null }
    finally { setSavingPract(false) }
  }

  const practitionerField = (value: string, onChange: (v: string) => void) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Practitioner</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAddingPract((v) => !v)}>{addingPract ? 'Cancel' : '+ New'}</Button>
      </div>
      {addingPract ? (
        <div className="space-y-2 rounded-md border border-border p-2">
          <Input placeholder="Name *" value={practForm.name} onChange={(e) => setPractForm({ ...practForm, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Role (e.g. Cardiologist)" value={practForm.role} onChange={(e) => setPractForm({ ...practForm, role: e.target.value })} />
            <Input placeholder="Phone" value={practForm.phone} onChange={(e) => setPractForm({ ...practForm, phone: e.target.value })} />
          </div>
          <Input placeholder="Email" value={practForm.email} onChange={(e) => setPractForm({ ...practForm, email: e.target.value })} />
          <Button type="button" size="sm" className="w-full" loading={savingPract} onClick={async () => { const id = await createPractitioner(); if (id) onChange(id) }}>Save practitioner</Button>
        </div>
      ) : (
        <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Select practitioner" /></SelectTrigger>
          <SelectContent><SelectItem value="none">Not set</SelectItem>{practitioners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  )

  const openQuick = () => { setAddingPract(false); setQuickForm({ practitionerId: '', appointmentType: '', startTime: '', durationMinutes: '', location: '', cost: '', status: 'scheduled' }); setShowQuick(true) }
  const quickSave = async () => {
    if (!quickForm.practitionerId) { toast.error('Select or add a practitioner'); return }
    if (!quickForm.startTime) { toast.error('Pick a date & time'); return }
    setSaving(true)
    try {
      const pract = practitioners.find((p) => p.id === quickForm.practitionerId)
      const title = pract ? `${typeLabel(quickForm.appointmentType || null)} — ${pract.name}` : 'Appointment'
      const payload = { ...quickForm, title, appointmentType: quickForm.appointmentType || null }
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success('Appointment added'); setShowQuick(false); fetchAll()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const openAdd = () => { setAddingPract(false); setEditing(null); setForm({ ...emptyForm }); setShow(true) }
  const openEdit = (a: Appt) => {
    setAddingPract(false)
    setEditing(a)
    setForm({
      title: a.title, appointmentType: a.appointmentType ?? '', practitionerId: a.practitioner?.id ?? '', organisationId: a.organisation?.id ?? '', offeringId: (a as any).offeringId ?? '', referralId: (a as any).referral?.id ?? (a as any).referralId ?? '',
      startTime: a.startTime ? a.startTime.slice(0, 16) : '', durationMinutes: a.durationMinutes != null ? String(a.durationMinutes) : '',
      location: a.location ?? '', status: a.status, cost: a.cost != null ? String(a.cost) : '', medicareItem: a.medicareItem ?? '',
      medicareRebate: a.medicareRebate != null ? String(a.medicareRebate) : '', outOfPocket: a.outOfPocket != null ? String(a.outOfPocket) : '', notes: a.notes ?? '',
    })
    setShow(true)
  }

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const payload = { ...form, practitionerId: form.practitionerId || null, organisationId: form.organisationId || null, offeringId: form.offeringId || null, referralId: form.referralId || null }
      const url = editing ? `/api/appointments/${editing.id}` : '/api/appointments'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Appointment updated' : 'Appointment added'); setShow(false); fetchAll()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const remove = async (a: Appt) => { if (!confirm('Delete this appointment?')) return; await fetch(`/api/appointments/${a.id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchAll() }

  const now = Date.now()
  const upcoming = appts.filter((a) => new Date(a.startTime).getTime() >= now && a.status !== 'cancelled')
  const past = appts.filter((a) => new Date(a.startTime).getTime() < now || a.status === 'cancelled')

  const card = (a: Appt) => {
    const isPast = new Date(a.startTime).getTime() < now || a.status === 'cancelled'
    const hasAgenda = careData?.agenda?.some((ag: any) => ag.appointmentId === a.id)
    const hasOutcome = careData?.outcomes?.some((o: any) => o.appointmentId === a.id)

    return (
      <StaggerItem key={a.id}>
        <Card>
          <CardContent className="flex items-start justify-between gap-3 py-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{a.title}</p>
                <Badge variant="outline" className={statusColor[a.status] ?? ''}>{a.status}</Badge>
                {a.appointmentType && <Badge variant="secondary" className="text-xs">{typeLabel(a.appointmentType)}</Badge>}
                {hasAgenda && !isPast && <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px]">Agenda prepared</Badge>}
                {hasOutcome && isPast && <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Outcome recorded</Badge>}
              </div>
              <p className="text-xs text-muted-foreground"><SafeDate date={a.startTime} options={{ dateStyle: 'full' }} /> at <SafeTime date={a.startTime} options={{ hour: '2-digit', minute: '2-digit' }} />{a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}</p>
              {a.practitioner && <p className="text-xs text-muted-foreground flex items-center gap-1"><Stethoscope className="h-3 w-3" /> {a.practitioner.name}{a.practitioner.role ? ` — ${a.practitioner.role}` : ''}</p>}
              {a.referralStatus && a.referralStatus !== 'not_required' && a.referralStatus !== 'valid' && (
                <p className="text-xs text-amber-400 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {a.referralStatusMessage}</p>
              )}
              {a.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.location}</p>}
              {(a.cost != null || a.outOfPocket != null) && (
                <p className="text-xs text-muted-foreground">
                  {a.cost != null && <>Fee <SafeNumber value={a.cost} currency="AUD" /></>}
                  {a.medicareRebate != null && a.medicareRebateEligible && <> · rebate <SafeNumber value={a.medicareRebate} currency="AUD" /></>}
                  {a.medicareRebate != null && !a.medicareRebateEligible && <> · rebate not payable</>}
                  {a.outOfPocket != null && <> · gap <SafeNumber value={a.outOfPocket} currency="AUD" /></>}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0 items-end">
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {!isPast ? (
                <Button variant="secondary" size="sm" onClick={() => setActiveAgendaAppt(a)} className="h-7 text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20">
                  <ClipboardList className="h-3 w-3 mr-1.5" /> Agenda
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setActiveOutcomeAppt(a)} className="h-7 text-xs border border-border transition-colors">
                  <FileEdit className="h-3 w-3 mr-1.5" /> Outcome
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </StaggerItem>
    )
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarClock className="h-6 w-6 text-primary" /> Appointments</h1>
            <p className="text-sm text-muted-foreground mt-1">Upcoming and past appointments, costs and Medicare rebates.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openQuick}><Zap className="h-4 w-4 mr-1" /> Quick add</Button>
            <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add appointment</Button>
          </div>
        </div>
      </FadeIn>

      {loading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div> : (
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="pt-4">
            {upcoming.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">No upcoming appointments.</CardContent></Card> : <Stagger className="space-y-3">{upcoming.map(card)}</Stagger>}
          </TabsContent>
          <TabsContent value="past" className="pt-4">
            {past.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">No past appointments.</CardContent></Card> : <Stagger className="space-y-3">{past.map(card)}</Stagger>}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent aria-describedby="appointment-dialog-description" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit appointment' : 'Add appointment'}</DialogTitle></DialogHeader>
          <p id="appointment-dialog-description" className="sr-only">Add or edit an appointment and its details.</p>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Cardiology review" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.appointmentType || 'none'} onValueChange={(v) => setForm({ ...form, appointmentType: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['scheduled', 'completed', 'cancelled'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date & time</Label><Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {practitionerField(form.practitionerId, (v) => setForm({ ...form, practitionerId: v }))}
              <div className="space-y-1.5">
                <Label>Practice</Label>
                <Select value={form.organisationId || 'none'} onValueChange={(v) => setForm({ ...form, organisationId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.organisationId && careData?.offerings?.some((o: any) => o.practiceId === form.organisationId) && (
              <div className="space-y-1.5 bg-primary/5 p-3 rounded-md border border-primary/10">
                <Label className="text-primary">Use Practice Offering</Label>
                <Select value={form.offeringId || 'none'} onValueChange={(id) => {
                  if (id === 'none') return;
                  const off = careData.offerings.find((o: any) => o.id === id);
                  if (!off) return;
                  const over = off.overrides?.find((o: any) => o.practitionerId === form.practitionerId);
                  setForm({
                    ...form,
                     offeringId: off.id,
                    appointmentType: off.appointmentType ?? form.appointmentType,
                    durationMinutes: over?.durationMinutes?.toString() ?? off.durationMinutes?.toString() ?? form.durationMinutes,
                    cost: over?.cost?.toString() ?? off.defaultCost?.toString() ?? form.cost,
                    medicareRebate: over?.medicareRebate?.toString() ?? off.defaultMedicareRebate?.toString() ?? form.medicareRebate,
                    medicareItem: over?.medicareItem ?? off.medicareItem ?? form.medicareItem,
                  });
                  toast.success('Applied offering defaults');
                }}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Select to populate defaults..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Custom</SelectItem>
                    {careData.offerings.filter((o: any) => o.practiceId === form.organisationId).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {referrals.length > 0 && (
              <div className="space-y-1.5">
                <Label>Use referral</Label>
                <Select value={form.referralId || 'none'} onValueChange={(v) => setForm({ ...form, referralId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional — counts an appointment" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{referrals.filter((r: any) => ['valid', 'not_yet_valid'].includes(r.status)).map((r: any) => <SelectItem key={r.id} value={r.id}>To {r.practitioner?.name}{r.appointmentLimit != null ? ` (${r.remaining} left)` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {selectedPractitioner?.referralRequired && !form.referralId && (
              <p className="text-xs text-amber-400 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> This practitioner requires a valid referral for a Medicare rebate. You can still record the appointment without one.</p>
            )}
            {selectedReferral && selectedReferral.status !== 'valid' && (
              <p className="text-xs text-amber-400 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {selectedReferral.statusMessage} The appointment can still be recorded, but the rebate will not be payable.</p>
            )}
            <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="optional" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Fee (AUD)</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Rebate</Label><Input type="number" value={form.medicareRebate} onChange={(e) => setForm({ ...form, medicareRebate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Gap</Label><Input type="number" value={form.outOfPocket} onChange={(e) => setForm({ ...form, outOfPocket: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Medicare item</Label><Input value={form.medicareItem} onChange={(e) => setForm({ ...form, medicareItem: e.target.value })} placeholder="optional" /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShow(false)}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? 'Save' : 'Add'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuick} onOpenChange={setShowQuick}>
        <DialogContent aria-describedby="quick-appointment-dialog-description" className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Quick add appointment</DialogTitle></DialogHeader>
          <p id="quick-appointment-dialog-description" className="sr-only">Quickly add an appointment to your calendar.</p>
          <div className="space-y-3 py-2">
            {practitionerField(quickForm.practitionerId, (v) => setQuickForm({ ...quickForm, practitionerId: v }))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={quickForm.appointmentType || 'none'} onValueChange={(v) => setQuickForm({ ...quickForm, appointmentType: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={quickForm.durationMinutes} onChange={(e) => setQuickForm({ ...quickForm, durationMinutes: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Date & time *</Label><Input type="datetime-local" value={quickForm.startTime} onChange={(e) => setQuickForm({ ...quickForm, startTime: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Location</Label><Input value={quickForm.location} onChange={(e) => setQuickForm({ ...quickForm, location: e.target.value })} placeholder="optional" /></div>
              <div className="space-y-1.5"><Label>Fee (AUD)</Label><Input type="number" value={quickForm.cost} onChange={(e) => setQuickForm({ ...quickForm, cost: e.target.value })} placeholder="optional" /></div>
            </div>
            <p className="text-xs text-muted-foreground">A descriptive title is generated automatically from the practitioner and type.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowQuick(false)}>Cancel</Button><Button onClick={quickSave} loading={saving}>Add appointment</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AgendaManager appointment={activeAgendaAppt} careData={careData} practitioners={practitioners} practices={orgs} symptoms={symptoms} open={!!activeAgendaAppt} onOpenChange={(o: boolean) => !o && setActiveAgendaAppt(null)} onRefresh={fetchAll} />
      <OutcomeManager appointment={activeOutcomeAppt} careData={careData} open={!!activeOutcomeAppt} onOpenChange={(o: boolean) => !o && setActiveOutcomeAppt(null)} onRefresh={fetchAll} />
    </div>
  )
}
