'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type Pharmacy = {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  notes?: string | null
  isActive: boolean
}

export function PharmacyRefillPanel({ medicationId }: { medicationId: string }) {
  const [data, setData] = useState<any>({ pharmacies: [], forecast: [], orders: [] })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Pharmacy | null>(null)
  const [editForm, setEditForm] = useState({ name: '', address: '', phone: '', notes: '', isActive: true })
  const [draftQuantities, setDraftQuantities] = useState<Record<string, string>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<string, string>>({})
  const load = async () => { const r = await fetch('/api/medication-orders'); if (r.ok) setData(await r.json()) }
  useEffect(() => { load() }, [])
  const addPharmacy = async () => {
    if (!name.trim()) return
    const r = await fetch('/api/medication-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'pharmacy', name: name.trim() }) })
    if (r.ok) { setName(''); load(); toast.success('Pharmacy added') } else toast.error('Could not add pharmacy')
  }
  const setUsual = async (pharmacyId: string) => {
    const r = await fetch('/api/medication-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'preference', medicationId, pharmacyId }) })
    if (r.ok) { load(); toast.success('Usual pharmacy saved') } else toast.error('Could not save pharmacy preference')
  }
  const beginEdit = (pharmacy: Pharmacy) => {
    setEditing(pharmacy)
    setEditForm({
      name: pharmacy.name,
      address: pharmacy.address || '',
      phone: pharmacy.phone || '',
      notes: pharmacy.notes || '',
      isActive: pharmacy.isActive,
    })
  }
  const savePharmacy = async () => {
    if (!editing || !editForm.name.trim()) return
    const r = await fetch(`/api/medication-orders/pharmacies/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        name: editForm.name.trim(),
        address: editForm.address.trim() || null,
        phone: editForm.phone.trim() || null,
        notes: editForm.notes.trim() || null,
      }),
    })
    if (r.ok) {
      setEditing(null)
      await load()
      toast.success('Pharmacy updated')
    } else toast.error((await r.json().catch(() => ({}))).error || 'Could not update pharmacy')
  }
  const archivePharmacy = async (pharmacy: Pharmacy) => {
    const r = await fetch(`/api/medication-orders/pharmacies/${pharmacy.id}`, { method: 'DELETE' })
    if (r.ok) {
      if (editing?.id === pharmacy.id) setEditing(null)
      await load()
      toast.success('Pharmacy archived')
    } else toast.error((await r.json().catch(() => ({}))).error || 'Could not archive pharmacy')
  }
  const createDraft = async (pharmacyId: string) => {
    const grouped = data.forecast?.filter((item: any) => item.needsRefill && item.pharmacyId === pharmacyId) || []
    const items = grouped.length ? grouped : (forecast ? [forecast] : [])
    const lines = items.map((item: any) => ({
      medicationId: item.medicationId,
      prescriptionId: item.prescriptionId,
      quantity: Math.max(1, Math.ceil(item.expectedConsumption - item.stock + item.reorderThreshold)),
    }))
    const r = await fetch('/api/medication-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'order', pharmacyId, periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 13 * 86400000).toISOString(), lines }) })
    if (r.ok) { load(); toast.success('Editable draft created') } else toast.error('Could not create draft')
  }
  const action = async (id: string, action: string, lines?: any[]) => {
    const r = await fetch(`/api/medication-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, lines }),
    })
    if (r.ok) {
      load()
      const labels: Record<string, string> = { update: 'Draft order updated', confirm: 'Order confirmed', place: 'Order marked placed', receive: 'Order received', cancel: 'Order cancelled' }
      toast.success(labels[action] || 'Order updated')
    }
    else toast.error((await r.json().catch(() => ({}))).error || 'Order action unavailable')
  }
  const saveDraft = (order: any) => action(order.id, 'update', order.lines.map((line: any) => ({
    medicationId: line.medicationId,
    prescriptionId: line.prescriptionId,
    quantity: Number(draftQuantities[line.id] ?? line.quantity),
    status: draftStatuses[line.id] ?? line.status,
    substitutionNote: line.substitutionNote,
  })))
  const forecast = data.forecast?.find((f: any) => f.medicationId === medicationId)
  return <section className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
    <div><h3 className="font-medium">Pharmacy & refill forecast</h3><p className="text-xs text-muted-foreground">Manual-first planning. No unrecorded PRN use is inferred.</p></div>
    {forecast && <div className="flex flex-wrap gap-2 text-sm"><Badge variant={forecast.needsRefill ? 'destructive' : 'secondary'}>{forecast.needsRefill ? 'Refill review due' : 'No refill currently due'}</Badge><span className="text-muted-foreground">Projected stock: {forecast.projectedStock}</span><span className="text-muted-foreground">Available fills: {forecast.availablePrescriptionFills}</span></div>}
    {forecast?.uncertainty && <p className="text-xs text-amber-400">{forecast.uncertainty}</p>}
    <div className="flex gap-2"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Add pharmacy" onKeyDown={e => e.key === 'Enter' && addPharmacy()} /><Button onClick={addPharmacy}>Add</Button></div>
    <div className="space-y-2">{data.pharmacies?.map((p: Pharmacy) => <div key={p.id} className="rounded-lg border border-border/40 p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><span className={p.isActive ? '' : 'text-muted-foreground line-through'}>{p.name}</span>{!p.isActive && <Badge className="ml-2" variant="secondary">Archived</Badge>}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => beginEdit(p)}>Edit</Button>
          {p.isActive && <><Button size="sm" variant="outline" onClick={() => setUsual(p.id)}>{forecast?.pharmacyId === p.id ? 'Usual' : 'Set usual'}</Button>{forecast?.needsRefill && <Button size="sm" onClick={() => createDraft(p.id)}>Draft order</Button>}</>}
          {p.isActive && <Button size="sm" variant="ghost" onClick={() => archivePharmacy(p)}>Archive</Button>}
        </div>
      </div>
      {(p.address || p.phone) && <p className="mt-1 text-xs text-muted-foreground">{[p.address, p.phone].filter(Boolean).join(' · ')}</p>}
      {editing?.id === p.id && <div className="mt-3 space-y-2 rounded-md border border-border/40 bg-background/50 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Pharmacy name" value={editForm.name} onChange={e => setEditForm(current => ({ ...current, name: e.target.value }))} placeholder="Pharmacy name" />
          <Input aria-label="Pharmacy address" value={editForm.address} onChange={e => setEditForm(current => ({ ...current, address: e.target.value }))} placeholder="Address" />
          <Input aria-label="Pharmacy phone" value={editForm.phone} onChange={e => setEditForm(current => ({ ...current, phone: e.target.value }))} placeholder="Phone" />
          <Input aria-label="Pharmacy notes" value={editForm.notes} onChange={e => setEditForm(current => ({ ...current, notes: e.target.value }))} placeholder="Notes" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm(current => ({ ...current, isActive: e.target.checked }))} /> Active pharmacy</label>
        <div className="flex gap-2"><Button size="sm" onClick={savePharmacy}>Save changes</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
      </div>}
    </div>)}</div>
    {data.orders?.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">Order history</h4>{data.orders.map((o: any) => <div key={o.id} className="rounded-lg border border-border/40 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><span>{o.pharmacy.name}</span><Badge variant="outline">{o.status}</Badge></div>
      <div className="text-xs text-muted-foreground mt-1">{o.lines.length} line(s) · {new Date(o.createdAt).toLocaleDateString('en-AU', { timeZone: 'UTC' })} · {o.events?.length ?? 0} recorded event{(o.events?.length ?? 0) === 1 ? '' : 's'}</div>
      {o.status === 'draft' && <div className="mt-3 space-y-2">
        {o.lines.map((line: any) => <div key={line.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{line.medication?.name || 'Medication'}</span>
          <Input aria-label={`Quantity for ${line.medication?.name || 'order line'}`} className="h-8 w-24" type="number" min="0.000001" step="any" defaultValue={line.quantity} onChange={event => setDraftQuantities(current => ({ ...current, [line.id]: event.target.value }))} />
          <select aria-label={`Status for ${line.medication?.name || 'order line'}`} className="h-8 rounded-md border border-border bg-background px-2 text-xs" defaultValue={line.status} onChange={event => setDraftStatuses(current => ({ ...current, [line.id]: event.target.value }))}>
            <option value="ordered">Ordered</option>
            <option value="substituted">Substituted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>)}
        <Button size="sm" variant="outline" onClick={() => saveDraft(o)}>Save edits</Button>
      </div>}
      {['draft', 'confirmed', 'placed'].includes(o.status) && <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" variant="outline" onClick={() => action(o.id, o.status === 'draft' ? 'confirm' : 'place')}>{o.status === 'draft' ? 'Confirm' : 'Place'}</Button>
        {o.status === 'placed' && <Button size="sm" variant="outline" onClick={() => action(o.id, 'receive')}>Receive</Button>}
        <Button size="sm" variant="ghost" onClick={() => action(o.id, 'cancel')}>Cancel</Button>
      </div>}
    </div>)}</div>}
  </section>
}