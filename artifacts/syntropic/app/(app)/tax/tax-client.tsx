'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Trash2, Clock, TrendingUp, Calculator, GraduationCap, Home, CalendarRange, Wand2, Plane } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'
import { SafeNumber, SafeDate } from '@/components/safe-format'

const FYS = ['2024-25', '2025-26', '2026-27', '2027-28']
const DEFAULT_FY = '2026-27'

type Scenario = {
  deductions: number; taxable: number; incomeTax: number; medicare: number
  help: number; repaymentIncome: number; totalTax: number; net: number
}
type Summary = {
  fy: string; grossTaxable: number; superAnnual: number; netCapitalGain: number
  reportableFringe: number; actualDeductions: number; forecastDeductions: number
  deductionsByCategory: { category: string; actual: number; forecast: number }[]
  incomeBreakdown: { id: string; name: string; baseAnnual: number; superAnnual: number }[]
  comparator: { noDeductions: Scenario; actual: Scenario; actualForecast: Scenario }
  savingsFromActual: number; savingsFromForecast: number
  help: { balance: number; repaymentActual: number; repaymentActualForecast: number; repaymentIncomeActual: number; repaymentIncomeActualForecast: number }
  withholding: { withheldEstimate: number; estRefundActual: number; estRefundActualForecast: number }
  wfh: { hours: number; fixedRateDeduction: number }
}

export function TaxClient() {
  const [fy, setFy] = useState(DEFAULT_FY)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetch(`/api/tax/summary?fy=${fy}`).then((r) => r.json())
      setSummary(s)
    } catch {
      toast.error('Failed to load tax summary')
    } finally {
      setLoading(false)
    }
  }, [fy])

  useEffect(() => { loadSummary() }, [loadSummary])

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Taxation</h1>
            <p className="text-sm text-muted-foreground">Your Australian tax position, HELP, WFH diary and capital gains</p>
          </div>
          <div className="w-40">
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FYS.map((f) => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      <Tabs defaultValue="position">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="position"><Calculator className="mr-2 h-4 w-4" /> Position</TabsTrigger>
          <TabsTrigger value="help"><GraduationCap className="mr-2 h-4 w-4" /> HELP</TabsTrigger>
          <TabsTrigger value="wfh"><Home className="mr-2 h-4 w-4" /> WFH diary</TabsTrigger>
          <TabsTrigger value="cgt"><TrendingUp className="mr-2 h-4 w-4" /> Capital gains</TabsTrigger>
        </TabsList>

        <TabsContent value="position" className="mt-4">
          <PositionTab summary={summary} loading={loading} />
        </TabsContent>
        <TabsContent value="help" className="mt-4">
          <HelpTab summary={summary} onChange={loadSummary} />
        </TabsContent>
        <TabsContent value="wfh" className="mt-4">
          <WfhTab fy={fy} onChange={loadSummary} />
        </TabsContent>
        <TabsContent value="cgt" className="mt-4">
          <CgtTab onChange={loadSummary} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------- Position tab ---------------- */
function PositionTab({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  if (loading || !summary) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
  }
  const c = summary.comparator
  const cols: { key: keyof Summary['comparator']; label: string }[] = [
    { key: 'noDeductions', label: 'No deductions' },
    { key: 'actual', label: 'Actual' },
    { key: 'actualForecast', label: 'Actual + forecast' },
  ]
  const rows: { label: string; get: (s: Scenario) => number }[] = [
    { label: 'Deductions', get: (s) => s.deductions },
    { label: 'Taxable income', get: (s) => s.taxable },
    { label: 'Income tax', get: (s) => s.incomeTax },
    { label: 'Medicare levy', get: (s) => s.medicare },
    { label: 'HELP repayment', get: (s) => s.help },
    { label: 'Total tax', get: (s) => s.totalTax },
    { label: 'Net income', get: (s) => s.net },
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Gross taxable" value={summary.grossTaxable} />
        <StatCard label="Superannuation" value={summary.superAnnual} tone="text-chart-2" />
        <StatCard label="Tax saved (actual deductions)" value={summary.savingsFromActual} tone="text-chart-2" />
        <StatCard label="Est. refund (actual+forecast)" value={summary.withholding.estRefundActualForecast} tone={summary.withholding.estRefundActualForecast >= 0 ? 'text-chart-2' : 'text-destructive'} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Deduction comparator</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Measure</TableHead>
                {cols.map((col) => <TableHead key={col.key} className="text-right">{col.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  {cols.map((col) => (
                    <TableCell key={col.key} className={`text-right ${row.label === 'Net income' ? 'font-semibold text-chart-2' : ''}`}>
                      <SafeNumber value={row.get(c[col.key])} currency="AUD" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Claiming your forecast deductions could save a further{' '}
            <span className="font-medium text-chart-2"><SafeNumber value={summary.savingsFromForecast} currency="AUD" /></span>{' '}in tax.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Deductions by category</CardTitle></CardHeader>
          <CardContent>
            {summary.deductionsByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deductible transactions tagged yet. Mark transactions as deductible and assign an ATO category.</p>
            ) : (
              <div className="space-y-2">
                {summary.deductionsByCategory.map((d) => (
                  <div key={d.category} className="flex items-center justify-between text-sm">
                    <span>{d.category || 'Uncategorised'}</span>
                    <span className="flex items-center gap-2">
                      <SafeNumber value={d.actual} currency="AUD" />
                      {d.forecast > 0 && <Badge variant="outline" className="text-xs">+<SafeNumber value={d.forecast} currency="AUD" /> forecast</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Income sources</CardTitle></CardHeader>
          <CardContent>
            {summary.incomeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No income sources added yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.incomeBreakdown.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span>{i.name}</span>
                    <span className="text-muted-foreground"><SafeNumber value={i.baseAnnual} currency="AUD" /></span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ---------------- HELP tab ---------------- */
function HelpTab({ summary, onChange }: { summary: Summary | null; onChange: () => void }) {
  const [debts, setDebts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ originalAmount: '', currentBalance: '', indexationDate: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/help-debt').then((r) => r.json())
      setDebts(Array.isArray(d) ? d : [])
    } catch { toast.error('Failed to load HELP debt') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.currentBalance) { toast.error('Current balance is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/help-debt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('HELP debt saved'); setOpen(false)
      setForm({ originalAmount: '', currentBalance: '', indexationDate: '', notes: '' })
      load(); onChange()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this HELP debt?')) return
    try {
      const res = await fetch(`/api/help-debt/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted'); load(); onChange()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="HELP balance" value={summary.help.balance} tone="text-destructive" />
          <StatCard label="Repayment (actual)" value={summary.help.repaymentActual} />
          <StatCard label="Repayment (actual+forecast)" value={summary.help.repaymentActualForecast} />
          <StatCard label="Repayment income" value={summary.help.repaymentIncomeActual} />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">HELP / study loan debts</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add debt</Button>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-24 w-full" /> : debts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No HELP debt recorded.</p>
          ) : (
            <div className="space-y-2">
              {debts.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium"><SafeNumber value={d.currentBalance} currency="AUD" /> outstanding</div>
                    <div className="text-xs text-muted-foreground">
                      Original <SafeNumber value={d.originalAmount} currency="AUD" />
                      {d.indexationDate && <> · indexed <SafeDate date={d.indexationDate} options={{ dateStyle: 'medium' }} /></>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
          {summary && (
            <p className="mt-4 text-xs text-muted-foreground">
              Repayment income (taxable income + reportable fringe benefits) drives your compulsory repayment.
              With forecast deductions your repayment income is{' '}
              <SafeNumber value={summary.help.repaymentIncomeActualForecast} currency="AUD" />, giving a repayment of{' '}
              <SafeNumber value={summary.help.repaymentActualForecast} currency="AUD" />.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add HELP debt</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Original amount</Label>
                <Input type="number" value={form.originalAmount} onChange={(e) => setForm({ ...form, originalAmount: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Current balance</Label>
                <Input type="number" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Last indexation date</Label>
              <Input type="date" value={form.indexationDate} onChange={(e) => setForm({ ...form, indexationDate: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- WFH tab ---------------- */
function WfhTab({ fy, onChange }: { fy: string; onChange: () => void }) {
  const [data, setData] = useState<{ entries: any[]; totalHours: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: '', hours: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [actualCost, setActualCost] = useState('')

  // Pattern / leave / holidays
  const [patterns, setPatterns] = useState<any[]>([])
  const [leave, setLeave] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [patOpen, setPatOpen] = useState(false)
  const [patForm, setPatForm] = useState<{ dayOfWeek: number[]; hours: string; startDate: string; notes: string }>({ dayOfWeek: [1, 2, 3, 4, 5], hours: '7.6', startDate: '', notes: '' })
  const [patSaving, setPatSaving] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genForm, setGenForm] = useState({ startDate: '', endDate: '' })
  const [genCandidates, setGenCandidates] = useState<{ date: string; hours: number }[] | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', leaveType: 'annual', notes: '' })
  const [holForm, setHolForm] = useState({ date: '', name: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, p, l, h] = await Promise.all([
        fetch(`/api/wfh-diary?fy=${fy}`).then((r) => r.json()),
        fetch('/api/wfh-patterns').then((r) => r.json()),
        fetch('/api/leave').then((r) => r.json()),
        fetch('/api/public-holidays').then((r) => r.json()),
      ])
      setData(d)
      setPatterns(Array.isArray(p) ? p : [])
      setLeave(Array.isArray(l) ? l : [])
      setHolidays(Array.isArray(h) ? h : [])
    } catch { toast.error('Failed to load WFH diary') } finally { setLoading(false) }
  }, [fy])
  useEffect(() => { load() }, [load])

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const toggleDow = (d: number) => setPatForm((f) => ({ ...f, dayOfWeek: f.dayOfWeek.includes(d) ? f.dayOfWeek.filter((x) => x !== d) : [...f.dayOfWeek, d].sort() }))

  const savePattern = async () => {
    if (patForm.dayOfWeek.length === 0) { toast.error('Select at least one weekday'); return }
    setPatSaving(true)
    try {
      const res = await fetch('/api/wfh-patterns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patForm, startDate: patForm.startDate || new Date().toISOString().slice(0, 10) }),
      })
      if (!res.ok) throw new Error()
      toast.success('Pattern saved'); setPatOpen(false)
      setPatForm({ dayOfWeek: [1, 2, 3, 4, 5], hours: '7.6', startDate: '', notes: '' })
      load()
    } catch { toast.error('Failed to save pattern') } finally { setPatSaving(false) }
  }

  const removePattern = async (id: string) => {
    try { const res = await fetch(`/api/wfh-patterns/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error(); toast.success('Pattern removed'); load() } catch { toast.error('Failed') }
  }

  const previewGen = async () => {
    if (!genForm.startDate || !genForm.endDate) { toast.error('Pick a date range'); return }
    setGenBusy(true)
    try {
      const res = await fetch('/api/wfh-diary/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...genForm, commit: false }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'No entries'); setGenCandidates([]); return }
      setGenCandidates(d.candidates || [])
    } catch { toast.error('Failed to preview') } finally { setGenBusy(false) }
  }

  const commitGen = async () => {
    setGenBusy(true)
    try {
      const res = await fetch('/api/wfh-diary/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...genForm, commit: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error()
      toast.success(`${d.created} entries created`); setGenOpen(false); setGenCandidates(null)
      setGenForm({ startDate: '', endDate: '' }); load(); onChange()
    } catch { toast.error('Failed to generate') } finally { setGenBusy(false) }
  }

  const addLeave = async () => {
    if (!leaveForm.startDate) { toast.error('Start date required'); return }
    try {
      const res = await fetch('/api/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...leaveForm, endDate: leaveForm.endDate || leaveForm.startDate }),
      })
      if (!res.ok) throw new Error()
      toast.success('Leave added'); setLeaveForm({ startDate: '', endDate: '', leaveType: 'annual', notes: '' }); load()
    } catch { toast.error('Failed') }
  }
  const removeLeave = async (id: string) => { try { const r = await fetch(`/api/leave/${id}`, { method: 'DELETE' }); if (!r.ok) throw new Error(); load() } catch { toast.error('Failed') } }

  const addHoliday = async () => {
    if (!holForm.date || !holForm.name) { toast.error('Date and name required'); return }
    try {
      const res = await fetch('/api/public-holidays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holForm),
      })
      if (!res.ok) throw new Error()
      toast.success('Holiday added'); setHolForm({ date: '', name: '' }); load()
    } catch { toast.error('Failed') }
  }
  const removeHoliday = async (id: string) => { try { const r = await fetch(`/api/public-holidays/${id}`, { method: 'DELETE' }); if (!r.ok) throw new Error(); load() } catch { toast.error('Failed') } }

  const save = async () => {
    if (!form.date || !form.hours) { toast.error('Date and hours are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/wfh-diary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Entry added'); setOpen(false); setForm({ date: '', hours: '', notes: '' })
      load(); onChange()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/wfh-diary/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Removed'); load(); onChange()
    } catch { toast.error('Failed to remove') }
  }

  const totalHours = data?.totalHours ?? 0
  const fixedRate = Math.round(totalHours * 0.7 * 100) / 100
  const actual = parseFloat(actualCost) || 0
  const better = actual > fixedRate ? 'actual-cost' : 'fixed-rate'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={`WFH hours (FY ${fy})`} value={totalHours} currency={null} suffix=" h" />
        <StatCard label="Fixed-rate deduction (70c/h)" value={fixedRate} tone="text-chart-2" />
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Actual-cost estimate</div>
            <Input type="number" value={actualCost} onChange={(e) => setActualCost(e.target.value)} placeholder="0.00" className="mt-2" />
            {actual > 0 && (
              <p className="mt-2 text-xs">
                Better method: <span className="font-semibold text-primary">{better}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* WFH pattern + auto-generate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4 text-primary" /> WFH pattern</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPatOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add pattern</Button>
            <Button size="sm" onClick={() => { setGenCandidates(null); setGenOpen(true) }} disabled={patterns.filter((p) => p.isActive).length === 0}><Wand2 className="mr-2 h-4 w-4" /> Auto-fill diary</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Set your usual work-from-home days once, then auto-generate diary entries for any date range — leave and public holidays are skipped, and you confirm before anything is saved.</p>
          {patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pattern set up yet.</p>
          ) : patterns.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {!p.isActive && <Badge variant="outline">Inactive</Badge>}
                <span className="font-medium">{p.dayOfWeek.map((d: number) => DOW[d]).join(', ')}</span>
                <span className="text-muted-foreground">{p.hours} h/day</span>
                <span className="text-xs text-muted-foreground">from <SafeDate date={p.startDate} options={{ dateStyle: 'medium' }} /></span>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => removePattern(p.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Leave & public holidays */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plane className="h-4 w-4 text-primary" /> Leave</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
              <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm({ ...leaveForm, leaveType: v })}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['annual', 'personal', 'sick', 'unpaid', 'long_service', 'other'].map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={addLeave}><Plus className="h-4 w-4" /></Button>
            </div>
            {leave.length === 0 ? <p className="text-xs text-muted-foreground">No leave recorded.</p> : leave.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{l.leaveType.replace('_', ' ')}</Badge><SafeDate date={l.startDate} options={{ dateStyle: 'medium' }} /> – <SafeDate date={l.endDate} options={{ dateStyle: 'medium' }} /></span>
                <Button variant="ghost" size="icon-sm" onClick={() => removeLeave(l.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4 text-primary" /> Public holidays</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input type="date" value={holForm.date} onChange={(e) => setHolForm({ ...holForm, date: e.target.value })} />
              <Input value={holForm.name} onChange={(e) => setHolForm({ ...holForm, name: e.target.value })} placeholder="Name" />
              <Button size="sm" onClick={addHoliday}><Plus className="h-4 w-4" /></Button>
            </div>
            {holidays.length === 0 ? <p className="text-xs text-muted-foreground">No holidays recorded.</p> : holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2"><SafeDate date={h.date} options={{ dateStyle: 'medium' }} /><span className="text-muted-foreground">{h.name}</span></span>
                <Button variant="ghost" size="icon-sm" onClick={() => removeHoliday(h.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Diary entries</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Log hours</Button>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-24 w-full" /> : !data || data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No WFH hours logged for this year.</p>
          ) : (
            <div className="space-y-2">
              {data.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <SafeDate date={e.date} options={{ dateStyle: 'medium' }} />
                    <span className="font-medium">{e.hours} h</span>
                    {e.notes && <span className="text-xs text-muted-foreground">{e.notes}</span>}
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Log WFH hours</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Hours</Label>
                <Input type="number" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pattern dialog */}
      <Dialog open={patOpen} onOpenChange={setPatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add WFH pattern</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Work-from-home days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DOW.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDow(i)}
                    className={`rounded-md border px-2.5 py-1 text-sm ${patForm.dayOfWeek.includes(i) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Hours / day</Label><Input type="number" step="0.1" value={patForm.hours} onChange={(e) => setPatForm({ ...patForm, hours: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Effective from</Label><Input type="date" value={patForm.startDate} onChange={(e) => setPatForm({ ...patForm, startDate: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Notes</Label><Input value={patForm.notes} onChange={(e) => setPatForm({ ...patForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPatOpen(false)}>Cancel</Button>
            <Button onClick={savePattern} loading={patSaving}>Save pattern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={(o) => { setGenOpen(o); if (!o) setGenCandidates(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Auto-fill WFH diary</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>From</Label><Input type="date" value={genForm.startDate} onChange={(e) => { setGenForm({ ...genForm, startDate: e.target.value }); setGenCandidates(null) }} /></div>
              <div className="grid gap-2"><Label>To</Label><Input type="date" value={genForm.endDate} onChange={(e) => { setGenForm({ ...genForm, endDate: e.target.value }); setGenCandidates(null) }} /></div>
            </div>
            {genCandidates !== null && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                {genCandidates.length === 0 ? (
                  <p className="text-muted-foreground">No new WFH days in this range (already logged, on leave, or a holiday).</p>
                ) : (
                  <p><span className="font-semibold text-primary">{genCandidates.length}</span> entries will be created ({genCandidates.reduce((a, c) => a + c.hours, 0)} h total).</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            {genCandidates === null ? (
              <Button onClick={previewGen} loading={genBusy}>Preview</Button>
            ) : (
              <Button onClick={commitGen} loading={genBusy} disabled={genCandidates.length === 0}>Create entries</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- CGT tab ---------------- */
function CgtTab({ onChange }: { onChange: () => void }) {
  const [data, setData] = useState<{ events: any[]; summary: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    assetName: '', assetType: 'shares', quantity: '', acquireDate: '', acquireCost: '',
    disposalDate: '', disposalProceeds: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/cgt').then((r) => r.json())
      setData(d)
    } catch { toast.error('Failed to load capital gains') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.assetName || !form.acquireCost) { toast.error('Asset name and cost are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/cgt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Asset saved'); setOpen(false)
      setForm({ assetName: '', assetType: 'shares', quantity: '', acquireDate: '', acquireCost: '', disposalDate: '', disposalProceeds: '', notes: '' })
      load(); onChange()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this asset?')) return
    try {
      const res = await fetch(`/api/cgt/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted'); load(); onChange()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="space-y-6">
      {data && data.summary.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Realised gains by year</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Financial year</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Discounted gains</TableHead>
                  <TableHead className="text-right">Losses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.summary.map((s) => (
                  <TableRow key={s.fy}>
                    <TableCell className="font-medium">{s.fy}</TableCell>
                    <TableCell className="text-right"><SafeNumber value={s.gross} currency="AUD" /></TableCell>
                    <TableCell className="text-right"><SafeNumber value={s.gains} currency="AUD" /></TableCell>
                    <TableCell className="text-right text-destructive"><SafeNumber value={s.losses} currency="AUD" /></TableCell>
                    <TableCell className="text-right font-semibold"><SafeNumber value={s.net} currency="AUD" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Assets &amp; disposals</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add asset</Button>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-24 w-full" /> : !data || data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.events.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {e.assetName}
                      <Badge variant="secondary" className="capitalize">{e.assetType}</Badge>
                      {e.realised
                        ? <Badge variant={e.gross >= 0 ? 'default' : 'destructive'}>{e.gross >= 0 ? 'Gain' : 'Loss'}</Badge>
                        : <Badge variant="outline">Held</Badge>}
                      {e.realised && e.eligible && <Badge variant="outline" className="text-xs">50% discount</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Cost <SafeNumber value={e.acquireCost} currency="AUD" />
                      {e.realised && <> · proceeds <SafeNumber value={e.disposalProceeds} currency="AUD" /> · taxable <span className={e.discounted >= 0 ? 'text-chart-2' : 'text-destructive'}><SafeNumber value={e.discounted} currency="AUD" /></span></>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Add asset</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Asset name</Label>
                <Input value={form.assetName} onChange={(e) => setForm({ ...form, assetName: e.target.value })} placeholder="e.g. VAS units" />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.assetType} onValueChange={(v) => setForm({ ...form, assetType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['shares', 'etf', 'property', 'crypto', 'other'].map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quantity</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Acquisition cost</Label>
                <Input type="number" value={form.acquireCost} onChange={(e) => setForm({ ...form, acquireCost: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Acquisition date</Label>
              <Input type="date" value={form.acquireDate} onChange={(e) => setForm({ ...form, acquireDate: e.target.value })} />
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-3 text-xs text-muted-foreground">Disposal (leave blank if still held)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Disposal date</Label>
                  <Input type="date" value={form.disposalDate} onChange={(e) => setForm({ ...form, disposalDate: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Disposal proceeds</Label>
                  <Input type="number" value={form.disposalProceeds} onChange={(e) => setForm({ ...form, disposalProceeds: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- shared ---------------- */
function StatCard({ label, value, tone, currency = 'AUD', suffix }: { label: string; value: number; tone?: string; currency?: string | null; suffix?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-2 text-xl font-semibold ${tone ?? ''}`}>
          {currency ? <SafeNumber value={value} currency="AUD" /> : <><SafeNumber value={value} />{suffix}</>}
        </div>
      </CardContent>
    </Card>
  )
}
