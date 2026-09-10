'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { CreditCard, Plus, Trash2, Pencil, TrendingDown, Banknote, Landmark, Zap, DollarSign, Target } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber } from '@/components/safe-format'
import { simulatePaydown, type DebtInput } from '@/lib/finance'

type Liability = {
  id: string; name: string; liabilityType: string; currentBalance: number; originalAmount: number | null
  interestRate: number; cashRate: number | null; btRate: number | null; btFee: number | null; btEndDate: string | null
  annualFee: number | null; monthlyFee: number | null; oneOffFee: number | null; recurringFee: number | null; recurringFeeFrequency: string | null
  termMonths: number | null; repaymentAmount: number | null; repaymentFrequency: string | null; repaymentMethod: string | null; minPayment: number | null
  startDate: string | null; numRepayments: number | null; totalFees: number | null; totalInterest: number | null; isActive: boolean; notes: string | null
}
type Summary = { totalDebt: number; weightedRate: number; annualInterest: number; count: number }

const LIABILITY_TYPES = [
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'personal_loan', label: 'Personal Loan', icon: Banknote },
  { value: 'small_loan', label: 'Small Loan', icon: DollarSign },
  { value: 'mortgage', label: 'Mortgage', icon: Landmark },
  { value: 'buy_now_pay_later', label: 'BNPL', icon: Zap },
  { value: 'other', label: 'Other', icon: TrendingDown },
]
const typeMeta = (t: string) => LIABILITY_TYPES.find((x) => x.value === t) ?? LIABILITY_TYPES[5]

const emptyForm: any = {
  name: '', liabilityType: 'credit_card', currentBalance: '', originalAmount: '', interestRate: '',
  cashRate: '', btRate: '', btFee: '', btEndDate: '', annualFee: '', monthlyFee: '', oneOffFee: '', recurringFee: '', recurringFeeFrequency: 'monthly',
  termMonths: '', repaymentAmount: '', repaymentFrequency: 'monthly', repaymentMethod: 'principal_and_interest', minPayment: '',
  startDate: '', numRepayments: '', totalFees: '', totalInterest: '', notes: '',
}

export function LiabilitiesClient() {
  const [liabilities, setLiabilities] = useState<Liability[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Liability | null>(null)
  const [form, setForm] = useState<any>({ ...emptyForm })
  // repayment dialog
  const [repayFor, setRepayFor] = useState<Liability | null>(null)
  const [repayAmount, setRepayAmount] = useState('')
  const [repayAddTxn, setRepayAddTxn] = useState(true)
  // planner
  const [budget, setBudget] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/liabilities')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLiabilities(data.liabilities); setSummary(data.summary)
    } catch { toast.error('Failed to load liabilities') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setShowAdd(true) }
  const openEdit = (l: Liability) => {
    setEditing(l)
    const f: any = { ...emptyForm }
    for (const k of Object.keys(emptyForm)) {
      const v = (l as any)[k]
      if (k === 'btEndDate' || k === 'startDate') f[k] = v ? String(v).slice(0, 10) : ''
      else f[k] = v == null ? '' : String(v)
    }
    f.recurringFeeFrequency = l.recurringFeeFrequency ?? 'monthly'
    f.repaymentFrequency = l.repaymentFrequency ?? 'monthly'
    f.repaymentMethod = l.repaymentMethod ?? 'principal_and_interest'
    setForm(f); setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/liabilities/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/liabilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Liability updated' : 'Liability added')
      setShowAdd(false); setEditing(null); fetchData()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async (l: Liability) => {
    if (!confirm(`Delete "${l.name}"?`)) return
    try { await fetch(`/api/liabilities/${l.id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchData() }
    catch { toast.error('Failed to delete') }
  }

  const submitRepayment = async () => {
    if (!repayFor) return
    const amt = parseFloat(repayAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    try {
      const res = await fetch(`/api/liabilities/${repayFor.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repayment', amount: amt, addTransaction: repayAddTxn }),
      })
      if (!res.ok) throw new Error()
      toast.success('Repayment recorded')
      setRepayFor(null); setRepayAmount(''); fetchData()
    } catch { toast.error('Failed to record repayment') }
  }

  const active = liabilities.filter((l) => l.isActive)
  const debtInputs: DebtInput[] = active.map((l) => ({
    id: l.id, name: l.name, balance: l.currentBalance,
    interestRate: l.interestRate, minPayment: l.minPayment ?? l.repaymentAmount ?? Math.max(25, l.currentBalance * 0.02),
  }))
  const totalMin = debtInputs.reduce((s, d) => s + d.minPayment, 0)
  const budgetNum = Math.max(parseFloat(budget) || 0, totalMin)

  const { avalanche, snowball } = useMemo(() => {
    if (debtInputs.length === 0 || budgetNum <= 0) return { avalanche: null as any, snowball: null as any }
    return {
      avalanche: simulatePaydown(debtInputs, budgetNum, 'avalanche'),
      snowball: simulatePaydown(debtInputs, budgetNum, 'snowball'),
    }
  }, [JSON.stringify(debtInputs), budgetNum])

  const savings = avalanche && snowball ? Math.round((snowball.totalInterest - avalanche.totalInterest) * 100) / 100 : 0

  const LiabCard = ({ l }: { l: Liability }) => {
    const Icon = typeMeta(l.liabilityType).icon
    const progress = l.originalAmount && l.originalAmount > 0 ? Math.min(100, ((l.originalAmount - l.currentBalance) / l.originalAmount) * 100) : 0
    return (
      <Card className="group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-destructive" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap"><p className="font-medium truncate">{l.name}</p>{!l.isActive && <Badge variant="secondary" className="text-xs">Paid off</Badge>}</div>
              <p className="text-xs text-muted-foreground">{typeMeta(l.liabilityType).label} · {l.interestRate}% p.a.</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon-sm" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(l)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="flex items-end justify-between mt-4">
            <div><p className="text-[11px] text-muted-foreground">Balance owing</p><p className="font-mono text-xl font-bold text-destructive"><SafeNumber value={l.currentBalance} currency="AUD" /></p></div>
            {l.isActive && <Button size="sm" variant="outline" onClick={() => { setRepayFor(l); setRepayAmount(l.repaymentAmount ? String(l.repaymentAmount) : ''); setRepayAddTxn(true) }}>Record repayment</Button>}
          </div>
          {progress > 0 && <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>}
          {(l.btRate != null || l.annualFee || l.repaymentAmount) && (
            <div className="flex gap-3 mt-3 text-[11px] text-muted-foreground flex-wrap">
              {l.btRate != null && <span>BT {l.btRate}%{l.btEndDate ? ` to ${String(l.btEndDate).slice(0,10)}` : ''}</span>}
              {l.annualFee ? <span>Annual fee A${l.annualFee}</span> : null}
              {l.repaymentAmount ? <span>Repay A${l.repaymentAmount}/{(l.repaymentFrequency||'mo').slice(0,2)}</span> : null}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const months = (m: number) => `${Math.floor(m / 12)}y ${m % 12}m`

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><CreditCard className="h-6 w-6" /> Liabilities</h1>
            <p className="text-muted-foreground text-sm mt-1">Every debt, its true cost, and the fastest way to clear it.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add liability</Button>
        </div>
      </FadeIn>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <Tabs defaultValue="register">
          <TabsList><TabsTrigger value="register">Register</TabsTrigger><TabsTrigger value="planner">Paydown Planner</TabsTrigger></TabsList>

          <TabsContent value="register" className="space-y-6 mt-4">
            <Stagger className="grid gap-4 sm:grid-cols-3">
              <StaggerItem><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total debt</p><p className="font-mono text-2xl font-bold mt-1 text-destructive"><SafeNumber value={summary?.totalDebt ?? 0} currency="AUD" /></p></CardContent></Card></StaggerItem>
              <StaggerItem><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avg rate (weighted)</p><p className="font-mono text-2xl font-bold mt-1">{(summary?.weightedRate ?? 0).toFixed(2)}%</p></CardContent></Card></StaggerItem>
              <StaggerItem><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Interest p.a.</p><p className="font-mono text-2xl font-bold mt-1"><SafeNumber value={summary?.annualInterest ?? 0} currency="AUD" /></p></CardContent></Card></StaggerItem>
            </Stagger>
            {liabilities.length === 0 ? (
              <Card><CardContent className="p-10 text-center text-muted-foreground"><CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>No liabilities yet. Add credit cards, loans or a mortgage to track and plan paydown.</p></CardContent></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{liabilities.map((l) => <LiabCard key={l.id} l={l} />)}</div>
            )}
          </TabsContent>

          <TabsContent value="planner" className="space-y-6 mt-4">
            <Card><CardContent className="p-4 space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5"><Label>Monthly budget (A$)</Label><Input type="number" className="w-40" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={String(Math.ceil(totalMin))} /></div>
                <p className="text-xs text-muted-foreground mb-2">Minimum required: <span className="font-mono"><SafeNumber value={totalMin} currency="AUD" /></span>/mo across {active.length} debt{active.length !== 1 ? 's' : ''}</p>
              </div>
              {active.length === 0 && <p className="text-sm text-muted-foreground">Add some active debts to compare paydown strategies.</p>}
            </CardContent></Card>

            {avalanche && snowball && (
              <>
                {savings !== 0 && (
                  <Card className="border-primary/40"><CardContent className="p-4 flex items-center gap-3">
                    <Target className="h-8 w-8 text-primary shrink-0" />
                    <div><p className="text-sm">The <span className="font-semibold">Avalanche</span> method (highest-rate first) saves you <span className="font-mono font-bold text-primary"><SafeNumber value={Math.abs(savings)} currency="AUD" /></span> in interest and clears your debt {snowball.months - avalanche.months >= 0 ? `${snowball.months - avalanche.months} month${Math.abs(snowball.months-avalanche.months)!==1?'s':''} sooner` : 'in similar time'} vs Snowball.</p></div>
                  </CardContent></Card>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {[avalanche, snowball].map((r) => (
                    <Card key={r.strategy}><CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold capitalize flex items-center gap-2">{r.strategy === 'avalanche' ? <Zap className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4" />}{r.strategy}</h3>
                        <Badge variant={r.strategy === 'avalanche' ? 'default' : 'secondary'}>{months(r.months)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Total interest paid</p>
                      <p className="font-mono text-xl font-bold mb-3"><SafeNumber value={r.totalInterest} currency="AUD" /></p>
                      <p className="text-[11px] text-muted-foreground mb-1">Payoff order</p>
                      <ol className="space-y-1">
                        {r.payoffOrder.map((p: any, i: number) => (
                          <li key={p.id} className="flex items-center justify-between text-sm"><span className="truncate">{i + 1}. {p.name}</span><span className="text-xs text-muted-foreground font-mono">{months(p.payoffMonth)}</span></li>
                        ))}
                      </ol>
                    </CardContent></Card>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Estimates assume the budget stays constant and rates don't change. Balance-transfer promos and fees are not modelled in the projection.</p>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Add / edit dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit liability' : 'Add liability'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.liabilityType} onValueChange={(v) => setForm({ ...form, liabilityType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LIABILITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Balance owing (A$)</Label><Input type="number" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Original / limit (A$)</Label><Input type="number" value={form.originalAmount} onChange={(e) => setForm({ ...form, originalAmount: e.target.value })} /></div>
            </div>

            {form.liabilityType === 'credit_card' && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground">Credit card rates &amp; fees</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Purchase %</Label><Input type="number" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Cash %</Label><Input type="number" value={form.cashRate} onChange={(e) => setForm({ ...form, cashRate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>BT %</Label><Input type="number" value={form.btRate} onChange={(e) => setForm({ ...form, btRate: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>BT fee %</Label><Input type="number" value={form.btFee} onChange={(e) => setForm({ ...form, btFee: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>BT ends</Label><Input type="date" value={form.btEndDate} onChange={(e) => setForm({ ...form, btEndDate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Annual fee</Label><Input type="number" value={form.annualFee} onChange={(e) => setForm({ ...form, annualFee: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Monthly fee</Label><Input type="number" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Min payment</Label><Input type="number" value={form.minPayment} onChange={(e) => setForm({ ...form, minPayment: e.target.value })} /></div>
                </div>
              </div>
            )}

            {form.liabilityType === 'personal_loan' && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground">Personal loan terms</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Rate %</Label><Input type="number" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Term (mo)</Label><Input type="number" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Repayment</Label><Input type="number" value={form.repaymentAmount} onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Frequency</Label>
                    <Select value={form.repaymentFrequency} onValueChange={(v) => setForm({ ...form, repaymentFrequency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="fortnightly">Fortnightly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select>
                  </div>
                  <div className="space-y-1.5"><Label>Method</Label>
                    <Select value={form.repaymentMethod} onValueChange={(v) => setForm({ ...form, repaymentMethod: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="principal_and_interest">P&amp;I</SelectItem><SelectItem value="interest_only">Interest only</SelectItem><SelectItem value="minimum">Minimum</SelectItem><SelectItem value="fixed">Fixed</SelectItem></SelectContent></Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>One-off fee</Label><Input type="number" value={form.oneOffFee} onChange={(e) => setForm({ ...form, oneOffFee: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Recurring fee</Label><Input type="number" value={form.recurringFee} onChange={(e) => setForm({ ...form, recurringFee: e.target.value })} /></div>
                </div>
              </div>
            )}

            {form.liabilityType === 'small_loan' && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground">Small loan summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label># repayments</Label><Input type="number" value={form.numRepayments} onChange={(e) => setForm({ ...form, numRepayments: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Repayment (A$)</Label><Input type="number" value={form.repaymentAmount} onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Total fees (A$)</Label><Input type="number" value={form.totalFees} onChange={(e) => setForm({ ...form, totalFees: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Total interest (A$)</Label><Input type="number" value={form.totalInterest} onChange={(e) => setForm({ ...form, totalInterest: e.target.value })} /></div>
                </div>
              </div>
            )}

            {(form.liabilityType === 'mortgage' || form.liabilityType === 'buy_now_pay_later' || form.liabilityType === 'other') && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Rate %</Label><Input type="number" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Term (mo)</Label><Input type="number" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Repayment</Label><Input type="number" value={form.repaymentAmount} onChange={(e) => setForm({ ...form, repaymentAmount: e.target.value })} /></div>
              </div>
            )}

            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save' : 'Add liability'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repayment dialog */}
      <Dialog open={!!repayFor} onOpenChange={(o) => !o && setRepayFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record repayment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{repayFor?.name} — balance <span className="font-mono"><SafeNumber value={repayFor?.currentBalance ?? 0} currency="AUD" /></span></p>
            <div className="space-y-1.5"><Label>Amount (A$)</Label><Input type="number" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} autoFocus /></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><Label className="text-sm">Also add to transactions</Label>
              <input type="checkbox" checked={repayAddTxn} onChange={(e) => setRepayAddTxn(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepayFor(null)}>Cancel</Button>
            <Button onClick={submitRepayment}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
