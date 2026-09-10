import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, FileSignature } from 'lucide-react'
import { toast } from 'sonner'
import { SafeDate } from '@/components/safe-format'

export function PrescriptionsTab({ variant, data, onRefetch, practitioners, onPractitionerAdded }: any) {
  const { prescriptions } = data
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addingPractitioner, setAddingPractitioner] = useState(false)
  const [practitionerForm, setPractitionerForm] = useState({ name: '', role: '', phone: '', email: '' })
  const [savingPractitioner, setSavingPractitioner] = useState(false)

  const emptyScript = { 
    medicationId: variant.id, 
    prescriberId: '', 
    datePrescribed: new Date().toISOString().slice(0, 10), 
    quantity: '', 
    repeats: '0', 
    cost: '', 
    expiryDate: '', 
    escriptToken: '', 
    notes: '' 
  }
  const [form, setForm] = useState(emptyScript)

  const handleAddPractitioner = async () => {
    if (!practitionerForm.name.trim()) {
      toast.error('Practitioner name is required')
      return
    }
    setSavingPractitioner(true)
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...practitionerForm, type: 'practitioner' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to add practitioner')
      }
      const practitioner = await res.json()
      setForm(current => ({ ...current, prescriberId: practitioner.id }))
      setPractitionerForm({ name: '', role: '', phone: '', email: '' })
      setAddingPractitioner(false)
      onPractitionerAdded?.()
      toast.success('Practitioner added')
    } catch (e: any) {
      toast.error(e.message || 'Failed to add practitioner')
    } finally {
      setSavingPractitioner(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/prescriptions', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(form) 
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to add prescription')
      }
      toast.success('Prescription added')
      setShowAdd(false)
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add prescription')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prescription?')) return
    try {
      const res = await fetch(`/api/prescriptions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Prescription deleted')
      onRefetch()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const handleDispense = async (p: any) => {
    try {
      const res = await fetch(`/api/prescriptions/${p.id}`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ action: 'dispense' }) 
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to fill script')
      }
      toast.success('Script filled and stock updated')
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to fill script')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Prescriptions</h3>
        <Button size="sm" onClick={() => { setForm(emptyScript); setShowAdd(true) }} className="bg-violet-600 hover:bg-violet-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> Add prescription
        </Button>
      </div>

      {(!prescriptions || prescriptions.length === 0) ? (
        <div className="text-center py-8 bg-muted/20 rounded-2xl border border-border/50 border-dashed">
          <FileSignature className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No prescriptions recorded for this variant.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((p: any) => {
            const used = p.repeatsUsed ?? 0
            const total = (p.repeats ?? 0) + 1 // Initial fill + repeats
            const remaining = total - used
            const expired = p.expiryDate && new Date(p.expiryDate) < new Date()

            return (
              <div key={p.id} className="border border-border/50 rounded-2xl p-5 space-y-4 bg-card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <FileSignature className="w-4 h-4 text-violet-400" />
                      <span className="font-medium text-lg">{p.prescriber?.name || 'Unknown Prescriber'}</span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>Prescribed <SafeDate date={p.datePrescribed} /></span>
                      {expired && <Badge variant="secondary" className="bg-destructive/10 text-destructive border-transparent">Expired</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-300 border-transparent">
                    {remaining} of {total} fills remaining
                  </Badge>
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-300 border-transparent">
                    {p.quantity} per fill
                  </Badge>
                  {p.cost && (
                    <Badge variant="secondary" className="bg-violet-500/10 text-violet-300 border-transparent">
                      ${p.cost} paid
                    </Badge>
                  )}
                  {p.expiryDate && (
                    <Badge variant="outline" className="border-border/50 text-muted-foreground">
                      Expires <SafeDate date={p.expiryDate} />
                    </Badge>
                  )}
                  {p.escriptTokenPresent && (
                    <Badge variant="outline" className="border-violet-500/30 text-violet-400 bg-violet-500/5">
                      eScript
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-border/50 flex justify-end">
                  <Button 
                    className="bg-violet-600 hover:bg-violet-700 text-white" 
                    disabled={remaining <= 0 || expired}
                    onClick={() => handleDispense(p)}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Fill script
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent aria-describedby="add-prescription-description" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add prescription</DialogTitle>
            <p id="add-prescription-description" className="text-sm text-muted-foreground">Record a prescription for this medication variant.</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date prescribed</Label>
                <Input type="date" value={form.datePrescribed} onChange={e => setForm({...form, datePrescribed: e.target.value})} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prescriber</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAddingPractitioner(value => !value)}>
                    {addingPractitioner ? 'Cancel' : '+ New'}
                  </Button>
                </div>
                {addingPractitioner ? (
                  <div className="space-y-2 rounded-md border border-border p-2">
                    <Input placeholder="Name *" value={practitionerForm.name} onChange={e => setPractitionerForm({ ...practitionerForm, name: e.target.value })} />
                    <Input placeholder="Role (e.g. GP)" value={practitionerForm.role} onChange={e => setPractitionerForm({ ...practitionerForm, role: e.target.value })} />
                    <Input placeholder="Phone" value={practitionerForm.phone} onChange={e => setPractitionerForm({ ...practitionerForm, phone: e.target.value })} />
                    <Input placeholder="Email" type="email" value={practitionerForm.email} onChange={e => setPractitionerForm({ ...practitionerForm, email: e.target.value })} />
                    <Button type="button" size="sm" className="w-full" loading={savingPractitioner} onClick={handleAddPractitioner}>Save practitioner</Button>
                  </div>
                ) : (
                  <Select value={form.prescriberId || 'none'} onValueChange={v => setForm({...form, prescriberId: v === 'none' ? '' : v})}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {practitioners?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity per fill</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} placeholder="30" />
              </div>
              <div className="space-y-2">
                <Label>Repeats (after initial)</Label>
                <Input type="number" value={form.repeats} onChange={e => setForm({...form, repeats: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cost (AUD)</Label>
                <Input type="number" value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} placeholder="28.40" />
              </div>
              <div className="space-y-2">
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiryDate} onChange={e => setForm({...form, expiryDate: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>eScript Token</Label>
              <Input value={form.escriptToken} onChange={e => setForm({...form, escriptToken: e.target.value})} placeholder="Paste token code" className="font-mono text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">Save prescription</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
