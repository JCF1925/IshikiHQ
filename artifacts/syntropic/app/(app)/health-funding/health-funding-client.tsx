'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, ShieldPlus, Plus, Trash2, ShieldCheck, HeartPulse, Upload, FileCheck2, XCircle, History } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate, SafeNumber } from '@/components/safe-format'
import { HealthDisclaimer } from '@/components/health-disclaimer'
import { healthImportAuditFieldLabels } from '@/lib/health-claim-audit'
import { MEDICARE_REVIEW_FIELDS, PRIVATE_HEALTH_REVIEW_FIELDS } from '@/lib/health-claim-review-fields'

type Claim = {
  id: string; serviceDate: string; description: string; itemNumber: string | null; provider: string | null
  feeCharged: number | null; benefitPaid: number | null; outOfPocket: number | null; isForecast: boolean; countsToSafetyNet: boolean
  appointmentId: string | null
  appointment: { id: string; title: string; startTime: string; practitioner: { id: string; name: string; referralRequired: boolean } | null } | null
  linkedPractitioner: { id: string; name: string; referralRequired: boolean } | null
  linkedServiceDate: string | null
  referralStatus?: string; referralStatusMessage?: string | null; referralRequired?: boolean
}
type Progress = {
  year: number; gapTotal: number; outOfPocketTotal: number; omsnThreshold: number; emsnThreshold: number
  omsnMet: boolean; emsnMet: boolean; omsnRemaining: number; emsnRemaining: number; omsnPct: number; emsnPct: number
}
type Appointment = { id: string; title: string; startTime: string; status: string; practitioner: { id: string; name: string; referralRequired: boolean } | null; referral: { id: string } | null }
type ClaimsResp = { claims: Claim[]; appointments: Appointment[]; year: number; progress: Progress; progressWithForecast: Progress; forecastOop: number }

type Limit = { id: string; category: string; annualLimit: number | null; usedAmount: number; notes: string | null }
type PhiTxn = { id: string; policyId: string; date: string; type: string; amount: number; description: string | null }
type Policy = {
  id: string; policyName: string; policyNumber: string | null; coverType: string; premium: number | null
  premiumFrequency: string | null; excess: number | null; startDate: string | null; endDate: string | null; isActive: boolean; notes: string | null
  insurer: { id: string; name: string } | null; limits: Limit[]
  transactions: PhiTxn[]; claims: PhiClaim[]; premiumsPaid: number; offsets: number; effectiveCost: number
}
type PhiClaim = { id: string; claimNumber: string | null; serviceDate: string; provider: string | null; serviceType: string | null; description: string; chargedAmount: number | null; benefitAmount: number | null; outOfPocket: number | null }
type ImportKind = 'medicare' | 'private_health'
type ImportRow = { id: string; rowNumber: number; data: Record<string, any>; errors: string[]; status: string }
type HealthImportAuditEvent = {
  id: string
  action: string
  rowNumber: number | null
  previousStatus: string | null
  nextStatus: string | null
  changedFields: string[] | null
  actorUserId: string
  actor: { name: string | null }
  createdAt: string
}
type HealthImport = {
  id: string; kind: ImportKind; fileName?: string; contentType?: string; byteSize?: number; sha256?: string; status: string
  detectedFields?: string[]; parseErrors?: string[]; rows?: ImportRow[]; auditEvents?: HealthImportAuditEvent[]
  confirmedAt?: string | null; canceledAt?: string | null; deletedAt?: string | null
  createdAt?: string; updatedAt?: string; removalReason?: 'source_removed' | 'review_canceled'
}
type HealthImportSummary = Omit<HealthImport, 'rows'> & { _count?: { rows: number }; createdAt?: string; deletedAt?: string | null }
function rejectedImportRecoveryAdvice(parseErrors: string[] | undefined): string {
  const diagnosis = (parseErrors ?? []).join(' ')
  if (/encrypted|restricts text extraction|protected/i.test(diagnosis)) {
    return 'Download an unprotected, machine-readable statement, upload a CSV instead, or close this window and use Add claim to enter each claim manually.'
  }
  if (/scanned|image-only|no supported claim table|could not be read clearly/i.test(diagnosis)) {
    return 'Ask your insurer for a machine-readable PDF or an export with selectable text. You can also upload a CSV or close this window and use Add claim to enter each claim manually.'
  }
  if (/malformed|incomplete|not a valid PDF/i.test(diagnosis)) {
    return 'Download the statement again and confirm it opens normally before retrying. If it still fails, upload a CSV or close this window and use Add claim to enter each claim manually.'
  }
  return 'Check the file and try again with a supported PDF or CSV. You can also close this window and use Add claim to enter each claim manually.'
}
const PHI_TXN_TYPES = [
  { value: 'premium', label: 'Premium paid' },
  { value: 'benefit', label: 'Benefit received' },
  { value: 'cashback', label: 'Cashback' },
  { value: 'discount', label: 'Discount' },
]
const phiTxnLabel = (t: string) => PHI_TXN_TYPES.find((x) => x.value === t)?.label ?? t
const healthImportAuditLabel = (action: string) => ({
  source_uploaded: 'Source uploaded',
  import_rejected: 'Import rejected',
  row_edited: 'Row edited',
  row_excluded: 'Row excluded',
  row_included: 'Row included',
  import_confirmed: 'Import confirmed',
  review_canceled: 'Review canceled',
  source_removed: 'Source removed',
}[action] ?? 'Review activity')
const healthImportAuditDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const healthImportRemovalDate = (value: string | null | undefined) => value
  ? healthImportAuditDate(value)
  : 'an unknown date'
type Org = { id: string; name: string }

const nowYear = () => new Date().getUTCFullYear()
const todayStr = () => new Date().toISOString().slice(0, 10)

const emptyClaim = { serviceDate: '', description: '', itemNumber: '', provider: '', feeCharged: '', benefitPaid: '', outOfPocket: '', appointmentId: '', isForecast: false, countsToSafetyNet: true }
const emptyLimit = () => ({ category: '', annualLimit: '', usedAmount: '', notes: '' })
const emptyPolicy = { insurerId: 'none', policyName: '', policyNumber: '', coverType: 'combined', premium: '', premiumFrequency: 'monthly', excess: '', startDate: '', notes: '' }
const emptyPhiTxn = () => ({ type: 'benefit', amount: '', date: new Date().toISOString().slice(0, 10), description: '' })

function Bar({ pct, met }: { pct: number; met: boolean }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all ${met ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

function LoadFailure({ message, loading, onRetry }: { message: string; loading: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span>{message}</span>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} loading={loading}>Try again</Button>
    </div>
  )
}

export function HealthFundingClient() {
  const [claimsLoading, setClaimsLoading] = useState(true)
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [healthImportsLoading, setHealthImportsLoading] = useState(true)
  const [claimsLoadError, setClaimsLoadError] = useState(false)
  const [policiesLoadError, setPoliciesLoadError] = useState(false)
  const [healthImportsLoadError, setHealthImportsLoadError] = useState(false)
  const [year, setYear] = useState(nowYear())
  const [concession, setConcession] = useState(false)
  const [showForecast, setShowForecast] = useState(true)
  const [data, setData] = useState<ClaimsResp | null>(null)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [healthImports, setHealthImports] = useState<HealthImportSummary[]>([])

  const [claimOpen, setClaimOpen] = useState(false)
  const [claimForm, setClaimForm] = useState(emptyClaim)
  const [savingClaim, setSavingClaim] = useState(false)

  const [policyOpen, setPolicyOpen] = useState(false)
  const [policyForm, setPolicyForm] = useState(emptyPolicy)
  const [policyLimits, setPolicyLimits] = useState<ReturnType<typeof emptyLimit>[]>([])
  const [savingPolicy, setSavingPolicy] = useState(false)

  const [phiTxnOpen, setPhiTxnOpen] = useState(false)
  const [phiTxnPolicyId, setPhiTxnPolicyId] = useState<string | null>(null)
  const [phiTxnForm, setPhiTxnForm] = useState(emptyPhiTxn())
  const [savingPhiTxn, setSavingPhiTxn] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importKind, setImportKind] = useState<ImportKind>('medicare')
  const [healthImport, setHealthImport] = useState<HealthImport | null>(null)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importPolicyId, setImportPolicyId] = useState('none')
  const [importBusy, setImportBusy] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  const fetchClaims = useCallback(async () => {
    setClaimsLoading(true)
    setClaimsLoadError(false)
    setData(null)
    try {
      const res = await fetch(`/api/medicare-claims?year=${year}&concession=${concession}`)
      if (!res.ok) throw new Error('Medicare claims request failed')
      setData(await res.json())
    } catch {
      setClaimsLoadError(true)
    } finally {
      setClaimsLoading(false)
    }
  }, [year, concession])

  const fetchPolicies = useCallback(async () => {
    setPoliciesLoading(true)
    setPoliciesLoadError(false)
    setPolicies([])
    try {
      const res = await fetch('/api/phi-policies')
      if (!res.ok) throw new Error('Private health policies request failed')
      setPolicies(await res.json())
    } catch {
      setPoliciesLoadError(true)
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  const fetchOrgs = useCallback(async () => {
    const res = await fetch('/api/organisations')
    if (res.ok) setOrgs(await res.json())
  }, [])

  const fetchHealthImports = useCallback(async () => {
    setHealthImportsLoading(true)
    setHealthImportsLoadError(false)
    setHealthImports([])
    try {
      const res = await fetch('/api/health-claims/import')
      if (!res.ok) throw new Error('Claim import history request failed')
      setHealthImports(await res.json())
    } catch {
      setHealthImportsLoadError(true)
    } finally {
      setHealthImportsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchClaims()
    void fetchPolicies()
    void fetchOrgs()
    void fetchHealthImports()
  }, [fetchClaims, fetchPolicies, fetchOrgs, fetchHealthImports])

  const openAddClaim = () => { setClaimForm({ ...emptyClaim, serviceDate: todayStr() }); setClaimOpen(true) }
  const openAddPolicy = () => { setPolicyForm({ ...emptyPolicy, startDate: todayStr() }); setPolicyLimits([emptyLimit()]); setPolicyOpen(true) }

  const saveClaim = async () => {
    if (!claimForm.description.trim()) { toast.error('Description required'); return }
    setSavingClaim(true)
    const res = await fetch('/api/medicare-claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(claimForm) })
    setSavingClaim(false)
    if (res.ok) { toast.success('Claim added'); setClaimOpen(false); fetchClaims() } else toast.error(await importError(res))
  }

  const deleteClaim = async (id: string) => {
    const res = await fetch(`/api/medicare-claims/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchClaims() } else toast.error('Failed')
  }

  const savePolicy = async () => {
    if (!policyForm.policyName.trim()) { toast.error('Policy name required'); return }
    setSavingPolicy(true)
    const body = { ...policyForm, insurerId: policyForm.insurerId === 'none' ? null : policyForm.insurerId, limits: policyLimits.filter((l) => l.category.trim()) }
    const res = await fetch('/api/phi-policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSavingPolicy(false)
    if (res.ok) { toast.success('Policy added'); setPolicyOpen(false); fetchPolicies() } else toast.error('Failed to save')
  }

  const deletePolicy = async (id: string) => {
    const res = await fetch(`/api/phi-policies/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchPolicies() } else toast.error('Failed')
  }

  const openPhiTxn = (policyId: string) => { setPhiTxnPolicyId(policyId); setPhiTxnForm(emptyPhiTxn()); setPhiTxnOpen(true) }
  const savePhiTxn = async () => {
    if (!phiTxnPolicyId) return
    if (!phiTxnForm.amount || isNaN(parseFloat(phiTxnForm.amount))) { toast.error('Enter an amount'); return }
    setSavingPhiTxn(true)
    const res = await fetch('/api/phi-transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...phiTxnForm, policyId: phiTxnPolicyId }) })
    setSavingPhiTxn(false)
    if (res.ok) { toast.success('Recorded'); setPhiTxnOpen(false); fetchPolicies() } else toast.error('Failed to save')
  }
  const deletePhiTxn = async (id: string) => {
    const res = await fetch(`/api/phi-transactions/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); fetchPolicies() } else toast.error('Failed')
  }

  const setLimitUsed = async (policyId: string, limitId: string, usedAmount: number) => {
    const res = await fetch(`/api/phi-policies/${policyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setLimitUsed', limitId, usedAmount }) })
    if (res.ok) fetchPolicies(); else toast.error('Failed')
  }

  const openHealthImport = (kind: ImportKind) => {
    setImportKind(kind)
    setHealthImport(null)
    setImportRows([])
    setImportPolicyId('none')
    setImportMessage('')
    setImportOpen(true)
  }

  const openExistingImport = async (id: string) => {
    const res = await fetch(`/api/health-claims/import/${id}`)
    if (!res.ok) return
    const record = await res.json() as HealthImport
    setImportKind(record.kind)
    setHealthImport(record)
    setImportRows(record.rows ?? [])
    setImportPolicyId('none')
    setImportMessage(record.deletedAt
      ? ''
      : record.status === 'review'
        ? 'Review each row before confirming.'
        : 'This import has already been confirmed.')
    setImportOpen(true)
  }

  const removeImportSource = async (id: string) => {
    if (!window.confirm('Remove the private source file and review data? Confirmed claims will be retained.')) return
    const res = await fetch(`/api/health-claims/import/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Source file removed')
      await fetchHealthImports()
    } else toast.error(await importError(res))
  }

  const importError = async (res: Response) => {
    try {
      const body = await res.json()
      return body?.error?.message ?? 'Import failed'
    } catch {
      return 'Import failed'
    }
  }

  const uploadHealthClaims = async (file: File) => {
    setImportBusy(true)
    setImportMessage('Uploading and parsing privately…')
    const form = new FormData()
    form.append('kind', importKind)
    form.append('file', file)
    const res = await fetch('/api/health-claims/import', { method: 'POST', body: form })
    if (!res.ok) {
      setImportMessage(await importError(res))
      setImportBusy(false)
      return
    }
    const record = await res.json() as HealthImport
    setHealthImport(record)
    setImportRows(record.rows ?? [])
    setImportMessage(record.status === 'rejected' ? (record.parseErrors?.[0] ?? 'The file could not be parsed') : 'Review each row before confirming.')
    setImportBusy(false)
  }

  const updateImportRow = (id: string, field: string, value: string) => {
    setImportRows((rows) => rows.map((row) => row.id === id ? { ...row, data: { ...row.data, [field]: value === 'none' ? null : value } } : row))
  }

  const saveImportRows = async () => {
    if (!healthImport) return
    setImportBusy(true)
    const res = await fetch(`/api/health-claims/import/${healthImport.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', rows: importRows.map((row) => ({ id: row.id, data: row.data, status: row.status, excluded: row.status === 'excluded' })) }),
    })
    if (res.ok) {
      const record = await res.json() as HealthImport
      setHealthImport(record)
      setImportRows(record.rows ?? [])
      setImportMessage('Changes saved. Correct or exclude any invalid rows before confirming.')
    } else setImportMessage(await importError(res))
    setImportBusy(false)
  }

  const confirmHealthImport = async () => {
    if (!healthImport) return
    if (healthImport.kind === 'private_health' && importPolicyId === 'none') {
      setImportMessage('Choose the existing policy that this statement belongs to.')
      return
    }
    setImportBusy(true)
    const saveRes = await fetch(`/api/health-claims/import/${healthImport.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', rows: importRows.map((row) => ({ id: row.id, data: row.data, status: row.status, excluded: row.status === 'excluded' })) }),
    })
    if (!saveRes.ok) {
      if (saveRes.status === 409 || saveRes.status === 423) {
        const refreshRes = await fetch(`/api/health-claims/import/${healthImport.id}`)
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json() as HealthImport
          setHealthImport(refreshed)
          setImportRows(refreshed.rows ?? [])
          if (refreshed.status === 'confirmed') {
            toast.success('This import was already confirmed in another tab')
            setImportOpen(false)
            setHealthImport(null)
            setImportBusy(false)
            await Promise.all([fetchClaims(), fetchPolicies(), fetchHealthImports()])
            return
          }
        }
        setImportMessage('This review changed in another tab. Reload the import from claim history before confirming again.')
        setImportBusy(false)
        return
      }
      setImportMessage(await importError(saveRes))
      setImportBusy(false)
      return
    }
    const saved = await saveRes.json() as HealthImport
    setHealthImport(saved)
    setImportRows(saved.rows ?? [])
    const res = await fetch(`/api/health-claims/import/${healthImport.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', policyId: importPolicyId === 'none' ? undefined : importPolicyId }),
    })
    if (!res.ok) {
      if (res.status === 409 || res.status === 423) {
        setImportMessage('This review changed in another tab. Reload the import from claim history before confirming again.')
        setImportBusy(false)
        return
      }
      setImportMessage(await importError(res))
      setImportBusy(false)
      return
    }
    toast.success(`${healthImport.kind === 'medicare' ? 'Medicare' : 'Private health'} claims imported`)
    setImportOpen(false)
    setHealthImport(null)
    setImportBusy(false)
    await Promise.all([fetchClaims(), fetchPolicies()])
    await fetchHealthImports()
  }

  const cancelHealthImport = async () => {
    if (!healthImport) { setImportOpen(false); return }
    setImportBusy(true)
    await fetch(`/api/health-claims/import/${healthImport.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    setImportBusy(false)
    setImportOpen(false)
    setHealthImport(null)
    await fetchHealthImports()
  }

  const discardRejectedImport = async () => {
    if (!healthImport || healthImport.status !== 'rejected') return
    setImportBusy(true)
    const res = await fetch(`/api/health-claims/import/${healthImport.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setImportMessage(await importError(res))
      setImportBusy(false)
      return
    }
    setHealthImport(null)
    setImportRows([])
    setImportMessage('')
    setImportBusy(false)
    toast.success('Failed source discarded. Choose another file to retry.')
    await fetchHealthImports()
  }

  const prog = data ? (showForecast ? data.progressWithForecast : data.progress) : null
  const years = Array.from({ length: 6 }, (_, i) => nowYear() - i)

  return (
    <FadeIn className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldPlus className="h-6 w-6 text-primary" /> Health Funding
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/health-funding/summary"><FileCheck2 className="h-4 w-4" /> View summary report</Link>
        </Button>
      </div>
      <HealthDisclaimer />
      {healthImportsLoadError ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Claim import history</CardTitle></CardHeader>
          <CardContent>
            <LoadFailure
              message="Claim import history could not be loaded. Your saved imports may still exist; try again."
              loading={healthImportsLoading}
              onRetry={() => void fetchHealthImports()}
            />
          </CardContent>
        </Card>
      ) : healthImports.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Claim import history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Original statements and review previews are private. Removing a source keeps confirmed claims but deletes the uploaded file and review rows.</p>
            {healthImports.slice(0, 8).map((source) => (
              <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2 text-sm">
                <button type="button" className="min-w-0 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void openExistingImport(source.id)}>
                  {source.deletedAt ? (
                    <>
                      <span className="font-medium">{source.kind === 'medicare' ? 'Medicare' : 'Private health'} source removed</span>
                      <span className="block text-xs text-muted-foreground">Removed {healthImportRemovalDate(source.deletedAt)} · no longer included in reports</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{source.kind === 'medicare' ? 'Medicare' : 'Private health'} · {source.fileName}</span>
                      <span className="block text-xs text-muted-foreground">{source._count?.rows ?? 0} rows · {source.status}</span>
                    </>
                  )}
                </button>
                {!source.deletedAt && <Button size="sm" variant="ghost" onClick={() => void removeImportSource(source.id)}>Remove source</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="medicare">
        <TabsList>
          <TabsTrigger value="medicare">Medicare Safety Net</TabsTrigger>
          <TabsTrigger value="phi">Private Health</TabsTrigger>
        </TabsList>

        {/* MEDICARE */}
        <TabsContent value="medicare" className="space-y-5 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="conc" checked={concession} onCheckedChange={setConcession} />
              <Label htmlFor="conc" className="text-sm">Concession / FTB-A</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fc" checked={showForecast} onCheckedChange={setShowForecast} />
              <Label htmlFor="fc" className="text-sm">Include forecast</Label>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openHealthImport('medicare')}><Upload className="h-4 w-4 mr-1" /> Import Medicare</Button>
              <Button size="sm" onClick={openAddClaim}><Plus className="h-4 w-4 mr-1" /> Add claim</Button>
            </div>
          </div>

          {claimsLoading ? <Skeleton className="h-40 w-full" /> : claimsLoadError ? (
            <LoadFailure
              message="Medicare claims could not be loaded. Your claim history is not known to be empty; try again."
              loading={claimsLoading}
              onRetry={() => void fetchClaims()}
            />
          ) : !prog ? <Skeleton className="h-40 w-full" /> : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Original Safety Net (OMSN)</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gap counted</span><span className="font-semibold"><SafeNumber value={prog.gapTotal} currency="AUD" /></span></div>
                  <Bar pct={prog.omsnPct} met={prog.omsnMet} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Threshold <SafeNumber value={prog.omsnThreshold} currency="AUD" /></span>
                    {prog.omsnMet ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Reached</Badge> : <span><SafeNumber value={prog.omsnRemaining} currency="AUD" /> to go</span>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Extended Safety Net (EMSN)</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Out-of-pocket counted</span><span className="font-semibold"><SafeNumber value={prog.outOfPocketTotal} currency="AUD" /></span></div>
                  <Bar pct={prog.emsnPct} met={prog.emsnMet} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Threshold <SafeNumber value={prog.emsnThreshold} currency="AUD" /></span>
                    {prog.emsnMet ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Reached</Badge> : <span><SafeNumber value={prog.emsnRemaining} currency="AUD" /> to go</span>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Thresholds are indicative Medicare Safety Net figures and may change annually — verify current amounts with Services Australia.</p>

          {claimsLoading ? <Skeleton className="h-24 w-full" /> : claimsLoadError ? null : (
            <Stagger className="space-y-2">
              {(data?.claims ?? []).length === 0 && <p className="text-sm text-muted-foreground">No claims recorded for {year}.</p>}
              {(data?.claims ?? []).map((c) => (
                <StaggerItem key={c.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{c.description}</span>
                          {c.isForecast && <Badge variant="outline" className="text-amber-400 border-amber-500/30">Forecast</Badge>}
                          {c.itemNumber && <Badge variant="outline">Item {c.itemNumber}</Badge>}
                          {c.referralRequired && c.referralStatus && c.referralStatus !== 'valid' && c.referralStatus !== 'not_required' && (
                            <Badge variant="outline" className="text-amber-400 border-amber-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Referral not confirmed</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                           <SafeDate date={c.serviceDate} options={{ dateStyle: 'medium' }} />{c.appointment
                             ? ` · Appointment: ${c.appointment.title} (${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(c.appointment.startTime))})${c.linkedPractitioner ? ` · ${c.linkedPractitioner.name}` : ''}`
                             : c.provider ? ` · ${c.provider}` : ''}
                        </div>
                         {c.referralRequired && c.referralStatusMessage && c.referralStatus !== 'valid' && (
                           <p className="text-xs text-amber-400 mt-1">{c.referralStatusMessage} Imported claim amounts are kept as recorded.</p>
                         )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right text-sm">
                          <div className="font-semibold">Gap <SafeNumber value={(c.feeCharged || 0) - (c.benefitPaid || 0)} currency="AUD" /></div>
                          <div className="text-xs text-muted-foreground">OOP <SafeNumber value={c.outOfPocket || 0} currency="AUD" /></div>
                        </div>
                        <Button size="icon-sm" variant="ghost" onClick={() => deleteClaim(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>

        {/* PHI */}
        <TabsContent value="phi" className="space-y-4 pt-4">
           <div className="flex justify-end gap-2">
             <Button size="sm" variant="outline" onClick={() => openHealthImport('private_health')}><Upload className="h-4 w-4 mr-1" /> Import private claims</Button>
             <Button size="sm" onClick={openAddPolicy}><Plus className="h-4 w-4 mr-1" /> Add policy</Button>
           </div>
          {policiesLoading ? <Skeleton className="h-40 w-full" /> : policiesLoadError ? (
            <LoadFailure
              message="Private-health policies could not be loaded. Your policy history is not known to be empty; try again."
              loading={policiesLoading}
              onRetry={() => void fetchPolicies()}
            />
          ) : policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No private health policies recorded.</p>
          ) : (
            <Stagger className="grid gap-4 md:grid-cols-2">
              {policies.map((p) => (
                <StaggerItem key={p.id}>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" /> {p.policyName}</CardTitle>
                          <div className="text-xs text-muted-foreground mt-1">{p.insurer?.name ?? 'Insurer not set'} · {p.coverType}{p.policyNumber ? ` · ${p.policyNumber}` : ''}</div>
                        </div>
                        <Button size="icon-sm" variant="ghost" onClick={() => deletePolicy(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-4 text-sm">
                        {p.premium != null && <span className="text-muted-foreground">Premium <span className="text-foreground font-medium"><SafeNumber value={p.premium} currency="AUD" /></span>{p.premiumFrequency ? `/${p.premiumFrequency}` : ''}</span>}
                        {p.excess != null && <span className="text-muted-foreground">Excess <span className="text-foreground font-medium"><SafeNumber value={p.excess} currency="AUD" /></span></span>}
                      </div>
                      <div className="rounded-md border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Effective cost</span>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => openPhiTxn(p.id)}><Plus className="h-3 w-3 mr-1" /> Log</Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div><div className="text-[11px] text-muted-foreground">Premiums</div><div className="text-sm font-semibold"><SafeNumber value={p.premiumsPaid} currency="AUD" /></div></div>
                          <div><div className="text-[11px] text-muted-foreground">Benefits/back</div><div className="text-sm font-semibold text-emerald-400"><SafeNumber value={p.offsets} currency="AUD" /></div></div>
                          <div><div className="text-[11px] text-muted-foreground">Net cost</div><div className={`text-sm font-semibold ${p.effectiveCost <= 0 ? 'text-emerald-400' : 'text-foreground'}`}><SafeNumber value={p.effectiveCost} currency="AUD" /></div></div>
                        </div>
                        {p.transactions.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-border/50">
                            {p.transactions.slice(0, 6).map((t) => (
                              <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                                <span className="text-muted-foreground truncate"><SafeDate date={t.date} options={{ dateStyle: 'medium' }} /> · {phiTxnLabel(t.type)}{t.description ? ` — ${t.description}` : ''}</span>
                                <span className="flex items-center gap-1 shrink-0"><span className={t.type === 'premium' ? '' : 'text-emerald-400'}>{t.type === 'premium' ? '' : '−'}<SafeNumber value={t.amount} currency="AUD" /></span><button onClick={() => deletePhiTxn(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button></span>
                              </div>
                            ))}
                          </div>
                        )}
                       {p.claims?.length > 0 && (
                         <div className="space-y-1 pt-1 border-t border-border/50">
                           <div className="text-xs font-medium text-muted-foreground">Imported claims</div>
                           {p.claims.slice(0, 5).map((claim) => (
                             <div key={claim.id} className="flex items-center justify-between text-xs gap-2">
                               <span className="text-muted-foreground truncate"><SafeDate date={claim.serviceDate} options={{ dateStyle: 'medium' }} /> · {claim.description}{claim.provider ? ` · ${claim.provider}` : ''}</span>
                               <span className="shrink-0 text-emerald-400"><SafeNumber value={claim.benefitAmount ?? 0} currency="AUD" /></span>
                             </div>
                           ))}
                         </div>
                       )}
                      </div>
                      {p.limits.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {p.limits.map((l) => {
                            const pct = l.annualLimit ? Math.min(100, (l.usedAmount / l.annualLimit) * 100) : 0
                            return (
                              <div key={l.id} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="capitalize">{l.category}</span>
                                  <span className="text-muted-foreground"><SafeNumber value={l.usedAmount} currency="AUD" />{l.annualLimit != null ? <> / <SafeNumber value={l.annualLimit} currency="AUD" /></> : ''}</span>
                                </div>
                                {l.annualLimit != null && <Bar pct={pct} met={pct >= 100} />}
                                <div className="flex justify-end">
                                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => {
                                    const v = prompt(`Update used amount for ${l.category}`, String(l.usedAmount))
                                    if (v != null && !isNaN(parseFloat(v))) setLimitUsed(p.id, l.id, parseFloat(v))
                                  }}>Update usage</Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>
      </Tabs>

      {/* Add claim dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent aria-describedby="medicare-claim-dialog-description" className="max-w-lg">
          <DialogHeader><DialogTitle>Add Medicare claim</DialogTitle></DialogHeader>
          <p id="medicare-claim-dialog-description" className="sr-only">Record a Medicare claim and its payment details.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Description</Label><Input value={claimForm.description} onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })} placeholder="GP consultation" /></div>
            <div><Label>Service date</Label><Input type="date" value={claimForm.serviceDate} onChange={(e) => setClaimForm({ ...claimForm, serviceDate: e.target.value })} /></div>
            <div><Label>Item number</Label><Input value={claimForm.itemNumber} onChange={(e) => setClaimForm({ ...claimForm, itemNumber: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Provider</Label><Input value={claimForm.provider} onChange={(e) => setClaimForm({ ...claimForm, provider: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Label>Linked appointment (optional)</Label>
              <Select value={claimForm.appointmentId || 'none'} onValueChange={(value) => setClaimForm({ ...claimForm, appointmentId: value === 'none' ? '' : value })}>
                <SelectTrigger><SelectValue placeholder="Choose an appointment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked appointment</SelectItem>
                  {(data?.appointments ?? []).map((appointment) => (
                    <SelectItem key={appointment.id} value={appointment.id}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(appointment.startTime))} · {appointment.title}{appointment.practitioner ? ` · ${appointment.practitioner.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Links this claim to the exact care record for referral checks. Imported amounts stay unchanged.</p>
            </div>
            <div><Label>Fee charged</Label><Input type="number" step="0.01" value={claimForm.feeCharged} onChange={(e) => setClaimForm({ ...claimForm, feeCharged: e.target.value })} /></div>
            <div><Label>Benefit paid</Label><Input type="number" step="0.01" value={claimForm.benefitPaid} onChange={(e) => setClaimForm({ ...claimForm, benefitPaid: e.target.value })} /></div>
            <div><Label>Out-of-pocket</Label><Input type="number" step="0.01" value={claimForm.outOfPocket} onChange={(e) => setClaimForm({ ...claimForm, outOfPocket: e.target.value })} placeholder="auto if blank" /></div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="cf" checked={claimForm.isForecast} onCheckedChange={(v) => setClaimForm({ ...claimForm, isForecast: v })} />
              <Label htmlFor="cf" className="text-sm">Forecast / planned</Label>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setClaimOpen(false)}>Cancel</Button><Button loading={savingClaim} onClick={saveClaim}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add policy dialog */}
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent aria-describedby="private-policy-dialog-description" className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add private health policy</DialogTitle></DialogHeader>
          <p id="private-policy-dialog-description" className="sr-only">Add a private health policy and its cover details.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Policy name</Label><Input value={policyForm.policyName} onChange={(e) => setPolicyForm({ ...policyForm, policyName: e.target.value })} placeholder="Gold Hospital + Extras" /></div>
            <div><Label>Insurer</Label>
              <Select value={policyForm.insurerId} onValueChange={(v) => setPolicyForm({ ...policyForm, insurerId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Not set</SelectItem>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Policy number</Label><Input value={policyForm.policyNumber} onChange={(e) => setPolicyForm({ ...policyForm, policyNumber: e.target.value })} /></div>
            <div><Label>Cover type</Label>
              <Select value={policyForm.coverType} onValueChange={(v) => setPolicyForm({ ...policyForm, coverType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="extras">Extras</SelectItem>
                  <SelectItem value="combined">Combined</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Premium</Label><Input type="number" step="0.01" value={policyForm.premium} onChange={(e) => setPolicyForm({ ...policyForm, premium: e.target.value })} /></div>
            <div><Label>Frequency</Label>
              <Select value={policyForm.premiumFrequency} onValueChange={(v) => setPolicyForm({ ...policyForm, premiumFrequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Excess</Label><Input type="number" step="0.01" value={policyForm.excess} onChange={(e) => setPolicyForm({ ...policyForm, excess: e.target.value })} /></div>
            <div><Label>Start date</Label><Input type="date" value={policyForm.startDate} onChange={(e) => setPolicyForm({ ...policyForm, startDate: e.target.value })} /></div>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label>Extras limits</Label>
              <Button size="sm" variant="outline" onClick={() => setPolicyLimits([...policyLimits, emptyLimit()])}><Plus className="h-3 w-3 mr-1" /> Add limit</Button>
            </div>
            {policyLimits.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5"><Input placeholder="Dental" value={l.category} onChange={(e) => { const n = [...policyLimits]; n[i] = { ...l, category: e.target.value }; setPolicyLimits(n) }} /></div>
                <div className="col-span-3"><Input type="number" placeholder="Limit" value={l.annualLimit} onChange={(e) => { const n = [...policyLimits]; n[i] = { ...l, annualLimit: e.target.value }; setPolicyLimits(n) }} /></div>
                <div className="col-span-3"><Input type="number" placeholder="Used" value={l.usedAmount} onChange={(e) => { const n = [...policyLimits]; n[i] = { ...l, usedAmount: e.target.value }; setPolicyLimits(n) }} /></div>
                <div className="col-span-1"><Button size="icon-sm" variant="ghost" onClick={() => setPolicyLimits(policyLimits.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPolicyOpen(false)}>Cancel</Button><Button loading={savingPolicy} onClick={savePolicy}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={phiTxnOpen} onOpenChange={setPhiTxnOpen}>
        <DialogContent aria-describedby="private-health-transaction-dialog-description" className="max-w-sm">
          <DialogHeader><DialogTitle>Record premium / benefit</DialogTitle></DialogHeader>
          <p id="private-health-transaction-dialog-description" className="sr-only">Record a private health premium or benefit.</p>
          <div className="space-y-3 py-1">
            <div><Label>Type</Label>
              <Select value={phiTxnForm.type} onValueChange={(v) => setPhiTxnForm({ ...phiTxnForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PHI_TXN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount (AUD)</Label><Input type="number" step="0.01" value={phiTxnForm.amount} onChange={(e) => setPhiTxnForm({ ...phiTxnForm, amount: e.target.value })} /></div>
              <div><Label>Date</Label><Input type="date" value={phiTxnForm.date} onChange={(e) => setPhiTxnForm({ ...phiTxnForm, date: e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Input value={phiTxnForm.description} onChange={(e) => setPhiTxnForm({ ...phiTxnForm, description: e.target.value })} placeholder="optional" /></div>
            <p className="text-xs text-muted-foreground">Premiums add to cost; benefits, cashback and discounts reduce the effective cost.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPhiTxnOpen(false)}>Cancel</Button><Button loading={savingPhiTxn} onClick={savePhiTxn}>Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { if (!open && !importBusy) setImportOpen(false) }}>
        <DialogContent aria-describedby="health-claim-import-dialog-description" className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-primary" />
              {healthImport?.deletedAt
                ? `${importKind === 'medicare' ? 'Medicare' : 'Private health'} source history`
                : importKind === 'medicare' ? 'Import Medicare claims' : 'Import private health claims'}
            </DialogTitle>
          </DialogHeader>
          <p id="health-claim-import-dialog-description" className="sr-only">
            {healthImport?.deletedAt
              ? 'Lifecycle information for a removed claim source.'
              : 'Import Medicare or private health claims for review before saving.'}
          </p>
          {!healthImport ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium">Review before anything is saved</p>
                <p className="text-xs text-muted-foreground">Upload a CSV or a machine-readable PDF statement. Scanned/image-only PDFs are not read. Your file stays private and rows are only created after you confirm.</p>
                <p className="text-xs text-muted-foreground">Dates accept Australian DD/MM/YYYY format and amounts are treated as AUD.</p>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadHealthClaims(file)
                  event.currentTarget.value = ''
                }}
              />
              <Button onClick={() => importInputRef.current?.click()} loading={importBusy} className="w-full">
                <Upload className="h-4 w-4" /> Choose CSV or Medicare PDF
              </Button>
              {importMessage && <p className="text-sm text-destructive" role="alert">{importMessage}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {healthImport.deletedAt ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2" data-testid="health-import-removed-message">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Source removed</Badge>
                    <span className="text-xs text-muted-foreground">{healthImportRemovalDate(healthImport.deletedAt)}</span>
                  </div>
                  <p className="text-sm">
                    This {healthImport.kind === 'medicare' ? 'Medicare' : 'private health'} source was removed and is no longer included in reports.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {healthImport.status === 'canceled'
                      ? 'It was canceled before confirmation, so no claims were added from it.'
                      : 'Confirmed claims remain in your health history.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div>
                      <p className="font-medium">{healthImport.fileName}</p>
                      <p className="text-xs text-muted-foreground">{healthImport.contentType} · {((healthImport.byteSize ?? 0) / 1024).toFixed(1)} KB · SHA-256 {(healthImport.sha256 ?? '').slice(0, 12)}…</p>
                    </div>
                    <Badge variant={healthImport.status === 'rejected' ? 'destructive' : 'outline'}>{healthImport.status === 'review' ? 'Review required' : healthImport.status}</Badge>
                  </div>
                </>
              )}
              {!healthImport.deletedAt && <details className="rounded-lg border border-border/70 bg-muted/10 p-3" data-testid="details-health-claim-audit">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-toggle-health-claim-audit">
                  <History className="h-4 w-4 text-primary" />
                  <span>Private audit history</span>
                  <Badge variant="outline" className="ml-auto">{healthImport.auditEvents?.length ?? 0}</Badge>
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">Shows review activity only. Claim values and uploaded content are not included.</p>
                {(healthImport.auditEvents?.length ?? 0) === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground" data-testid="text-health-claim-audit-empty">No audit activity yet.</p>
                ) : (
                  <ol className="mt-3 space-y-2" data-testid="list-health-claim-audit">
                    {healthImport.auditEvents?.map((event) => (
                      <li key={event.id} className="grid gap-1 rounded-md border border-border/60 p-2 text-xs sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-3" data-testid={`audit-event-${event.id}`}>
                        <span className="font-medium">{healthImportAuditLabel(event.action)}</span>
                        <span><span className="text-muted-foreground sm:hidden">Row: </span>{event.rowNumber == null ? 'Import-wide' : `Row ${event.rowNumber}`}</span>
                        <span><span className="text-muted-foreground sm:hidden">Actor: </span>{event.actor?.name || 'You'}</span>
                        <time dateTime={event.createdAt} className="text-muted-foreground">{healthImportAuditDate(event.createdAt)}</time>
                        {(event.action === 'row_edited' || event.action === 'row_included') && healthImportAuditFieldLabels(event.changedFields).length > 0 && (
                          <span className="text-muted-foreground sm:col-span-2" data-testid={`audit-event-fields-${event.id}`}>
                            Changed fields: {healthImportAuditFieldLabels(event.changedFields).join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                </details>}
              {!healthImport.deletedAt && (healthImport.detectedFields?.length ?? 0) > 0 && <p className="text-xs text-muted-foreground">Detected fields: {healthImport.detectedFields?.join(', ')}</p>}
              {!healthImport.deletedAt && (healthImport.parseErrors?.length ?? 0) > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{healthImport.parseErrors?.join(' ')}</div>}
              {!healthImport.deletedAt && healthImport.kind === 'private_health' && healthImport.status === 'review' && (
                <div className="space-y-1">
                  <Label htmlFor="import-policy">Policy for these claims (required)</Label>
                  <Select value={importPolicyId} onValueChange={setImportPolicyId}>
                    <SelectTrigger id="import-policy"><SelectValue placeholder="Choose an existing policy" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose a policy…</SelectItem>
                      {policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.policyName}{policy.policyNumber ? ` · ${policy.policyNumber}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">No policy is assigned automatically.</p>
                </div>
              )}
              {!healthImport.deletedAt && importRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Claim rows</p>
                  <div className="space-y-3">
                    {importRows.map((row) => {
                      const privateRow = healthImport.kind === 'private_health'
                      const excluded = row.status === 'excluded'
                      const fields = privateRow ? PRIVATE_HEALTH_REVIEW_FIELDS : MEDICARE_REVIEW_FIELDS
                      const lowConfidenceFields = new Set(row.errors
                        ?.map((error) => error.match(/^OCR confidence is low for ([A-Za-z0-9]+);/)?.[1])
                        .filter(Boolean))
                      return (
                        <div key={row.id} className={`rounded-lg border p-3 space-y-3 ${row.errors?.length ? 'border-destructive/50' : 'border-border'} ${excluded ? 'opacity-60' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">Row {row.rowNumber}</span>
                            <div className="flex items-center gap-2">
                              {row.status === 'duplicate' && <Badge variant="outline">Already imported</Badge>}
                              {row.errors?.length > 0 && <Badge variant="destructive">Needs correction</Badge>}
                              {excluded && <Badge variant="outline">Excluded</Badge>}
                              <Button size="sm" variant="ghost" onClick={() => setImportRows((rows) => rows.map((item) => item.id === row.id ? { ...item, status: excluded ? 'valid' : 'excluded' } : item))}>
                                {excluded ? <><FileCheck2 className="h-3 w-3" /> Include</> : <><XCircle className="h-3 w-3" /> Exclude</>}
                              </Button>
                            </div>
                          </div>
                           <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {fields.map(({ field, label, inputType }) => (
                              <div key={field} className={field === 'description' ? 'sm:col-span-2' : ''}>
                                <Label className={`text-xs ${lowConfidenceFields.has(field) ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                                  {lowConfidenceFields.has(field) && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                                  {label}{lowConfidenceFields.has(field) ? ' · check OCR' : ''}
                                </Label>
                                <Input
                                  type={inputType}
                                  step={inputType === 'number' ? '0.01' : undefined}
                                  value={row.data[field] ?? ''}
                                  disabled={excluded || row.status === 'duplicate'}
                                  onChange={(event) => updateImportRow(row.id, field, event.target.value)}
                                  className={`h-8 text-xs ${lowConfidenceFields.has(field) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : ''}`}
                                />
                              </div>
                            ))}
                            {!privateRow && (
                              <div className="sm:col-span-2 lg:col-span-4">
                                <Label className="text-xs">Linked appointment (optional)</Label>
                                <Select
                                  value={row.data.appointmentId || 'none'}
                                  disabled={excluded || row.status === 'duplicate'}
                                  onValueChange={(value) => updateImportRow(row.id, 'appointmentId', value)}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose an appointment" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No linked appointment</SelectItem>
                                    {(data?.appointments ?? []).map((appointment) => (
                                      <SelectItem key={appointment.id} value={appointment.id}>
                                        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(appointment.startTime))} · {appointment.title}{appointment.practitioner ? ` · ${appointment.practitioner.name}` : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          {row.errors?.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {!healthImport.deletedAt && healthImport.status === 'rejected' && (
                <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="health-import-recovery">
                  <p className="text-xs text-muted-foreground">
                    {rejectedImportRecoveryAdvice(healthImport.parseErrors)}
                  </p>
                </div>
              )}
              {!healthImport.deletedAt && healthImport.status !== 'rejected' && importMessage && <p className="text-sm text-muted-foreground" role="status">{importMessage}</p>}
              <DialogFooter>
                {healthImport.deletedAt
                  ? <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
                  : healthImport.status === 'rejected'
                  ? <Button variant="outline" onClick={() => void discardRejectedImport()} loading={importBusy}>Discard and choose another file</Button>
                  : <Button variant="outline" onClick={() => healthImport.status === 'review' ? void cancelHealthImport() : setImportOpen(false)} disabled={importBusy}>{healthImport.status === 'review' ? 'Cancel and remove source' : 'Close'}</Button>}
                {!healthImport.deletedAt && healthImport.status === 'review' && <><Button variant="outline" onClick={() => void saveImportRows()} loading={importBusy}>Save changes</Button><Button onClick={() => void confirmHealthImport()} loading={importBusy}>Confirm import</Button></>}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FadeIn>
  )
}
