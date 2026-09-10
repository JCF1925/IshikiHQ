'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Pill, Plus, AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { MedicationDetailDialog } from '@/components/medication-detail-dialog'
import { cn } from '@/lib/utils'

const MED_TYPES = [
  { value: 'scheduled', label: 'Regularly scheduled' },
  { value: 'prn', label: 'PRN (as needed)' },
  { value: 'scheduled_prn', label: 'Scheduled + PRN' },
  { value: 'adhoc', label: 'Ad-hoc' },
]

export function MedicationsClient() {
  const [medications, setMedications] = useState<any[]>([])
  const [practitioners, setPractitioners] = useState<{ id: string; name: string }[]>([])
  const [detailMed, setDetailMed] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  
  const [showAdd, setShowAdd] = useState(false)
  const emptyVariant = () => ({ strength: '', unit: 'mg', form: 'tablet', initialStock: '0', reorderThreshold: '5' })
  const [form, setForm] = useState({ name: '', genericName: '', medType: 'scheduled', isSchedule8: false, isOtc: false, monthlyLimit: '' })
  const [variants, setVariants] = useState<any[]>([emptyVariant()])
  const [saving, setSaving] = useState(false)

  const updateVariant = (i: number, key: string, val: string) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, [key]: val } : v)))
  const addVariant = () => setVariants((vs) => [...vs, emptyVariant()])
  const removeVariant = (i: number) =>
    setVariants((vs) => (vs.length > 1 ? vs.filter((_, idx) => idx !== i) : vs))

  const fetchMeds = async () => {
    try {
      const res = await fetch('/api/medications')
      if (!res.ok) throw new Error()
      setMedications(await res.json())
    } catch { 
      toast.error('Failed to load medications') 
    } finally { 
      setLoading(false) 
    }
  }

  const fetchPractitioners = async () => {
    try {
      const res = await fetch('/api/people')
      if (!res.ok) return
      const people = await res.json()
      setPractitioners((people ?? []).filter((p: any) => p.type === 'practitioner').map((p: any) => ({ id: p.id, name: p.name })))
    } catch { /* non-fatal */ }
  }

  useEffect(() => { 
    fetchMeds()
    fetchPractitioners() 
  }, [])

  const resetForm = () => {
    setForm({ name: '', genericName: '', medType: 'scheduled', isSchedule8: false, isOtc: false, monthlyLimit: '' })
    setVariants([emptyVariant()])
  }

  const handleAdd = async () => {
    if (!form.name) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      let parentId: string | null = null
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]
        const res: Response = await fetch('/api/medications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            genericName: form.genericName,
            medType: form.medType,
            isSchedule8: form.isSchedule8,
            isOtc: form.isOtc,
            monthlyLimit: form.monthlyLimit,
            strength: v.strength,
            unit: v.unit,
            form: v.form,
            parentId,
            initialStock: parseFloat(v.initialStock || '0'),
            reorderThreshold: parseFloat(v.reorderThreshold || '5'),
          }),
        })
        if (!res.ok) throw new Error()
        const created: any = await res.json()
        if (i === 0) parentId = created?.id ?? null
      }
      toast.success(variants.length > 1 ? `${variants.length} strengths added` : 'Medication added')
      setShowAdd(false)
      resetForm()
      fetchMeds()
    } catch { 
      toast.error('Failed to add medication') 
    } finally { 
      setSaving(false) 
    }
  }

  const productNames = Array.from(new Set((medications ?? []).map((m: any) => m?.name).filter(Boolean)))

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      <FadeIn>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center">
                <Pill className="h-5 w-5 text-violet-400" />
              </div>
              Medications
            </h1>
            <p className="text-muted-foreground mt-2">Track your medications, dosage schedules, and stock levels.</p>
          </div>
          <Button onClick={() => { resetForm(); setShowAdd(true) }} className="bg-violet-600 hover:bg-violet-700 text-white rounded-full px-6 shadow-md shadow-violet-500/20">
            <Plus className="h-4 w-4 mr-2" /> Add Medication
          </Button>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-500/90 leading-relaxed">
            This is a personal tracking tool only. It does not provide clinical decision support or medical advice. Always consult your healthcare provider.
          </p>
        </div>
      </FadeIn>

      <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(medications ?? []).map((med: any) => {
          const strengths = [med, ...((med?.children ?? []) as any[])].filter(s => s.strength || s.form)
          const totalVariants = strengths.length
          
          return (
            <StaggerItem key={med?.id}>
              <Card 
                className="group cursor-pointer border-border/50 hover:border-violet-500/30 bg-card hover:shadow-md hover:shadow-violet-500/5 transition-all duration-300 rounded-2xl overflow-hidden relative"
                onClick={() => setDetailMed(med)}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <CardContent className="p-6 relative z-10">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                        <Pill className="w-6 h-6 text-violet-400" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-medium text-foreground tracking-tight">{med?.name || 'Unknown'}</h3>
                        {med?.genericName && <p className="text-sm text-muted-foreground">{med.genericName}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {med?.isOtc ? (
                      <Badge variant="outline" className="bg-background text-muted-foreground border-border/50 font-normal">OTC</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-background text-muted-foreground border-border/50 font-normal">Rx</Badge>
                    )}
                    {med?.isSchedule8 && (
                      <Badge className="bg-amber-500/10 text-amber-500 border-transparent font-normal hover:bg-amber-500/20">S8</Badge>
                    )}
                    <Badge variant="secondary" className="bg-violet-500/10 text-violet-300 border-transparent font-normal">
                      {totalVariants} variant{totalVariants !== 1 && 's'}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {strengths.slice(0, 3).map((s: any) => {
                      const st = s?.stockLevels?.[0]
                      const low = st && st.currentQuantity <= st.reorderThreshold
                      
                      return (
                        <div key={s?.id} className="flex justify-between items-center text-sm p-3 rounded-xl bg-muted/40 border border-border/30 group-hover:border-border/60 transition-colors">
                          <span className="text-muted-foreground font-medium">
                            {s?.strength} {s?.unit} <span className="font-normal opacity-70 ml-1">{s?.form}</span>
                          </span>
                          <span className={cn(
                            "font-medium", 
                            low ? "text-amber-400" : "text-foreground"
                          )}>
                            {st?.currentQuantity ?? 0} <span className="opacity-70 font-normal text-xs ml-0.5">in stock</span>
                          </span>
                        </div>
                      )
                    })}
                    {strengths.length > 3 && (
                      <div className="text-center text-xs text-muted-foreground pt-2">
                        + {strengths.length - 3} more variants
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          )
        })}
      </Stagger>

      {(medications ?? []).length === 0 && (
        <FadeIn>
          <div className="py-20 text-center border border-border/50 border-dashed rounded-3xl bg-muted/10">
            <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
              <Pill className="h-8 w-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No medications yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">Add your first medication to start tracking prescriptions, dosage schedules, and stock levels.</p>
            <Button onClick={() => { resetForm(); setShowAdd(true) }} className="bg-violet-600 hover:bg-violet-700 text-white rounded-full">
              <Plus className="h-4 w-4 mr-2" /> Add Medication
            </Button>
          </div>
        </FadeIn>
      )}

      {detailMed && (
        <MedicationDetailDialog 
          med={detailMed} 
          practitioners={practitioners} 
          onClose={() => setDetailMed(null)} 
          onChanged={fetchMeds} 
          onPractitionerAdded={fetchPractitioners} 
        />
      )}

      {/* Add medication dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display tracking-tight">Add Medication</DialogTitle>
            <DialogDescription>Add a product and its strength variants with their starting stock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Brand Name *</Label>
                <Input list="med-name-options" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Zoloft" className="bg-muted/50" />
                <datalist id="med-name-options">{productNames.map((n) => <option key={n} value={n} />)}</datalist>
              </div>
              <div className="space-y-2">
                <Label>Generic Name</Label>
                <Input value={form.genericName} onChange={(e: any) => setForm({ ...form, genericName: e.target.value })} placeholder="e.g. sertraline" className="bg-muted/50" />
              </div>
            </div>

            {/* Product-level settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.medType} onValueChange={(v: string) => setForm({ ...form, medType: v })}>
                  <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MED_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monthly product limit (optional)</Label>
                <Input type="number" value={form.monthlyLimit} onChange={(e: any) => setForm({ ...form, monthlyLimit: e.target.value })} placeholder="e.g. 30" className="bg-muted/50" />
              </div>
            </div>
            
            <div className="flex flex-col gap-4 p-4 rounded-xl border border-border/50 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Schedule 8</Label>
                  <p className="text-xs text-muted-foreground">Controlled substance with strict 6-month script expiry</p>
                </div>
                <Switch checked={form.isSchedule8} onCheckedChange={(c: boolean) => setForm({ ...form, isSchedule8: c })} className="data-[state=checked]:bg-amber-500" />
              </div>
              <div className="h-px bg-border/50 w-full" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Over-the-counter</Label>
                  <p className="text-xs text-muted-foreground">No prescription required for purchase</p>
                </div>
                <Switch checked={form.isOtc} onCheckedChange={(c: boolean) => setForm({ ...form, isOtc: c })} className="data-[state=checked]:bg-violet-500" />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-lg font-medium">Strengths / Variants</Label>
              {variants.map((v, i) => (
                <div key={i} className="rounded-xl border border-border/50 p-4 space-y-4 bg-card relative">
                  {variants.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeVariant(i)} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive w-8 h-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-6">
                    <div className="space-y-2">
                      <Label className="text-xs">Strength</Label>
                      <Input value={v.strength} onChange={(e: any) => updateVariant(i, 'strength', e.target.value)} placeholder="e.g. 50" className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Unit</Label>
                      <Input value={v.unit} onChange={(e: any) => updateVariant(i, 'unit', e.target.value)} placeholder="e.g. mg" className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Form</Label>
                      <Select value={v.form} onValueChange={(val: string) => updateVariant(i, 'form', val)}>
                        <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['tablet','capsule','injection','liquid','topical','inhaler','patch','vape'].map(f => (
                            <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Initial Stock</Label>
                      <Input type="number" value={v.initialStock} onChange={(e: any) => updateVariant(i, 'initialStock', e.target.value)} className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Reorder Threshold</Label>
                      <Input type="number" value={v.reorderThreshold} onChange={(e: any) => updateVariant(i, 'reorderThreshold', e.target.value)} className="bg-muted/50" />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addVariant} className="w-full bg-violet-500/5 text-violet-400 border-dashed border-violet-500/20 hover:bg-violet-500/10 hover:text-violet-300">
                <Plus className="h-4 w-4 mr-2" /> Add another strength
              </Button>
            </div>

            <Button onClick={handleAdd} className="w-full bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 rounded-xl h-12 text-lg" loading={saving}>
              Add Medication
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
