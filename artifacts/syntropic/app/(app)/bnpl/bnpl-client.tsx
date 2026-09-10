'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CreditCard, Plus, Trash2, RotateCcw, ChevronDown, ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber, SafeDate } from '@/components/safe-format'
import { BNPL_PRESETS } from '@/lib/recurrence'

type Instalment = { id: string; date: string; amount: number; currency: string; status: string; description: string | null }
type Plan = {
  id: string; provider: string; purchaseName: string; accountId: string | null; totalAmount: number; deposit: number
  numInstalments: number; frequency: string; startDate: string; instalmentAmount: number; status: string
  refundedAmount: number; category: string | null; notes: string | null; instalments: Instalment[]; paidCount: number; paidAmount: number
}
type Account = { id: string; name: string }

const PROVIDERS = Object.keys(BNPL_PRESETS)
const FREQS = ['weekly', 'fortnightly', 'monthly']

const emptyForm = {
  provider: 'Afterpay', purchaseName: '', totalAmount: '', deposit: '', numInstalments: '4',
  frequency: 'fortnightly', startDate: '', accountId: '', category: '', notes: '',
}

export function BnplClient() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/bnpl')
      if (!res.ok) throw new Error()
      setPlans(await res.json())
    } catch { toast.error('Failed to load plans') }
    finally { setLoading(false) }
  }, [])
  const fetchAccounts = useCallback(async () => {
    try { const r = await fetch('/api/accounts'); if (r.ok) setAccounts(await r.json()) } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchPlans(); fetchAccounts() }, [fetchPlans, fetchAccounts])

  const preset = BNPL_PRESETS[form.provider]
  const openAdd = () => {
    const p = BNPL_PRESETS['Afterpay']
    setForm({ ...emptyForm, numInstalments: String(p.numInstalments), frequency: p.frequency, startDate: new Date().toISOString().split('T')[0] })
    setShowAdd(true)
  }
  const onProviderChange = (v: string) => {
    const p = BNPL_PRESETS[v]
    setForm({ ...form, provider: v, numInstalments: String(p.numInstalments), frequency: p.frequency })
  }

  const estInstalment = () => {
    const total = parseFloat(form.totalAmount) || 0
    const dep = parseFloat(form.deposit) || 0
    const n = parseInt(form.numInstalments) || 1
    return n > 0 ? (total - dep) / n : 0
  }

  const handleSave = async () => {
    if (!form.purchaseName.trim()) { toast.error('Purchase name is required'); return }
    if (!form.totalAmount || isNaN(parseFloat(form.totalAmount))) { toast.error('Enter a valid total'); return }
    setSaving(true)
    try {
      const payload = {
        ...form, totalAmount: parseFloat(form.totalAmount), deposit: parseFloat(form.deposit) || 0,
        numInstalments: parseInt(form.numInstalments) || 1, accountId: form.accountId || null, category: form.category || null,
      }
      const res = await fetch('/api/bnpl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success('Plan created & instalments scheduled')
      setShowAdd(false)
      fetchPlans()
    } catch { toast.error('Failed to save plan') }
    finally { setSaving(false) }
  }

  const handleRefund = async (p: Plan) => {
    if (!confirm(`Refund "${p.purchaseName}"? Unpaid instalments are cancelled and a refund credit is recorded.`)) return
    setBusy(p.id)
    try {
      const res = await fetch(`/api/bnpl/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refund' }) })
      if (!res.ok) throw new Error()
      toast.success('Plan refunded')
      fetchPlans()
    } catch { toast.error('Failed to refund') }
    finally { setBusy(null) }
  }

  const handleDelete = async (p: Plan) => {
    if (!confirm(`Delete "${p.purchaseName}"? Unpaid instalments are removed; paid ones are kept in your ledger.`)) return
    setBusy(p.id)
    try {
      await fetch(`/api/bnpl/${p.id}`, { method: 'DELETE' })
      toast.success('Plan deleted')
      fetchPlans()
    } catch { toast.error('Failed to delete') }
    finally { setBusy(null) }
  }

  const activePlans = plans.filter((p) => p.status === 'active')
  const outstanding = activePlans.reduce((s, p) => s + Math.max(0, p.totalAmount - p.deposit - p.paidAmount), 0)

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><CreditCard className="h-6 w-6" /> BNPL &amp; Instalments</h1>
            <p className="text-muted-foreground text-sm mt-1">Track Buy Now Pay Later plans and instalment schedules across providers.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add plan</Button>
        </div>
      </FadeIn>

      <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock className="h-4 w-4" /> Outstanding</div>
            <p className="font-mono text-xl font-bold text-destructive"><SafeNumber value={outstanding} currency="AUD" /></p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CreditCard className="h-4 w-4" /> Active plans</div>
            <p className="font-mono text-xl font-bold">{activePlans.length}</p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CheckCircle2 className="h-4 w-4" /> Total plans</div>
            <p className="font-mono text-xl font-bold">{plans.length}</p>
          </CardContent></Card>
        </StaggerItem>
      </Stagger>

      {loading ? (
        <div className="space-y-3">{[1,2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : plans.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No BNPL plans yet. Add a purchase to schedule its instalments automatically.</p>
        </CardContent></Card>
      ) : (
        <Stagger className="space-y-3">
          {plans.map((p) => {
            const pct = p.numInstalments > 0 ? Math.round((p.paidCount / p.numInstalments) * 100) : 0
            const isOpen = expanded === p.id
            return (
              <StaggerItem key={p.id}>
                <Card className={p.status !== 'active' ? 'opacity-70' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <button onClick={() => setExpanded(isOpen ? null : p.id)} className="mt-0.5 text-muted-foreground hover:text-foreground">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{p.purchaseName}</p>
                          <Badge variant="outline" className="text-[10px]">{p.provider}</Badge>
                          {p.status === 'refunded' && <Badge variant="secondary" className="text-[10px]">Refunded</Badge>}
                          {p.status === 'completed' && <Badge className="text-[10px]">Completed</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.numInstalments} × <SafeNumber value={p.instalmentAmount} currency="AUD" /> {p.frequency}
                          {p.deposit > 0 ? <> · deposit <SafeNumber value={p.deposit} currency="AUD" /></> : ''}
                          {p.category ? ` · ${p.category}` : ''}
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{p.paidCount}/{p.numInstalments} paid</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-semibold"><SafeNumber value={p.totalAmount} currency="AUD" /></p>
                        <div className="flex items-center gap-1 justify-end mt-1">
                          {p.status === 'active' && (
                            <Button variant="ghost" size="icon-sm" onClick={() => handleRefund(p)} disabled={busy === p.id} title="Refund"><RotateCcw className="h-3.5 w-3.5" /></Button>
                          )}
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(p)} disabled={busy === p.id} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                        {p.instalments.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No instalments scheduled.</p>
                        ) : p.instalments.map((it) => (
                          <div key={it.id} className="flex items-center gap-3 text-xs">
                            <span className={it.status === 'confirmed' ? 'text-emerald-500' : 'text-muted-foreground'}>
                              {it.status === 'confirmed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            </span>
                            <span className="flex-1 text-muted-foreground">{it.description || 'Instalment'}</span>
                            <span className="text-muted-foreground"><SafeDate date={it.date} options={{ dateStyle: 'medium' }} /></span>
                            <span className="font-mono font-medium w-24 text-right"><SafeNumber value={Math.abs(it.amount)} currency={it.currency} /></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) setShowAdd(false) }}>
        <DialogContent aria-describedby="bnpl-dialog-description" className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add BNPL plan</DialogTitle></DialogHeader>
          <p id="bnpl-dialog-description" className="sr-only">Add a buy-now-pay-later plan and its repayment details.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider</Label>
                <Select value={form.provider} onValueChange={onProviderChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Purchase name *</Label><Input value={form.purchaseName} onChange={(e: any) => setForm({ ...form, purchaseName: e.target.value })} placeholder="e.g. Laptop" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Total amount *</Label><Input type="number" step="0.01" value={form.totalAmount} onChange={(e: any) => setForm({ ...form, totalAmount: e.target.value })} placeholder="0.00" /></div>
              <div><Label>Deposit</Label><Input type="number" step="0.01" value={form.deposit} onChange={(e: any) => setForm({ ...form, deposit: e.target.value })} placeholder="0.00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Instalments{preset?.fixed ? ' (fixed)' : ''}</Label>
                <Input type="number" min="1" value={form.numInstalments} onChange={(e: any) => setForm({ ...form, numInstalments: e.target.value })} disabled={preset?.fixed} />
              </div>
              <div>
                <Label>Frequency{preset?.fixed ? ' (fixed)' : ''}</Label>
                <Select value={form.frequency} onValueChange={(v: string) => setForm({ ...form, frequency: v })} disabled={preset?.fixed}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQS.map((f) => <SelectItem key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start date</Label><Input type="date" value={form.startDate} onChange={(e: any) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div>
                <Label>Account</Label>
                <Select value={form.accountId || 'none'} onValueChange={(v: string) => setForm({ ...form, accountId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })} placeholder="Optional" /></div>
            <div className="rounded-lg border border-border p-3 bg-muted/30 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated per instalment</span>
                <span className="font-mono font-semibold"><SafeNumber value={estInstalment()} currency="AUD" /></span>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" loading={saving}>Create plan &amp; schedule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
