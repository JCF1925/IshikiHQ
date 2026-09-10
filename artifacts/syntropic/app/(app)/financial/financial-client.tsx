'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, Plus, Trash2, Settings2, LineChart, Flag, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'
import { SafeNumber } from '@/components/safe-format'
import { projectPlan, type PlanInputs, type PlanEventInput } from '@/lib/finance'

type PlanEvent = { id: string; label: string; year: number; kind: string; amount: number; isDebtFunded: boolean; isRecurring: boolean; endYear: number | null; notes: string | null }
type Plan = {
  id: string; name: string; startYear: number; numYears: number; currentSalary: number; currentSuperBalance: number
  currentInvestments: number; currentCash: number; inflationRate: number; wageGrowthRate: number; superReturnRate: number
  investmentReturnRate: number; extraSuperContribution: number; annualSavings: number; retirementYear: number | null; notes: string | null; events: PlanEvent[]
}

const CURRENT_YEAR = new Date().getFullYear()

const EVENT_KINDS = [
  { value: 'expense', label: 'Large expense' },
  { value: 'asset_purchase', label: 'Asset purchase' },
  { value: 'lump_sum', label: 'Lump sum / savings' },
  { value: 'windfall', label: 'Windfall / inheritance' },
  { value: 'income_change', label: 'Income change' },
]

export function FinancialClient() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEvent, setShowEvent] = useState(false)
  const [saving, setSaving] = useState(false)

  const [newForm, setNewForm] = useState<any>({ name: 'Retirement Plan', startYear: '', numYears: '30', retirementYear: '', seedFromData: true })
  const [settings, setSettings] = useState<any>(null)
  const [eventForm, setEventForm] = useState<any>({ label: '', year: '', kind: 'expense', amount: '', isDebtFunded: false, isRecurring: false, endYear: '' })

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/financial-plans')
      if (!res.ok) throw new Error()
      const data: Plan[] = await res.json()
      setPlans(data)
      setActiveId((prev) => prev && data.some((p) => p.id === prev) ? prev : (data[0]?.id ?? ''))
    } catch { toast.error('Failed to load plans') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const active = plans.find((p) => p.id === activeId) ?? null

  const createPlan = async () => {
    setSaving(true)
    try {
      const payload = { ...newForm, startYear: newForm.startYear || new Date().getFullYear() }
      const res = await fetch('/api/financial-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      const plan = await res.json()
      toast.success('Plan created')
      setShowNew(false); await fetchData(); setActiveId(plan.id)
    } catch { toast.error('Failed to create plan') }
    finally { setSaving(false) }
  }

  const openSettings = () => {
    if (!active) return
    setSettings({
      name: active.name, currentSalary: String(active.currentSalary), currentSuperBalance: String(active.currentSuperBalance),
      currentInvestments: String(active.currentInvestments), currentCash: String(active.currentCash), inflationRate: String(active.inflationRate),
      wageGrowthRate: String(active.wageGrowthRate), superReturnRate: String(active.superReturnRate), investmentReturnRate: String(active.investmentReturnRate),
      extraSuperContribution: String(active.extraSuperContribution), annualSavings: String(active.annualSavings),
      startYear: String(active.startYear), numYears: String(active.numYears), retirementYear: active.retirementYear ? String(active.retirementYear) : '',
    })
    setShowSettings(true)
  }

  const saveSettings = async () => {
    if (!active) return
    setSaving(true)
    try {
      const res = await fetch(`/api/financial-plans/${active.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      if (!res.ok) throw new Error()
      toast.success('Plan updated'); setShowSettings(false); fetchData()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const deletePlan = async () => {
    if (!active || !confirm(`Delete plan "${active.name}"?`)) return
    try { await fetch(`/api/financial-plans/${active.id}`, { method: 'DELETE' }); toast.success('Plan deleted'); setActiveId(''); fetchData() }
    catch { toast.error('Failed to delete') }
  }

  const addEvent = async () => {
    if (!active) return
    if (!eventForm.label.trim()) { toast.error('Label required'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/financial-plans/${active.id}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventForm) })
      if (!res.ok) throw new Error()
      toast.success('Event added'); setShowEvent(false); setEventForm({ label: '', year: '', kind: 'expense', amount: '', isDebtFunded: false, isRecurring: false, endYear: '' }); fetchData()
    } catch { toast.error('Failed to add event') }
    finally { setSaving(false) }
  }

  const deleteEvent = async (eventId: string) => {
    if (!active) return
    try { await fetch(`/api/financial-plans/${active.id}/events?eventId=${eventId}`, { method: 'DELETE' }); toast.success('Event removed'); fetchData() }
    catch { toast.error('Failed to remove') }
  }

  const forecast = useMemo(() => {
    if (!active) return []
    const inputs: PlanInputs = {
      startYear: active.startYear, numYears: active.numYears, currentSalary: active.currentSalary, currentSuperBalance: active.currentSuperBalance,
      currentInvestments: active.currentInvestments, currentCash: active.currentCash, inflationRate: active.inflationRate, wageGrowthRate: active.wageGrowthRate,
      superReturnRate: active.superReturnRate, investmentReturnRate: active.investmentReturnRate, extraSuperContribution: active.extraSuperContribution,
      annualSavings: active.annualSavings, retirementYear: active.retirementYear, superGuaranteeRate: 12,
    }
    const events: PlanEventInput[] = active.events.map((e) => ({ label: e.label, year: e.year, kind: e.kind, amount: e.amount, isDebtFunded: e.isDebtFunded, isRecurring: e.isRecurring, endYear: e.endYear }))
    return projectPlan(inputs, events)
  }, [active])

  const finalRow = forecast[forecast.length - 1]
  const retirementRow = active?.retirementYear ? forecast.find((r) => r.year === active.retirementYear) : null
  const peakNetWorth = forecast.reduce((m, r) => Math.max(m, r.netWorth), 0)

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><TrendingUp className="h-6 w-6" /> Financial Planning</h1>
            <p className="text-muted-foreground text-sm mt-1">Long-range net-worth &amp; retirement forecasting with your real numbers.</p>
          </div>
          <div className="flex items-center gap-2">
            {plans.length > 0 && (
              <Select value={activeId} onValueChange={setActiveId}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button onClick={() => { setNewForm({ name: 'Retirement Plan', startYear: '', numYears: '30', retirementYear: '', seedFromData: true }); setShowNew(true) }}><Plus className="h-4 w-4 mr-2" /> New plan</Button>
          </div>
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>
      ) : !active ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          <LineChart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="mb-4">No financial plan yet. Create one to forecast your net worth and retirement over the coming decades.</p>
          <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-2" /> Create your first plan</Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net worth in {finalRow?.year}</p><p className="font-mono text-2xl font-bold mt-1"><SafeNumber value={finalRow?.netWorth ?? 0} currency="AUD" /></p><p className="text-[11px] text-muted-foreground mt-1">Today's dollars: <SafeNumber value={finalRow?.netWorthReal ?? 0} currency="AUD" /></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Super at end</p><p className="font-mono text-2xl font-bold mt-1"><SafeNumber value={finalRow?.superBalance ?? 0} currency="AUD" /></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Investments at end</p><p className="font-mono text-2xl font-bold mt-1"><SafeNumber value={finalRow?.investments ?? 0} currency="AUD" /></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Flag className="h-3 w-3" /> {active.retirementYear ? `At retirement (${active.retirementYear})` : 'Peak net worth'}</p><p className="font-mono text-2xl font-bold mt-1 text-primary"><SafeNumber value={retirementRow?.netWorth ?? peakNetWorth} currency="AUD" /></p></CardContent></Card>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={openSettings}><Settings2 className="h-4 w-4 mr-2" /> Assumptions</Button>
            <Button variant="outline" size="sm" onClick={() => { setEventForm({ label: '', year: String(active.startYear), kind: 'expense', amount: '', isDebtFunded: false, isRecurring: false, endYear: '' }); setShowEvent(true) }}><CalendarClock className="h-4 w-4 mr-2" /> Add event</Button>
            <Button variant="outline" size="sm" onClick={deletePlan} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete plan</Button>
            <div className="text-xs text-muted-foreground ml-auto">Inflation {active.inflationRate}% · Wage {active.wageGrowthRate}% · Super {active.superReturnRate}% · Invest {active.investmentReturnRate}%</div>
          </div>

          {active.events.length > 0 && (
            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Planned events</h3>
              <div className="flex flex-wrap gap-2">
                {active.events.map((e) => (
                  <Badge key={e.id} variant="secondary" className="gap-1.5 py-1.5 pl-2.5 pr-1.5">
                    <span>{e.year} · {e.label} · <span className="font-mono">${e.amount.toLocaleString('en-AU')}</span>{e.isDebtFunded ? ' (debt)' : ''}{e.isRecurring ? ` → ${e.endYear || '∞'}` : ''}</span>
                    <button onClick={() => deleteEvent(e.id)} className="hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </CardContent></Card>
          )}

          <Card><CardContent className="p-0">
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Year</TableHead><TableHead className="text-right">Salary</TableHead><TableHead className="text-right">Super</TableHead>
                    <TableHead className="text-right">Investments</TableHead><TableHead className="text-right">Cash</TableHead>
                    <TableHead className="text-right">Net worth</TableHead><TableHead className="text-right">Real (today)</TableHead><TableHead>Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecast.map((r) => (
                    <TableRow key={r.year} className={r.retired ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">{r.year}{r.year === active.retirementYear && <Badge variant="default" className="ml-2 text-[10px]">Retire</Badge>}</TableCell>
                      <TableCell className="text-right font-mono text-xs"><SafeNumber value={r.salary} currency="AUD" /></TableCell>
                      <TableCell className="text-right font-mono text-xs"><SafeNumber value={r.superBalance} currency="AUD" /></TableCell>
                      <TableCell className="text-right font-mono text-xs"><SafeNumber value={r.investments} currency="AUD" /></TableCell>
                      <TableCell className="text-right font-mono text-xs"><SafeNumber value={r.cash} currency="AUD" /></TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold"><SafeNumber value={r.netWorth} currency="AUD" /></TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground"><SafeNumber value={r.netWorthReal} currency="AUD" /></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.events.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
          <p className="text-[11px] text-muted-foreground">Projections are estimates for personal planning only, not financial advice. Assumes 12% super guarantee and constant real returns; actual outcomes will vary.</p>
        </>
      )}

      {/* New plan dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent aria-describedby="new-financial-plan-dialog-description" className="max-w-md">
          <DialogHeader><DialogTitle>New financial plan</DialogTitle></DialogHeader>
          <p id="new-financial-plan-dialog-description" className="sr-only">Create a financial plan and its assumptions.</p>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Plan name</Label><Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Start year</Label><Input type="number" value={newForm.startYear} onChange={(e) => setNewForm({ ...newForm, startYear: e.target.value })} placeholder={String(CURRENT_YEAR)} /></div>
              <div className="space-y-1.5"><Label>Years</Label><Input type="number" value={newForm.numYears} onChange={(e) => setNewForm({ ...newForm, numYears: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Retire year</Label><Input type="number" value={newForm.retirementYear} onChange={(e) => setNewForm({ ...newForm, retirementYear: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><Label>Seed from my data</Label><p className="text-xs text-muted-foreground">Pre-fill salary, super, investments &amp; cash from your accounts</p></div>
              <Switch checked={newForm.seedFromData} onCheckedChange={(v) => setNewForm({ ...newForm, seedFromData: v })} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button><Button onClick={createPlan} loading={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent aria-describedby="financial-settings-dialog-description" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Plan assumptions</DialogTitle></DialogHeader>
          <p id="financial-settings-dialog-description" className="sr-only">Review and update the assumptions used by this financial plan.</p>
          {settings && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Plan name</Label><Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></div>
              <p className="text-xs font-medium text-muted-foreground">Starting position</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Salary (A$)</Label><Input type="number" value={settings.currentSalary} onChange={(e) => setSettings({ ...settings, currentSalary: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Super balance (A$)</Label><Input type="number" value={settings.currentSuperBalance} onChange={(e) => setSettings({ ...settings, currentSuperBalance: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Investments (A$)</Label><Input type="number" value={settings.currentInvestments} onChange={(e) => setSettings({ ...settings, currentInvestments: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Cash (A$)</Label><Input type="number" value={settings.currentCash} onChange={(e) => setSettings({ ...settings, currentCash: e.target.value })} /></div>
              </div>
              <p className="text-xs font-medium text-muted-foreground">Annual rates (%)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Inflation</Label><Input type="number" value={settings.inflationRate} onChange={(e) => setSettings({ ...settings, inflationRate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Wage growth</Label><Input type="number" value={settings.wageGrowthRate} onChange={(e) => setSettings({ ...settings, wageGrowthRate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Super return</Label><Input type="number" value={settings.superReturnRate} onChange={(e) => setSettings({ ...settings, superReturnRate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Investment return</Label><Input type="number" value={settings.investmentReturnRate} onChange={(e) => setSettings({ ...settings, investmentReturnRate: e.target.value })} /></div>
              </div>
              <p className="text-xs font-medium text-muted-foreground">Contributions &amp; horizon</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Extra super p.a. (A$)</Label><Input type="number" value={settings.extraSuperContribution} onChange={(e) => setSettings({ ...settings, extraSuperContribution: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Annual savings (A$)</Label><Input type="number" value={settings.annualSavings} onChange={(e) => setSettings({ ...settings, annualSavings: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Start year</Label><Input type="number" value={settings.startYear} onChange={(e) => setSettings({ ...settings, startYear: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Years</Label><Input type="number" value={settings.numYears} onChange={(e) => setSettings({ ...settings, numYears: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Retirement year</Label><Input type="number" value={settings.retirementYear} onChange={(e) => setSettings({ ...settings, retirementYear: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button><Button onClick={saveSettings} loading={saving}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event dialog */}
      <Dialog open={showEvent} onOpenChange={setShowEvent}>
        <DialogContent aria-describedby="financial-event-dialog-description" className="max-w-md">
          <DialogHeader><DialogTitle>Add planned event</DialogTitle></DialogHeader>
          <p id="financial-event-dialog-description" className="sr-only">Add a planned event to the financial plan.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Label</Label><Input value={eventForm.label} onChange={(e) => setEventForm({ ...eventForm, label: e.target.value })} placeholder="e.g. New car" /></div>
              <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={eventForm.year} onChange={(e) => setEventForm({ ...eventForm, year: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={eventForm.kind} onValueChange={(v) => setEventForm({ ...eventForm, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Amount (A$)</Label><Input type="number" value={eventForm.amount} onChange={(e) => setEventForm({ ...eventForm, amount: e.target.value })} /></div>
            </div>
            {eventForm.kind === 'asset_purchase' && (
              <div className="flex items-center justify-between rounded-lg border p-3"><div><Label>Debt-funded</Label><p className="text-xs text-muted-foreground">Purchase financed by borrowing</p></div><Switch checked={eventForm.isDebtFunded} onCheckedChange={(v) => setEventForm({ ...eventForm, isDebtFunded: v })} /></div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-3"><div><Label>Recurring</Label><p className="text-xs text-muted-foreground">Repeats every year</p></div><Switch checked={eventForm.isRecurring} onCheckedChange={(v) => setEventForm({ ...eventForm, isRecurring: v })} /></div>
            {eventForm.isRecurring && <div className="space-y-1.5"><Label>End year (blank = ongoing)</Label><Input type="number" value={eventForm.endYear} onChange={(e) => setEventForm({ ...eventForm, endYear: e.target.value })} /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowEvent(false)}>Cancel</Button><Button onClick={addEvent} loading={saving}>Add event</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
