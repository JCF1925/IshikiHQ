'use client'

import { useEffect, useState } from 'react'
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
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, TrendingUp, Wallet, Coins, Percent, Building2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber, SafeDate } from '@/components/safe-format'

type Increase = {
  id: string
  effectiveDate: string
  changeType: string
  value: number
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  decidedAt: string | null
  decisionNotes: string | null
}

type IncomeSource = {
  id: string
  name: string
  type: string
  employerId: string | null
  employerName: string | null
  amount: number
  frequency: string
  hoursPerWeek: number | null
  isGross: boolean
  incSuper: boolean
  superRate: number
  payAccountId: string | null
  startDate: string
  endDate: string | null
  isActive: boolean
  notes: string | null
  annualPackageAmount: number | null
  payFrequency: string | null
  firstPayDate: string | null
  payEndDate: string | null
  retainPayHistory: boolean
  increases: Increase[]
  currentStated: number
  statedAnnual: number
  baseAnnual: number
  superAnnual: number
  totalPackage: number
  annualIncomeTax: number
  annualMedicare: number
  annualHelp: number
  annualNet: number
}

type Org = { id: string; name: string }
type Account = { id: string; name: string; type: string }
type OptionalDataErrors = { employers: string | null; accounts: string | null }

const FREQUENCIES = ['hourly', 'weekly', 'fortnightly', 'monthly', 'annually']
const TYPES = ['salary', 'freelance', 'centrelink', 'investment', 'other']

const emptyForm = {
  name: '',
  type: 'salary',
  employerId: '',
  amount: '',
  frequency: 'fortnightly',
  hoursPerWeek: '',
  isGross: true,
  incSuper: false,
  superRate: '12',
  payAccountId: '',
  startDate: '',
  endDate: '',
  isActive: true,
  notes: '',
  annualPackageAmount: '',
  payFrequency: 'fortnightly',
  firstPayDate: '',
  payEndDate: '',
  retainPayHistory: true,
}

const today = () => new Date().toISOString().slice(0, 10)

class ApiRequestError extends Error {
  code?: string
  diagnosticId?: string

  constructor(message: string, code?: string, diagnosticId?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.diagnosticId = diagnosticId
  }
}

function requestErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiRequestError)) return error instanceof Error ? error.message : fallback
  return error.diagnosticId
    ? `${error.message} (Diagnostic ID: ${error.diagnosticId})`
    : error.message
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const details = body?.error?.details
    const firstDetail = Array.isArray(details) ? details[0] : null
    const message = firstDetail?.field && firstDetail?.message
      ? `${firstDetail.field}: ${firstDetail.message}`
      : body?.error?.message ?? body?.error ?? 'Request failed'
    throw new ApiRequestError(
      message,
      body?.error?.code,
      typeof body?.error?.details?.diagnosticId === 'string' ? body.error.details.diagnosticId : undefined,
    )
  }
  return body
}

export function IncomeClient() {
  const [sources, setSources] = useState<IncomeSource[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [optionalDataErrors, setOptionalDataErrors] = useState<OptionalDataErrors>({
    employers: null,
    accounts: null,
  })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<IncomeSource | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  const [incDialogFor, setIncDialogFor] = useState<string | null>(null)
  const [incForm, setIncForm] = useState({ effectiveDate: '', changeType: 'percent', value: '', newSuperRate: '', notes: '' })
  const [incSaving, setIncSaving] = useState(false)

  const [payDialogFor, setPayDialogFor] = useState<IncomeSource | null>(null)
  const [periods, setPeriods] = useState<any[]>([])
  const [periodCycle, setPeriodCycle] = useState<any>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null)
  const [candidateTransactions, setCandidateTransactions] = useState<any[]>([])
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([])
  const [workForm, setWorkForm] = useState({ evidenceType: 'regular_pattern', hours: '', leaveHours: '', leaveType: '', location: 'workplace', notes: '' })
  const hydratePeriod = (p: any) => {
    if (!p) return
    setSelectedPeriod(p)
    setConfirmedGross(String(p.confirmedGross ?? p.expectedGross ?? ''))
    setReimbursementAmount(String(p.reimbursementAmount ?? 0))
    setSelectedTransactions((p.transactions ?? []).filter((x: any) => x.kind === 'gross').map((x: any) => x.transactionId))
    if (p.workEvidence) {
      setWorkForm({
        evidenceType: p.workEvidence.evidenceType,
        hours: String(p.workEvidence.hours ?? ''),
        leaveHours: String(p.workEvidence.leaveHours ?? ''),
        leaveType: p.workEvidence.leaveType ?? '',
        location: p.workEvidence.location ?? 'workplace',
        notes: p.workEvidence.notes ?? '',
      })
    } else {
      setWorkForm({ evidenceType: 'regular_pattern', hours: '', leaveHours: '', leaveType: '', location: 'workplace', notes: '' })
    }
  }
  const [payDate, setPayDate] = useState('')
  const [confirmedGross, setConfirmedGross] = useState('')
  const [reimbursementAmount, setReimbursementAmount] = useState('0')
  const [paySaving, setPaySaving] = useState(false)

  const load = async (showError = true): Promise<boolean> => {
    setLoading(true)
    const [incomeResult, employersResult, accountsResult] = await Promise.allSettled([
      fetchJson('/api/income'),
      fetchJson('/api/organisations'),
      fetchJson('/api/accounts'),
    ])

    if (employersResult.status === 'fulfilled') {
      setOrgs(Array.isArray(employersResult.value) ? employersResult.value : [])
    } else {
      setOrgs([])
    }
    if (accountsResult.status === 'fulfilled') {
      const accountBody = accountsResult.value
      setAccounts(Array.isArray(accountBody) ? accountBody : Array.isArray(accountBody?.data) ? accountBody.data : [])
    } else {
      setAccounts([])
    }
    setOptionalDataErrors({
      employers: employersResult.status === 'rejected'
        ? 'Employer options are temporarily unavailable. You can still save income without an employer.'
        : null,
      accounts: accountsResult.status === 'rejected'
        ? 'Pay account options are temporarily unavailable. You can still save income without a pay account.'
        : null,
    })

    setLoading(false)
    if (incomeResult.status === 'rejected') {
      if (showError) {
        toast.error(incomeResult.reason instanceof Error
          ? incomeResult.reason.message
          : 'Income data could not be loaded. Try again.')
      }
      return false
    }

    setSources(Array.isArray(incomeResult.value) ? incomeResult.value : [])
    return true
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, startDate: today(), firstPayDate: today(), annualPackageAmount: '' })
    setDialogOpen(true)
  }

  const openEdit = (s: IncomeSource) => {
    setEditing(s)
    setForm({
      name: s.name,
      type: s.type,
      // Keep existing links in the form even when their lookup list failed.
      // Sending an empty value here would turn a temporary lookup outage into
      // a destructive unlink on the next save.
      employerId: s.employerId ?? '',
      amount: String(s.amount),
      frequency: s.frequency,
      hoursPerWeek: s.hoursPerWeek != null ? String(s.hoursPerWeek) : '',
      isGross: s.isGross,
      incSuper: s.incSuper,
      superRate: String(s.superRate),
      payAccountId: s.payAccountId ?? '',
      startDate: s.startDate ? s.startDate.slice(0, 10) : '',
      endDate: s.endDate ? s.endDate.slice(0, 10) : '',
      isActive: s.isActive,
      notes: s.notes ?? '',
      annualPackageAmount: s.annualPackageAmount != null ? String(s.annualPackageAmount) : '',
      payFrequency: s.payFrequency ?? (s.frequency === 'monthly' ? 'monthly' : 'fortnightly'),
      firstPayDate: s.firstPayDate ? s.firstPayDate.slice(0, 10) : s.startDate.slice(0, 10),
      payEndDate: s.payEndDate ? s.payEndDate.slice(0, 10) : '',
      retainPayHistory: s.retainPayHistory,
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.amount.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error('Amount must be greater than zero')
      return
    }
    if (form.frequency === 'hourly' && (!form.hoursPerWeek.trim() || !Number.isFinite(Number(form.hoursPerWeek)) || Number(form.hoursPerWeek) <= 0 || Number(form.hoursPerWeek) > 168)) {
      toast.error('Hours per week must be between 0 and 168 for hourly income')
      return
    }
    if (!form.superRate.trim() || !Number.isFinite(Number(form.superRate)) || Number(form.superRate) < 0 || Number(form.superRate) > 100) {
      toast.error('Super rate must be between 0 and 100%')
      return
    }
    if (!form.startDate) { toast.error('Start date is required'); return }
    if (!form.annualPackageAmount.trim() || Number(form.annualPackageAmount) < 0) { toast.error('Annual package amount is required'); return }
    if (!form.firstPayDate) { toast.error('First pay date is required'); return }
    if (form.payEndDate && form.payEndDate < form.firstPayDate) { toast.error('Pay end date must be on or after first pay date'); return }
    if (form.endDate && form.endDate < form.startDate) { toast.error('End date must be on or after start date'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/income/${editing.id}` : '/api/income'
      const method = editing ? 'PATCH' : 'POST'
      const savedSource = await fetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          employerId: form.employerId || null,
          payAccountId: form.payAccountId || null,
          annualPackageAmount: form.annualPackageAmount ? Number(form.annualPackageAmount) : null,
          payFrequency: form.payFrequency,
          firstPayDate: form.firstPayDate || null,
          payEndDate: form.payEndDate || null,
          retainPayHistory: form.retainPayHistory,
        }),
      })
      await fetchJson(`/api/income/${savedSource.id}/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annualPackageAmount: Number(form.annualPackageAmount),
          frequency: form.payFrequency,
          firstPayDate: form.firstPayDate,
          endDate: form.payEndDate || null,
          retainHistory: form.retainPayHistory,
        }),
      })
      toast.success(editing ? 'Income source updated' : 'Income source added')
      setDialogOpen(false)
      setEditing(null)
      setForm({ ...emptyForm })
      const refreshed = await load(false)
      if (!refreshed) toast.error('Income source saved, but the list could not be refreshed. Refresh the page to confirm it.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Income source could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this income source and its increases?')) return
    try {
      const res = await fetch(`/api/income/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const openIncrease = (sourceId: string) => {
    setIncDialogFor(sourceId)
    setIncForm({ effectiveDate: '', changeType: 'percent', value: '', newSuperRate: '', notes: '' })
  }

  const openPayRun = async (s: IncomeSource) => {
    setPayDialogFor(s)
    setPayDate(new Date().toISOString().slice(0, 10))
    setConfirmedGross(String(Math.round(perCycle(s, 'gross') * 100) / 100))
    const history = await fetchJson(`/api/income/${s.id}/periods`).catch(() => ({ periods: [], candidates: [] }))
    setPeriods(history.periods ?? [])
    setCandidateTransactions(history.candidates ?? [])
    hydratePeriod((history.periods ?? []).find((p: any) => p.status === 'open') ?? null)
  }

  const generatePay = async () => {
    if (!payDialogFor) return
    if (!payDate) { toast.error('Pay date is required'); return }
    setPaySaving(true)
    try {
      const res = await fetch(`/api/income/${payDialogFor.id}/generate-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payDate }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedPeriod(data.period)
      const history = await fetchJson(`/api/income/${payDialogFor.id}/periods`)
      setPeriods(history.periods ?? periods)
      setCandidateTransactions(history.candidates ?? [])
      toast.success('Pay period ready for review')
    } catch {
      toast.error('Failed to generate pay run')
    } finally {
      setPaySaving(false)
    }
  }

  const confirmPeriod = async () => {
    if (!payDialogFor || !selectedPeriod) return
    setPaySaving(true)
    try {
      await fetchJson(`/api/income/${payDialogFor.id}/periods/${selectedPeriod.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedGross: Number(confirmedGross), reimbursementAmount: Number(reimbursementAmount || 0), transactionIds: selectedTransactions, work: { ...workForm, hours: Number(workForm.hours || 0), leaveHours: Number(workForm.leaveHours || 0) } }),
      })
      const history = await fetchJson(`/api/income/${payDialogFor.id}/periods`)
      setPeriods(history.periods ?? [])
      hydratePeriod((history.periods ?? []).find((p: any) => p.id === selectedPeriod.id))
      toast.success('Pay period confirmed')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not confirm pay period') }
    finally { setPaySaving(false) }
  }

  const saveIncrease = async () => {
    if (!incDialogFor) return
    if (!incForm.effectiveDate) { toast.error('Effective date is required'); return }
    if (incForm.changeType === 'sg_rate') {
      if (!incForm.newSuperRate) { toast.error('New super rate is required'); return }
    } else if (!incForm.value) { toast.error('Value is required'); return }
    setIncSaving(true)
    try {
      await fetchJson('/api/salary-increases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incomeSourceId: incDialogFor,
          effectiveDate: incForm.effectiveDate,
          changeType: incForm.changeType,
          value: incForm.changeType === 'sg_rate' ? Number(incForm.newSuperRate) : Number(incForm.value),
          newSuperRate: incForm.changeType === 'sg_rate' ? Number(incForm.newSuperRate) : undefined,
          notes: incForm.notes,
        }),
      })
      toast.success('Pay change submitted for review; forecasts remain unchanged until approval')
      setIncDialogFor(null)
      const refreshed = await load(false)
      if (!refreshed) toast.error('Pay change saved, but the list could not be refreshed. Refresh the page to confirm it.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pay change could not be saved. Try again.')
    } finally {
      setIncSaving(false)
    }
  }

  const removeIncrease = async (id: string) => {
    try {
      await fetchJson(`/api/salary-increases/${id}`, { method: 'DELETE' })
      toast.success('Increase removed')
      const refreshed = await load(false)
      if (!refreshed) toast.error('Increase removed, but the pay change list could not be refreshed. Refresh the page to confirm it.')
    } catch (error) {
      toast.error(requestErrorMessage(error, 'Pay change could not be deleted. Try again.'))
    }
  }

  const decideIncrease = async (id: string, action: 'approve' | 'reject') => {
    try {
      await fetchJson(`/api/salary-increases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      toast.success(action === 'approve' ? 'Pay change approved and included in forecasts' : 'Pay change rejected; forecasts are unchanged')
      const refreshed = await load(false)
      if (!refreshed) {
        toast.error(action === 'approve'
          ? 'Pay change approved, but the income list could not be refreshed. Refresh the page to confirm the forecast.'
          : 'Pay change rejected, but the income list could not be refreshed. Refresh the page to confirm its status.')
      }
    } catch (error) {
      toast.error(requestErrorMessage(error, 'Pay change could not be reviewed. Try again.'))
    }
  }

  const active = sources.filter((s) => s.isActive)
  const totalBase = active.reduce((a, s) => a + s.baseAnnual, 0)
  const totalSuper = active.reduce((a, s) => a + s.superAnnual, 0)
  const totalTax = active.reduce((a, s) => a + s.annualIncomeTax + s.annualMedicare + s.annualHelp, 0)
  const totalNet = active.reduce((a, s) => a + s.annualNet, 0)

  const summaryCards = [
    { label: 'Gross salary (annual)', value: totalBase, icon: Wallet, tone: 'text-primary' },
    { label: 'Superannuation', value: totalSuper, icon: Coins, tone: 'text-chart-2' },
    { label: 'Tax + Medicare + HELP', value: totalTax, icon: Percent, tone: 'text-destructive' },
    { label: 'Estimated take-home', value: totalNet, icon: TrendingUp, tone: 'text-chart-2' },
  ]

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Income &amp; Pay</h1>
            <p className="text-sm text-muted-foreground">Employers, pay cycles and future increases</p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add income
          </Button>
        </div>
      </FadeIn>

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <StaggerItem key={c.label}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  <c.icon className={`h-4 w-4 ${c.tone}`} />
                </div>
                <div className="mt-2 text-xl font-semibold">
                  <SafeNumber value={c.value} currency="AUD" />
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {(optionalDataErrors.employers || optionalDataErrors.accounts) && (
        <div className="space-y-2" role="status" aria-live="polite">
          {optionalDataErrors.employers && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>{optionalDataErrors.employers}</span>
            </div>
          )}
          {optionalDataErrors.accounts && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>{optionalDataErrors.accounts}</span>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No income sources yet. Add your first employer or pay cycle.
          </CardContent>
        </Card>
      ) : (
        <Stagger className="space-y-4">
          {sources.map((s) => {
            const isOpen = expanded[s.id]
            return (
              <StaggerItem key={s.id}>
                <Card className={s.isActive ? '' : 'opacity-60'}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          {s.name}
                          <Badge variant="secondary" className="capitalize">{s.type}</Badge>
                          {!s.isActive && <Badge variant="outline">Inactive</Badge>}
                        </CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {s.employerName && (
                            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{s.employerName}</span>
                          )}
                          <span>
                            <SafeNumber value={s.currentStated} currency="AUD" /> / {s.frequency}
                            {s.frequency === 'hourly' && s.hoursPerWeek ? ` × ${s.hoursPerWeek}h/wk` : ''}
                          </span>
                           {s.annualPackageAmount != null && <span>Package <SafeNumber value={s.annualPackageAmount} currency="AUD" /> / year</span>}
                           {s.payFrequency && <span>{s.payFrequency} from {s.firstPayDate ? new Date(s.firstPayDate).toLocaleDateString('en-AU') : '—'}</span>}
                          <span>{s.isGross ? 'Gross' : 'Net'}</span>
                          <span>Super {s.superRate}%{s.incSuper ? ' (incl.)' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.type === 'salary' && s.isActive && (
                          <Button variant="outline" size="sm" onClick={() => openPayRun(s)}>
                            <Coins className="mr-1.5 h-3.5 w-3.5" /> Record pay
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(s.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <Metric label="Gross (yr)" value={s.baseAnnual} />
                      <Metric label="Super (yr)" value={s.superAnnual} tone="text-chart-2" />
                      <Metric label="Income tax" value={s.annualIncomeTax} tone="text-destructive" />
                      <Metric label="Medicare" value={s.annualMedicare} tone="text-destructive" />
                      <Metric label="HELP" value={s.annualHelp} tone="text-destructive" />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <span className="text-sm font-medium">Estimated take-home (annual)</span>
                      <span className="text-sm font-semibold text-chart-2">
                        <SafeNumber value={s.annualNet} currency="AUD" />
                      </span>
                    </div>

                    <div>
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Pay change proposals & history {s.increases.length > 0 && <Badge variant="secondary">{s.increases.length}</Badge>}
                      </button>
                      {isOpen && (
                        <div className="mt-3 space-y-2">
                          {s.increases.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No pay change proposals.</p>
                          ) : (
                            s.increases.map((inc) => (
                              <div key={inc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {inc.changeType === 'percent'
                                      ? `+${inc.value}%`
                                      : inc.changeType === 'sg_rate'
                                        ? `Super → ${inc.value}%`
                                        : <>+<SafeNumber value={inc.value} currency="AUD" /></>}
                                  </Badge>
                                  <span className="text-muted-foreground">
                                    from <SafeDate date={inc.effectiveDate} options={{ dateStyle: 'medium' }} />
                                  </span>
                                  <Badge variant={inc.status === 'approved' ? 'secondary' : 'outline'} className="capitalize">{inc.status}</Badge>
                                  {inc.notes && <span className="text-xs text-muted-foreground">— {inc.notes}</span>}
                                </div>
                                <div className="flex items-center gap-1">
                                  {inc.status === 'pending' && <>
                                    <Button variant="outline" size="sm" onClick={() => decideIncrease(inc.id, 'approve')}>Approve</Button>
                                    <Button variant="outline" size="sm" onClick={() => decideIncrease(inc.id, 'reject')}>Reject</Button>
                                  </>}
                                  {inc.status === 'pending' && (
                                    <Button variant="ghost" size="icon-sm" onClick={() => removeIncrease(inc.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                          <Button variant="outline" size="sm" onClick={() => openIncrease(s.id)}>
                            <Plus className="mr-2 h-3 w-3" /> Propose pay change
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit income source' : 'Add income source'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main employer salary" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Employer</Label>
                <Select
                  disabled={Boolean(optionalDataErrors.employers)}
                  value={form.employerId || 'none'}
                  onValueChange={(v) => setForm({ ...form, employerId: v === 'none' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                     {editing?.employerId && !orgs.some((o) => o.id === editing.employerId) && (
                       <SelectItem value={editing.employerId}>
                         {editing.employerName ?? 'Current employer (options unavailable)'}
                       </SelectItem>
                     )}
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {optionalDataErrors.employers && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{optionalDataErrors.employers}</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-sm font-medium">Pay schedule</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Annual package (AUD)</Label>
                  <Input type="number" min="0" step="0.01" value={form.annualPackageAmount} onChange={(e) => setForm({ ...form, annualPackageAmount: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Pay frequency</Label>
                  <Select value={form.payFrequency} onValueChange={(v) => setForm({ ...form, payFrequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="fortnightly">Fortnightly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>First pay date</Label><Input type="date" value={form.firstPayDate} onChange={(e) => setForm({ ...form, firstPayDate: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Pay end date (optional)</Label><Input type="date" value={form.payEndDate} onChange={(e) => setForm({ ...form, payEndDate: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between"><Label className="text-sm">Retain detailed pay history</Label><Switch checked={form.retainPayHistory} onCheckedChange={(v) => setForm({ ...form, retainPayHistory: v })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Amount</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="grid gap-2">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.frequency === 'hourly' && (
              <div className="grid gap-2">
                <Label>Hours per week</Label>
                <Input type="number" value={form.hoursPerWeek} onChange={(e) => setForm({ ...form, hoursPerWeek: e.target.value })} placeholder="e.g. 38" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Super rate (%)</Label>
                <Input type="number" value={form.superRate} onChange={(e) => setForm({ ...form, superRate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Pay into account</Label>
                <Select
                  disabled={Boolean(optionalDataErrors.accounts)}
                  value={form.payAccountId || 'none'}
                  onValueChange={(v) => setForm({ ...form, payAccountId: v === 'none' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                     {editing?.payAccountId && !accounts.some((a) => a.id === editing.payAccountId) && (
                       <SelectItem value={editing.payAccountId}>Current pay account (options unavailable)</SelectItem>
                     )}
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {optionalDataErrors.accounts && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{optionalDataErrors.accounts}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>End date</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label className="text-sm">Amount is gross</Label>
                <p className="text-xs text-muted-foreground">Off = net (after-tax) figure</p>
              </div>
              <Switch checked={form.isGross} onCheckedChange={(v) => setForm({ ...form, isGross: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label className="text-sm">Amount includes super</Label>
                <p className="text-xs text-muted-foreground">On = super is inside the stated amount</p>
              </div>
              <Switch checked={form.incSuper} onCheckedChange={(v) => setForm({ ...form, incSuper: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <Label className="text-sm">Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add income'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Increase dialog */}
      <Dialog open={!!incDialogFor} onOpenChange={(o) => !o && setIncDialogFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Propose a pay change</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Effective date</Label>
              <Input type="date" value={incForm.effectiveDate} onChange={(e) => setIncForm({ ...incForm, effectiveDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Change type</Label>
                <Select value={incForm.changeType} onValueChange={(v) => setIncForm({ ...incForm, changeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage rise</SelectItem>
                    <SelectItem value="amount">New base amount</SelectItem>
                    <SelectItem value="sg_rate">Super guarantee rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                {incForm.changeType === 'sg_rate' ? (
                  <>
                    <Label>New super rate (%)</Label>
                    <Input type="number" step="0.5" value={incForm.newSuperRate} onChange={(e) => setIncForm({ ...incForm, newSuperRate: e.target.value })} placeholder="e.g. 12" />
                  </>
                ) : (
                  <>
                    <Label>{incForm.changeType === 'percent' ? 'Percent (%)' : 'New amount'}</Label>
                    <Input type="number" value={incForm.value} onChange={(e) => setIncForm({ ...incForm, value: e.target.value })} />
                  </>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input value={incForm.notes} onChange={(e) => setIncForm({ ...incForm, notes: e.target.value })} placeholder="e.g. EBA increase" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncDialogFor(null)}>Cancel</Button>
            <Button onClick={saveIncrease} loading={incSaving}>Submit for review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay run dialog */}
      <Dialog open={!!payDialogFor} onOpenChange={(o) => !o && setPayDialogFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record a pay run</DialogTitle>
          </DialogHeader>
          {payDialogFor && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Review one <span className="font-medium text-foreground">{payDialogFor.frequency}</span> pay period for{' '}
                <span className="font-medium text-foreground">{payDialogFor.name}</span>: net salary in, PAYG tax, Medicare, HELP and super.
              </p>
               <div className="grid gap-2">
                 <Label>Confirmed gross pay (AUD)</Label>
                 <Input type="number" min="0" step="0.01" value={confirmedGross} onChange={(e) => setConfirmedGross(e.target.value)} />
               </div>
               <div className="grid gap-2">
                <Label>Pay date</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                {periods.length > 0 && <div className="mb-3 space-y-1"><p className="text-xs font-medium text-muted-foreground">Recent pay periods</p>{periods.slice(0, 6).map((p: any) => <button type="button" key={p.id} onClick={() => hydratePeriod(p)} className={`block w-full rounded px-2 py-1 text-left text-xs ${selectedPeriod?.id === p.id ? 'bg-primary/15' : 'hover:bg-muted'}`}>{new Date(p.startDate).toLocaleDateString('en-AU')} – {new Date(p.endDate).toLocaleDateString('en-AU')} · <SafeNumber value={p.confirmedGross ?? p.expectedGross} currency="AUD" /> · {p.status}</button>)}</div>}
                 {selectedPeriod && <p className="mb-2 font-medium">{new Date(selectedPeriod.startDate).toLocaleDateString('en-AU')} – {new Date(selectedPeriod.endDate).toLocaleDateString('en-AU')} · Expected <SafeNumber value={selectedPeriod.expectedGross} currency="AUD" /> · {selectedPeriod.status === 'confirmed' ? <>Confirmed <SafeNumber value={selectedPeriod.confirmedGross} currency="AUD" /> (difference <SafeNumber value={selectedPeriod.reconciliationDifference} currency="AUD" />)</> : 'Awaiting confirmation'}</p>}
                 {selectedPeriod?.status === 'confirmed' && <div className="mb-2 space-y-1 text-xs text-muted-foreground"><p>Work: {selectedPeriod.workEvidence?.hours ?? 0} hours, {selectedPeriod.workEvidence?.leaveHours ?? 0} leave hours, {selectedPeriod.workEvidence?.location ?? 'location not recorded'}.</p><p>Linked transactions: {selectedPeriod.transactions?.length ?? 0}</p></div>}
                <PayPreviewRow label="Net into account" value={perCycle(payDialogFor, 'net')} tone="text-chart-2" />
                <PayPreviewRow label="PAYG income tax" value={-perCycle(payDialogFor, 'tax')} tone="text-destructive" />
                <PayPreviewRow label="Medicare levy" value={-perCycle(payDialogFor, 'medicare')} tone="text-destructive" />
                <PayPreviewRow label="HELP repayment" value={-perCycle(payDialogFor, 'help')} tone="text-destructive" />
                <PayPreviewRow label="Super contribution" value={perCycle(payDialogFor, 'super')} tone="text-chart-2" />
                 <div className="mt-2 grid gap-1"><Label>Salary packaging reimbursement (AUD)</Label><Input type="number" min="0" step="0.01" value={reimbursementAmount} onChange={(e) => setReimbursementAmount(e.target.value)} /></div>
              </div>
               <div className="grid gap-2">
                 <Label>Work evidence</Label>
                 <Select value={workForm.evidenceType} onValueChange={(v) => setWorkForm({ ...workForm, evidenceType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="regular_pattern">Regular pattern</SelectItem><SelectItem value="casual_roster">Casual roster</SelectItem></SelectContent></Select>
                 <div className="grid grid-cols-2 gap-2"><Input type="number" placeholder="Hours" value={workForm.hours} onChange={(e) => setWorkForm({ ...workForm, hours: e.target.value })} /><Input type="number" placeholder="Leave hours" value={workForm.leaveHours} onChange={(e) => setWorkForm({ ...workForm, leaveHours: e.target.value })} /></div>
                  <Input placeholder="Leave type (optional)" value={workForm.leaveType} onChange={(e) => setWorkForm({ ...workForm, leaveType: e.target.value })} />
                  <Select value={workForm.location} onValueChange={(v) => setWorkForm({ ...workForm, location: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="workplace">Workplace</SelectItem><SelectItem value="home">Work from home</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent></Select>
                  <Input placeholder="Pattern or roster notes (optional)" value={workForm.notes} onChange={(e) => setWorkForm({ ...workForm, notes: e.target.value })} />
               </div>
               <div className="grid gap-2">
                 <Label>Link received transactions</Label>
                 <div className="max-h-24 overflow-auto rounded border p-2 text-xs">{candidateTransactions.length === 0 ? 'No candidates found' : candidateTransactions.map((t) => <label key={t.id} className="flex gap-2"><input type="checkbox" checked={selectedTransactions.includes(t.id)} onChange={(e) => setSelectedTransactions(e.target.checked ? [...selectedTransactions, t.id] : selectedTransactions.filter((id) => id !== t.id))} />{new Date(t.date).toLocaleDateString('en-AU')} · <SafeNumber value={t.amount} currency="AUD" /> · {t.description || t.merchant || 'Transaction'}</label>)}</div>
               </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogFor(null)}>Cancel</Button>
            <Button onClick={selectedPeriod?.status === 'confirmed' ? undefined : selectedPeriod ? confirmPeriod : generatePay} loading={paySaving}>{selectedPeriod?.status === 'confirmed' ? 'Confirmed' : selectedPeriod ? 'Confirm pay period' : 'Prepare pay period'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const CYCLES_PER_YEAR: Record<string, number> = {
  weekly: 52, fortnightly: 26, monthly: 12, annually: 1, hourly: 52,
}

function perCycle(s: IncomeSource, kind: 'gross' | 'net' | 'tax' | 'medicare' | 'help' | 'super') {
  const n = CYCLES_PER_YEAR[s.frequency] ?? 26
  const annual =
    kind === 'gross' ? s.baseAnnual
      : kind === 'net' ? s.annualNet
      : kind === 'tax' ? s.annualIncomeTax
        : kind === 'medicare' ? s.annualMedicare
          : kind === 'help' ? s.annualHelp
            : s.superAnnual
  return annual / n
}

function PayPreviewRow({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${tone ?? ''}`}><SafeNumber value={value} currency="AUD" /></span>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${tone ?? ''}`}>
        <SafeNumber value={value} currency="AUD" />
      </div>
    </div>
  )
}
