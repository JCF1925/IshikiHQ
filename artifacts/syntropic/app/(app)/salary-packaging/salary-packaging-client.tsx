'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, CheckCircle2, Package, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber } from '@/components/safe-format'
import { incomeTax, medicareLevy, round2 } from '@/lib/tax'

type Pkg = {
  id: string
  name: string
  employerId: string | null
  packageType: string
  frequency: string
  grossSalary: number
  packagedAmount: number
  benefitType: string | null
  reportableAmount: number
  gstComponent: number
  postTaxDeduction: number
  reimbursement: number
  startDate: string | null
  isProvisional: boolean
  notes: string | null
}

const emptyForm = {
  name: '',
  employerId: '',
  packageType: 'recurring',
  frequency: 'annually',
  grossSalary: '',
  packagedAmount: '',
  benefitType: '',
  reportableAmount: '',
  gstComponent: '',
  postTaxDeduction: '',
  reimbursement: '',
  startDate: '',
  isProvisional: true,
  notes: '',
}

// Take-home for a straight gross salary (income tax + medicare only; HELP unaffected by packaging comparison here)
function takeHome(gross: number) {
  const t = incomeTax(gross)
  const m = medicareLevy(gross)
  return round2(gross - t - m)
}

export function SalaryPackagingClient() {
  const [items, setItems] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Pkg | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const p = await fetch('/api/salary-packaging').then((r) => r.json())
      setItems(Array.isArray(p) ? p : [])
    } catch {
      toast.error('Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true) }
  const openEdit = (p: Pkg) => {
    setEditing(p)
    setForm({
      name: p.name,
      employerId: p.employerId ?? '',
      packageType: p.packageType,
      frequency: p.frequency,
      grossSalary: String(p.grossSalary),
      packagedAmount: String(p.packagedAmount),
      benefitType: p.benefitType ?? '',
      reportableAmount: String(p.reportableAmount),
      gstComponent: String(p.gstComponent),
      postTaxDeduction: String(p.postTaxDeduction),
      reimbursement: String(p.reimbursement),
      startDate: p.startDate ? p.startDate.slice(0, 10) : '',
      isProvisional: p.isProvisional,
      notes: p.notes ?? '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.grossSalary) { toast.error('Gross salary is required'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/salary-packaging/${editing.id}` : '/api/salary-packaging'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, employerId: form.employerId || null }),
      })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Package updated' : 'Package saved')
      setDialogOpen(false)
      load()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this package model?')) return
    try {
      const res = await fetch(`/api/salary-packaging/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const promote = async (p: Pkg) => {
    try {
      const res = await fetch(`/api/salary-packaging/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isProvisional: false }),
      })
      if (!res.ok) throw new Error()
      toast.success('Promoted to actual')
      load()
    } catch {
      toast.error('Failed to promote')
    }
  }

  // Live modeller preview from the current form
  const preview = useMemo(() => {
    const gross = parseFloat(form.grossSalary) || 0
    const packaged = parseFloat(form.packagedAmount) || 0
    const postTax = parseFloat(form.postTaxDeduction) || 0
    const reimb = parseFloat(form.reimbursement) || 0
    const baseNet = takeHome(gross)
    const packagedTaxable = Math.max(0, gross - packaged)
    const packagedNet = round2(takeHome(packagedTaxable) - postTax + packaged + reimb)
    return { baseNet, packagedNet, diff: round2(packagedNet - baseNet) }
  }, [form.grossSalary, form.packagedAmount, form.postTaxDeduction, form.reimbursement])

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Salary Packaging</h1>
            <p className="text-sm text-muted-foreground">Model packages and see the take-home impact</p>
          </div>
          <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> New model</Button>
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No packaging models yet. Create one to test its impact on your take-home pay.
          </CardContent>
        </Card>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {items.map((p) => {
            const baseNet = takeHome(p.grossSalary)
            const packagedTaxable = Math.max(0, p.grossSalary - p.packagedAmount)
            const packagedNet = round2(takeHome(packagedTaxable) - p.postTaxDeduction + p.packagedAmount + p.reimbursement)
            const diff = round2(packagedNet - baseNet)
            return (
              <StaggerItem key={p.id}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Package className="h-4 w-4 text-primary" /> {p.name}
                        </CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="capitalize">{p.packageType}</Badge>
                          {p.packageType === 'recurring' && <span className="capitalize">{p.frequency}</span>}
                          {p.isProvisional
                            ? <Badge variant="outline">Provisional</Badge>
                            : <Badge className="bg-chart-2/20 text-chart-2">Actual</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="text-xs text-muted-foreground">Gross salary</div>
                        <div className="text-sm font-semibold"><SafeNumber value={p.grossSalary} currency="AUD" /></div>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="text-xs text-muted-foreground">Packaged (pre-tax)</div>
                        <div className="text-sm font-semibold"><SafeNumber value={p.packagedAmount} currency="AUD" /></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Take-home now</span>
                      <span className="font-medium"><SafeNumber value={baseNet} currency="AUD" /></span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold"><SafeNumber value={packagedNet} currency="AUD" /></span>
                    </div>
                    <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${diff >= 0 ? 'bg-chart-2/15 text-chart-2' : 'bg-destructive/15 text-destructive'}`}>
                      {diff >= 0 ? 'Better off by ' : 'Worse off by '}
                      <SafeNumber value={Math.abs(diff)} currency="AUD" /> / year
                    </div>
                    {p.reportableAmount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Reportable fringe benefit: <SafeNumber value={p.reportableAmount} currency="AUD" />
                      </p>
                    )}
                    {p.isProvisional && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => promote(p)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Promote to actual
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit package model' : 'New package model'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Novated lease" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.packageType} onValueChange={(v) => setForm({ ...form, packageType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recurring">Recurring</SelectItem>
                    <SelectItem value="oneoff">One-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })} disabled={form.packageType === 'oneoff'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'].map((f) => (
                      <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Gross salary (annual)</Label>
                <Input type="number" value={form.grossSalary} onChange={(e) => setForm({ ...form, grossSalary: e.target.value })} placeholder="0.00" />
              </div>
              <div className="grid gap-2">
                <Label>Packaged amount (pre-tax)</Label>
                <Input type="number" value={form.packagedAmount} onChange={(e) => setForm({ ...form, packagedAmount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Post-tax deduction</Label>
                <Input type="number" value={form.postTaxDeduction} onChange={(e) => setForm({ ...form, postTaxDeduction: e.target.value })} placeholder="0.00" />
              </div>
              <div className="grid gap-2">
                <Label>Reimbursement</Label>
                <Input type="number" value={form.reimbursement} onChange={(e) => setForm({ ...form, reimbursement: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Reportable fringe benefit</Label>
                <Input type="number" value={form.reportableAmount} onChange={(e) => setForm({ ...form, reportableAmount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="grid gap-2">
                <Label>GST component</Label>
                <Input type="number" value={form.gstComponent} onChange={(e) => setForm({ ...form, gstComponent: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Benefit type</Label>
                <Input value={form.benefitType} onChange={(e) => setForm({ ...form, benefitType: e.target.value })} placeholder="e.g. car, super, laptop" />
              </div>
              <div className="grid gap-2">
                <Label>Start date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Estimated impact (income tax + Medicare)</div>
              <div className="flex items-center justify-between text-sm">
                <span>Take-home now</span>
                <span className="font-medium"><SafeNumber value={preview.baseNet} currency="AUD" /></span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>With package</span>
                <span className="font-medium"><SafeNumber value={preview.packagedNet} currency="AUD" /></span>
              </div>
              <div className={`mt-1 flex items-center justify-between text-sm font-semibold ${preview.diff >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                <span>{preview.diff >= 0 ? 'Better off' : 'Worse off'}</span>
                <span><SafeNumber value={Math.abs(preview.diff)} currency="AUD" /> / yr</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label className="text-sm">Provisional</Label>
                <p className="text-xs text-muted-foreground">Off = counted as an actual arrangement</p>
              </div>
              <Switch checked={form.isProvisional} onCheckedChange={(v) => setForm({ ...form, isProvisional: v })} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Save model'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
