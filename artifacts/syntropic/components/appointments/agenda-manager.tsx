import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, CheckCircle2, Circle, Pill, AlertTriangle, FileText, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'

export function AgendaManager({ appointment, careData, practitioners = [], practices = [], symptoms = [], open, onOpenChange, onRefresh }: any) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', details: '', practitionerId: '', practiceId: '', symptomId: '' })
  const [saving, setSaving] = useState(false)
  const appointmentId = appointment?.id
  const appointmentPractitionerId = appointment?.practitioner?.id ?? ''
  const appointmentPracticeId = appointment?.organisation?.id ?? ''

  useEffect(() => {
    if (!appointmentId) return
    if (open) {
      setForm({
        title: '',
        details: '',
        practitionerId: appointmentPractitionerId,
        practiceId: appointmentPracticeId,
        symptomId: '',
      })
    }
  }, [appointmentId, appointmentPractitionerId, appointmentPracticeId, open])

  if (!appointment) return null

  const items = careData?.agenda?.filter((a: any) => a.appointmentId === appointment.id) || []
  
  // Context data
  const allPrescriptions = careData?.prescriptions || []
  const schedules = careData?.schedules || []
  const allMeds = careData?.medications || []
  const allStock = careData?.stock || []
  const prescriptions = allPrescriptions.filter((p: any) =>
    p.prescriber?.id === appointment.practitioner?.id ||
    p.prescriber?.organisationId === appointment.organisation?.id
  )
  const relatedMedicationIds = new Set([
    ...prescriptions.map((p: any) => p.medicationId),
    ...schedules.filter((s: any) => prescriptions.some((p: any) => p.id === s.prescriptionId)).map((s: any) => s.medicationId),
  ])
  const meds = allMeds.filter((m: any) => relatedMedicationIds.has(m.id))
  const stock = allStock.filter((s: any) => relatedMedicationIds.has(s.medicationId))
  const relatedSchedules = schedules.filter((s: any) => relatedMedicationIds.has(s.medicationId))

  const lowStock = stock.filter((s: any) => s.currentQuantity <= s.reorderThreshold)

  const saveItem = async () => {
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      const res = await fetch('/api/appointment-care/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          details: form.details,
          appointmentId: appointment.id,
          practiceId: form.practiceId || null,
          practitionerId: form.practitionerId || null,
          symptomId: form.symptomId || null,
          status: 'open'
        })
      })
      if (!res.ok) throw new Error()
      toast.success('Agenda item added')
      setForm({ title: '', details: '', practitionerId: appointment.practitioner?.id ?? '', practiceId: appointment.organisation?.id ?? '', symptomId: '' })
      setAdding(false)
      onRefresh()
    } catch {
      toast.error('Failed to save agenda item')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (item: any) => {
    const newStatus = item.status === 'open' ? 'discussed' : 'open'
    try {
      await fetch(`/api/appointment-care/agenda/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      onRefresh()
    } catch {
      toast.error('Failed to update status')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] h-[80vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 shrink-0 border-b border-border bg-background">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ClipboardList className="h-6 w-6 text-primary" />
            Agenda for {appointment.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Prepare symptoms, notes, and verify medical context before your visit.</p>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden flex-1 bg-background">
          {/* Left: Agenda Items */}
          <div className="flex flex-col p-6 pt-4 border-r border-border h-full overflow-y-auto">
            <h3 className="font-semibold text-base mb-4">Talking Points</h3>
            
            <div className="space-y-3 mb-6">
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-muted/30 p-5 rounded-lg border border-border/50 text-center">
                  No items prepared. Add symptoms, questions, or refill requests.
                </div>
              ) : (
                items.map((item: any) => (
                  <div key={item.id} className={`p-3.5 rounded-lg border flex gap-3 transition-colors ${item.status === 'discussed' ? 'bg-muted/30 border-muted opacity-60' : 'bg-card border-primary/20 shadow-sm'}`}>
                    <button onClick={() => toggleStatus(item)} className="mt-0.5 shrink-0 text-primary hover:text-primary/80 transition-colors">
                      {item.status === 'discussed' ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.status === 'discussed' ? 'line-through text-muted-foreground' : ''}`}>{item.title}</p>
                      {item.details && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{item.details}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {adding ? (
              <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
                <div>
                  <Label>What to discuss</Label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Renew prescription, new symptom..." className="bg-background mt-1" />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Input value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Details..." className="bg-background mt-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Practitioner</Label>
                    <select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.practitionerId || 'none'} onChange={e => setForm({ ...form, practitionerId: e.target.value === 'none' ? '' : e.target.value })}>
                      <option value="none">Not assigned</option>
                      {practitioners.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Practice</Label>
                    <select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.practiceId || 'none'} onChange={e => setForm({ ...form, practiceId: e.target.value === 'none' ? '' : e.target.value })}>
                      <option value="none">Not assigned</option>
                      {practices.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Symptom (optional)</Label>
                  <select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.symptomId || 'none'} onChange={e => setForm({ ...form, symptomId: e.target.value === 'none' ? '' : e.target.value })}>
                    <option value="none">No symptom linked</option>
                    {symptoms.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                  <Button size="sm" onClick={saveItem} loading={saving}>Save Item</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full border-dashed py-6" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Agenda Item
              </Button>
            )}
          </div>

          {/* Right: Medical Context */}
          <div className="flex flex-col p-6 pt-4 bg-muted/10 h-full overflow-y-auto">
            <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Medical Context
            </h3>
            
            <Tabs defaultValue="meds" className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="meds">Medications</TabsTrigger>
                <TabsTrigger value="stock">Stock & Scripts</TabsTrigger>
              </TabsList>
              
              <TabsContent value="meds" className="mt-4 space-y-4">
                {meds.length === 0 ? (
                  <div className="text-sm text-muted-foreground bg-background p-4 rounded-lg border border-border text-center">No medication records are linked to this practitioner or practice.</div>
                ) : (
                  <div className="space-y-2">
                    {meds.map((m: any) => (
                      <div key={m.id} className="p-3 bg-background rounded-md border border-border shadow-sm flex items-start gap-3">
                        <Pill className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{m.name} {m.strength}</p>
                          <p className="text-xs text-muted-foreground capitalize">{m.medType.replace('_', ' ')} · {m.form}{m.isOtc ? ' · OTC' : ''}</p>
                          {relatedSchedules.filter((s: any) => s.medicationId === m.id).map((s: any) => (
                            <p key={s.id} className="text-xs text-muted-foreground mt-1">
                              {s.frequency === 'as_needed' || m.medType.includes('prn') ? 'As needed' : s.frequency.replace('_', ' ')} · dose {s.doseAmount}{s.times?.length ? ` · ${s.times.join(', ')}` : ''}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="stock" className="mt-4 space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Low Stock Alerts
                  </h4>
                  {lowStock.length === 0 ? (
                    <div className="text-sm text-muted-foreground bg-background p-4 rounded-lg border border-border text-center">All stock levels look good.</div>
                  ) : (
                    <div className="space-y-2">
                      {lowStock.map((s: any) => (
                        <div key={s.id} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex justify-between items-center">
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{s.medication?.name}</p>
                          <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5">{s.currentQuantity} left</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3">Active Prescriptions</h4>
                  {prescriptions.length === 0 ? (
                    <div className="text-sm text-muted-foreground bg-background p-4 rounded-lg border border-border text-center">No scripts are linked to this practitioner or practice.</div>
                  ) : (
                    <div className="space-y-2">
                      {prescriptions.map((p: any) => (
                        <div key={p.id} className="p-3 bg-background rounded-md border border-border shadow-sm">
                          <p className="text-sm font-medium">{p.medication?.name}</p>
                          <div className="flex justify-between items-center mt-1.5">
                            <p className="text-xs text-muted-foreground">Repeats: {p.repeatsUsed}/{p.repeats}</p>
                            {p.expiryDate && <p className="text-xs text-muted-foreground">Exp: {new Date(p.expiryDate).toLocaleDateString('en-AU', { timeZone: 'UTC' })}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
