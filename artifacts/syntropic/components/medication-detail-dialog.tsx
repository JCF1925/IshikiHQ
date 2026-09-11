'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ArrowLeft, Pencil, Pill, Plus, Trash2 } from 'lucide-react'
import { VariantCard } from './medications/variant-card'
import { toast } from 'sonner'
import { PharmacyRefillPanel } from './medications/pharmacy-refill-panel'

type Props = {
  med: any
  practitioners: { id: string; name: string }[]
  onClose: () => void
  onChanged: () => void
  onPractitionerAdded?: () => void
}

const MED_TYPES = [
  { value: 'scheduled', label: 'Regularly scheduled' }, { value: 'prn', label: 'PRN (as needed)' },
  { value: 'scheduled_prn', label: 'Scheduled + PRN' }, { value: 'adhoc', label: 'Ad-hoc' },
]

const readError = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({}))
  return body.error || body.message || fallback
}

export function MedicationDetailDialog({ med, practitioners, onClose, onChanged, onPractitionerAdded }: Props) {
  const [product, setProduct] = useState(med)
  const [editing, setEditing] = useState(false)
  const [addingVariant, setAddingVariant] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ name: med.name || '', genericName: med.genericName || '', medType: med.medType || 'scheduled', isSchedule8: !!med.isSchedule8, isOtc: !!med.isOtc, monthlyLimit: med.monthlyLimit?.toString() || '' })
  const [variantForm, setVariantForm] = useState({ strength: '', unit: 'mg', form: 'tablet', initialStock: '0', reorderThreshold: '5' })
  const strengths: any[] = [product, ...((product?.children ?? []) as any[])]

  // Filter out the parent if it is just a logical container and has no variant data itself
  const variants = strengths.filter(s => s.strength || s.form)
  const activeCount = variants.filter(v => v.isActive !== false).length

  const updateProduct = async () => {
    if (!editForm.name.trim()) return toast.error('Medication name is required')
    setSaving(true)
    try {
      const res = await fetch(`/api/medications/${product.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editForm, name: editForm.name.trim(), genericName: editForm.genericName || null, monthlyLimit: editForm.monthlyLimit || null }) })
      if (!res.ok) throw new Error(await readError(res, 'Failed to update medication'))
      setProduct((current: any) => ({ ...current, ...editForm, genericName: editForm.genericName || null, monthlyLimit: editForm.monthlyLimit ? Number(editForm.monthlyLimit) : null }))
      setEditing(false); onChanged(); toast.success('Medication updated')
    } catch (e: any) { toast.error(e.message || 'Failed to update medication') } finally { setSaving(false) }
  }
  const setActive = async () => {
    setSaving(true)
    try {
      const isActive = product.isActive === false
      const res = await fetch(`/api/medications/${product.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) })
      if (!res.ok) throw new Error(await readError(res, 'Failed to update medication'))
      setProduct((current: any) => ({ ...current, isActive })); onChanged(); toast.success(isActive ? 'Medication reactivated' : 'Medication archived')
    } catch (e: any) { toast.error(e.message || 'Failed to update medication') } finally { setSaving(false) }
  }
  const deleteProduct = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/medications/${product.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Failed to delete medication'))
      toast.success('Medication deleted'); onChanged(); onClose()
    } catch (e: any) { toast.error(e.message || 'Failed to delete medication') } finally { setSaving(false); setConfirmingDelete(false) }
  }
  const addVariant = async () => {
    if (!variantForm.strength.trim()) return toast.error('Variant strength is required')
    setSaving(true)
    try {
      const res = await fetch('/api/medications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: product.name, genericName: product.genericName, medType: product.medType, isSchedule8: product.isSchedule8, isOtc: product.isOtc, parentId: product.id, ...variantForm, initialStock: Number(variantForm.initialStock || 0), reorderThreshold: Number(variantForm.reorderThreshold || 0) }) })
      if (!res.ok) throw new Error(await readError(res, 'Failed to add variant'))
      const created = await res.json()
      setProduct((current: any) => ({ ...current, children: [...(current.children || []), created] }))
      setAddingVariant(false); setVariantForm({ strength: '', unit: 'mg', form: 'tablet', initialStock: '0', reorderThreshold: '5' }); onChanged(); toast.success('Variant added')
    } catch (e: any) { toast.error(e.message || 'Failed to add variant') } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-describedby="medication-detail-description" className="flex h-[100dvh] w-screen min-w-0 max-w-[100vw] flex-col gap-0 overflow-hidden rounded-none border-none bg-background p-0 shadow-none">
        <DialogTitle className="sr-only">Medication details</DialogTitle>
        <div id="medication-detail-description" className="sr-only">Detailed view of medication products and variants</div>
        <div className="h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full min-w-0 max-w-4xl space-y-8 p-4 pb-20 md:p-8">
            
            {/* Top Navigation */}
            <div className="pt-2 md:pt-4">
              <Button variant="ghost" onClick={onClose} className="gap-2 text-muted-foreground hover:text-foreground -ml-4">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </div>

            {/* Product Header */}
            <div className="bg-card border border-border/50 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
              
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0 border border-violet-500/20 z-10">
                <Pill className="w-8 h-8 md:w-10 md:h-10 text-violet-400" />
              </div>
              
              <div className="flex-1 z-10 w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-display font-semibold tracking-tight text-foreground">{product.name}</h2>
                    {product.genericName && <p className="text-muted-foreground mt-1">{product.genericName}</p>}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mt-4">
                  {product.isOtc ? (
                    <Badge variant="outline" className="bg-background text-muted-foreground border-border/50">OTC</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-background text-muted-foreground border-border/50">Rx</Badge>
                  )}
                  {product.isSchedule8 && (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-transparent">Schedule 8</Badge>
                  )}
                  {product.conditions?.map((c: any) => (
                    <Badge key={typeof c === 'object' ? (c.id || c.name) : c} variant="secondary" className="bg-violet-500/10 text-violet-300 border-transparent hover:bg-violet-500/20">
                      {typeof c === 'object' ? c.name : c}
                    </Badge>
                  ))}
                  {product.monthlyLimit != null && (
                    <Badge variant="outline" className="bg-background border-border/50">Limit {product.monthlyLimit}/mo</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-5">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-4 h-4 mr-2" /> Edit product</Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={setActive}>{product.isActive === false ? 'Reactivate' : 'Archive'}</Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => setConfirmingDelete(true)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
                </div>
              </div>
            </div>

            {/* Variants Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-medium flex items-center gap-2">
                  Variants <span className="text-muted-foreground text-sm font-normal">({activeCount} active)</span>
                </h3>
                <Button size="sm" onClick={() => setAddingVariant(true)} className="bg-violet-600 hover:bg-violet-700 text-white"><Plus className="w-4 h-4 mr-2" /> Add variant</Button>
              </div>
              
              <div className="space-y-4">
                {variants.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-2xl border border-border/50 border-dashed">
                    <p className="text-muted-foreground">No variants added yet.</p>
                  </div>
                ) : (
                  variants.map((v) => (
                    <VariantCard key={v.id} variant={v} practitioners={practitioners} onPractitionerAdded={onPractitionerAdded} />
                  ))
                )}
              </div>
            </div>
            <PharmacyRefillPanel medicationId={product.id} />

          </div>
        </div>
      </DialogContent>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent aria-describedby="edit-product-description" className="max-w-md">
          <DialogHeader><DialogTitle>Edit product</DialogTitle><p id="edit-product-description" className="text-sm text-muted-foreground">Update product information shared by its variants.</p></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} /></div><div className="space-y-2"><Label>Generic name</Label><Input value={editForm.genericName} onChange={e => setEditForm({...editForm, genericName: e.target.value})} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Type</Label><Select value={editForm.medType} onValueChange={medType => setEditForm({...editForm, medType})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MED_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Monthly limit</Label><Input type="number" min="0" value={editForm.monthlyLimit} onChange={e => setEditForm({...editForm, monthlyLimit: e.target.value})} /></div></div>
            <div className="flex items-center justify-between"><Label>Schedule 8</Label><Switch checked={editForm.isSchedule8} onCheckedChange={isSchedule8 => setEditForm({...editForm, isSchedule8})} /></div>
            <div className="flex items-center justify-between"><Label>Over-the-counter</Label><Switch checked={editForm.isOtc} onCheckedChange={isOtc => setEditForm({...editForm, isOtc})} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button disabled={saving} onClick={updateProduct} className="bg-violet-600 hover:bg-violet-700 text-white">Save changes</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={addingVariant} onOpenChange={setAddingVariant}>
        <DialogContent aria-describedby="add-variant-description" className="max-w-md">
          <DialogHeader><DialogTitle>Add variant</DialogTitle><p id="add-variant-description" className="text-sm text-muted-foreground">Add a strength and starting stock to this product.</p></DialogHeader>
          <div className="space-y-4 py-2"><div className="grid grid-cols-3 gap-3"><div className="space-y-2"><Label>Strength</Label><Input value={variantForm.strength} onChange={e => setVariantForm({...variantForm, strength: e.target.value})} /></div><div className="space-y-2"><Label>Unit</Label><Input value={variantForm.unit} onChange={e => setVariantForm({...variantForm, unit: e.target.value})} /></div><div className="space-y-2"><Label>Form</Label><Input value={variantForm.form} onChange={e => setVariantForm({...variantForm, form: e.target.value})} /></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Initial stock</Label><Input type="number" min="0" value={variantForm.initialStock} onChange={e => setVariantForm({...variantForm, initialStock: e.target.value})} /></div><div className="space-y-2"><Label>Reorder threshold</Label><Input type="number" min="0" value={variantForm.reorderThreshold} onChange={e => setVariantForm({...variantForm, reorderThreshold: e.target.value})} /></div></div></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAddingVariant(false)}>Cancel</Button><Button disabled={saving} onClick={addVariant} className="bg-violet-600 hover:bg-violet-700 text-white">Add variant</Button></div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {product.name}?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the product only when it has no variants or history. Otherwise, archive it instead.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={deleteProduct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete medication</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
