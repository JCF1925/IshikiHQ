import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Plus, Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

export function OfferingsManager({ practice, offerings, people, onRefresh }: any) {
  const practiceOfferings = offerings.filter((o: any) => o.practiceId === practice.id)
  const practicePeople = people.filter((p: any) => p.organisationId === practice.id)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', description: '', appointmentType: '', durationMinutes: '', defaultCost: '', defaultMedicareRebate: '', medicareItem: '' })
  const [saving, setSaving] = useState(false)
  
  // Practitioner override modal
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [activeOffering, setActiveOffering] = useState<any>(null)
  const [overrideForm, setOverrideForm] = useState({ practitionerId: '', durationMinutes: '', cost: '', medicareRebate: '', medicareItem: '' })

  const handleEdit = (o: any) => {
    setForm({
      id: o.id, name: o.name, description: o.description || '', appointmentType: o.appointmentType || '',
      durationMinutes: o.durationMinutes?.toString() || '', defaultCost: o.defaultCost?.toString() || '',
      defaultMedicareRebate: o.defaultMedicareRebate?.toString() || '', medicareItem: o.medicareItem || ''
    })
    setOpen(true)
  }

  const saveOffering = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      const payload = {
        name: form.name, description: form.description, appointmentType: form.appointmentType,
        durationMinutes: form.durationMinutes || null, defaultCost: form.defaultCost || null,
        defaultMedicareRebate: form.defaultMedicareRebate || null, medicareItem: form.medicareItem || null,
        practiceId: practice.id
      }
      const url = form.id ? `/api/appointment-care/offerings/${form.id}` : `/api/appointment-care/offerings`
      const res = await fetch(url, {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error()
      toast.success(form.id ? 'Offering updated' : 'Offering added')
      setOpen(false)
      onRefresh()
    } catch {
      toast.error('Failed to save offering')
    } finally {
      setSaving(false)
    }
  }
  
  const saveOverride = async () => {
    if (!overrideForm.practitionerId) return toast.error('Select a practitioner')
    setSaving(true)
    try {
      const payload = {
        practitionerId: overrideForm.practitionerId,
        durationMinutes: overrideForm.durationMinutes || null,
        cost: overrideForm.cost || null,
        medicareRebate: overrideForm.medicareRebate || null,
        medicareItem: overrideForm.medicareItem || null
      }
      const res = await fetch(`/api/appointment-care/offerings/${activeOffering.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error()
      toast.success('Override saved')
      setOverrideOpen(false)
      onRefresh()
    } catch {
      toast.error('Failed to save override')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground"><FileText className="h-4 w-4" /> Offerings</h4>
        <Button variant="ghost" size="sm" className="h-7 text-xs bg-primary/10 text-primary hover:bg-primary/20" onClick={() => { setForm({ id: '', name: '', description: '', appointmentType: '', durationMinutes: '', defaultCost: '', defaultMedicareRebate: '', medicareItem: '' }); setOpen(true) }}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>

      {practiceOfferings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No standard offerings defined for this practice.</p>
      ) : (
        <div className="space-y-2">
          {practiceOfferings.map((o: any) => (
            <div key={o.id} className="bg-muted/30 p-3 rounded-md border border-border/50 space-y-2 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.durationMinutes ? `${o.durationMinutes} min` : 'Custom length'} 
                    {o.defaultCost != null && ` · $${o.defaultCost} (Rebate: $${o.defaultMedicareRebate || 0})`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => handleEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {practicePeople.length > 0 && (
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => { setActiveOffering(o); setOverrideForm({ practitionerId: '', durationMinutes: '', cost: '', medicareRebate: '', medicareItem: '' }); setOverrideOpen(true) }} title="Add override">
                      <Save className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  )}
                </div>
              </div>
              
              {o.overrides?.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground">Practitioner Overrides:</p>
                  <div className="flex flex-wrap gap-2">
                    {o.overrides.map((ov: any) => (
                      <Badge key={ov.id} variant="secondary" className="text-[10px] font-normal cursor-pointer bg-primary/10 text-primary hover:bg-primary/20 transition-colors" onClick={() => { setActiveOffering(o); setOverrideForm({ practitionerId: ov.practitionerId, durationMinutes: ov.durationMinutes?.toString() || '', cost: ov.cost?.toString() || '', medicareRebate: ov.medicareRebate?.toString() || '', medicareItem: ov.medicareItem || '' }); setOverrideOpen(true) }}>
                        {ov.practitioner?.name}: {ov.cost != null ? `$${ov.cost}` : 'Custom'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Offering Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? 'Edit Offering' : 'Add Offering'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Standard Consult (Item 23)" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={form.durationMinutes} onChange={e => setForm({...form, durationMinutes: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.appointmentType || 'none'} onValueChange={v => setForm({...form, appointmentType: v === 'none' ? '' : v})}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem><SelectItem value="gp">GP</SelectItem><SelectItem value="specialist">Specialist</SelectItem><SelectItem value="procedure">Procedure</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Default Fee (AUD)</Label><Input type="number" value={form.defaultCost} onChange={e => setForm({...form, defaultCost: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Default Rebate</Label><Input type="number" value={form.defaultMedicareRebate} onChange={e => setForm({...form, defaultMedicareRebate: e.target.value})} /></div>
            </div>
            <div className="space-y-1.5"><Label>Medicare Item</Label><Input value={form.medicareItem} onChange={e => setForm({...form, medicareItem: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveOffering} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-xl">Practitioner Override</DialogTitle>
          <p className="text-sm text-muted-foreground">Override fees and duration for {activeOffering?.name}</p></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Practitioner *</Label>
              <Select value={overrideForm.practitionerId || 'none'} onValueChange={v => setOverrideForm({...overrideForm, practitionerId: v === 'none' ? '' : v})}>
                <SelectTrigger><SelectValue placeholder="Select practitioner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select practitioner</SelectItem>
                  {practicePeople.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Override Fee (AUD)</Label><Input type="number" value={overrideForm.cost} onChange={e => setOverrideForm({...overrideForm, cost: e.target.value})} placeholder={activeOffering?.defaultCost} /></div>
              <div className="space-y-1.5"><Label>Override Rebate</Label><Input type="number" value={overrideForm.medicareRebate} onChange={e => setOverrideForm({...overrideForm, medicareRebate: e.target.value})} placeholder={activeOffering?.defaultMedicareRebate} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Override Duration</Label><Input type="number" value={overrideForm.durationMinutes} onChange={e => setOverrideForm({...overrideForm, durationMinutes: e.target.value})} placeholder={activeOffering?.durationMinutes} /></div>
              <div className="space-y-1.5"><Label>Override Medicare Item</Label><Input value={overrideForm.medicareItem} onChange={e => setOverrideForm({...overrideForm, medicareItem: e.target.value})} placeholder={activeOffering?.medicareItem} /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded border border-border">Leave fields blank to use the practice defaults for this offering.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button onClick={saveOverride} loading={saving}>Save Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
