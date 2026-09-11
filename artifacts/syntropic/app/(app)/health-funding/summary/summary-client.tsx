'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, BarChart3, HeartPulse, ShieldCheck, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SafeDate, SafeNumber } from '@/components/safe-format'
import { HealthDisclaimer } from '@/components/health-disclaimer'
import { FadeIn } from '@/components/ui/animate'

type MedicareSummary = {
  claimCount: number
  actualClaimCount: number
  forecastClaimCount: number
  chargedAmount: number
  benefitAmount: number
  outOfPocket: number
  forecastOutOfPocket: number
  recentClaims: Array<{
    id: string
    serviceDate: string
    description: string
    provider: string | null
    benefitPaid: number | null
    outOfPocket: number | null
    isForecast: boolean
  }>
}

type PrivateSummary = {
  policyCount: number
  activePolicyCount: number
  claimCount: number
  chargedAmount: number
  benefitAmount: number
  outOfPocket: number
  premiumsPaid: number
  benefitsReceived: number
  effectiveCost: number
  policies: Array<{
    id: string
    policyName: string
    insurerName: string | null
    coverType: string
    isActive: boolean
    claimCount: number
    benefitAmount: number
    effectiveCost: number
  }>
  recentClaims: Array<{
    id: string
    serviceDate: string
    description: string
    provider: string | null
    benefitAmount: number | null
    outOfPocket: number | null
  }>
}

type Summary = {
  year: number
  generatedAt: string
  scope: 'live'
  liveImportCount: number
  liveImportKinds: { medicare: number; privateHealth: number }
  medicare: MedicareSummary
  privateHealth: PrivateSummary
  combined: { claimCount: number; benefitAmount: number; outOfPocket: number }
}

const nowYear = () => new Date().getUTCFullYear()
const years = Array.from({ length: 6 }, (_, index) => nowYear() - index)

function Amount({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={className}><SafeNumber value={value ?? 0} currency="AUD" /></span>
}

function ErrorState({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <span>Health funding summary could not be loaded. Your records are not known to be empty.</span>
      <Button size="sm" variant="outline" onClick={onRetry} loading={loading}>
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  )
}

export function HealthFundingSummaryClient() {
  const [year, setYear] = useState(nowYear())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch(`/api/health-claims/summary?year=${year}`)
      if (!response.ok) throw new Error('Summary request failed')
      setSummary(await response.json() as Summary)
    } catch {
      setSummary(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary])

  return (
    <FadeIn className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href="/health-funding"><ArrowLeft className="h-4 w-4" /> Back to Health Funding</Link>
          </Button>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" /> Health funding summary
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">A combined view of your Medicare and private-health funding for the selected year.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Year</span>
          <select
            aria-label="Summary year"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <HealthDisclaimer />
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Live records only</p>
        <p className="mt-1 text-xs text-muted-foreground">This report excludes removed source files, review rows, audit history, and deleted-account data. It is visible only to the signed-in account.</p>
      </div>

      {loading ? <Skeleton className="h-32 w-full" /> : error ? <ErrorState onRetry={() => void fetchSummary()} loading={loading} /> : summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Live claims</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{summary.combined.claimCount}</p><p className="text-xs text-muted-foreground">Medicare and private health</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Benefits received</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold text-emerald-400"><Amount value={summary.combined.benefitAmount} /></p><p className="text-xs text-muted-foreground">Across both funding sources</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Out of pocket</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold"><Amount value={summary.combined.outOfPocket} /></p><p className="text-xs text-muted-foreground">Recorded for {summary.year}</p></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Medicare</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Claims</span><p className="font-semibold">{summary.medicare.claimCount}</p></div>
                  <div><span className="text-muted-foreground">Benefits paid</span><p className="font-semibold text-emerald-400"><Amount value={summary.medicare.benefitAmount} /></p></div>
                  <div><span className="text-muted-foreground">Charged</span><p className="font-semibold"><Amount value={summary.medicare.chargedAmount} /></p></div>
                  <div><span className="text-muted-foreground">Out of pocket</span><p className="font-semibold"><Amount value={summary.medicare.outOfPocket} /></p></div>
                </div>
                <p className="text-xs text-muted-foreground">{summary.medicare.actualClaimCount} recorded · {summary.medicare.forecastClaimCount} forecast</p>
                {summary.medicare.recentClaims.length > 0 && (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    {summary.medicare.recentClaims.slice(0, 4).map((claim) => (
                      <div key={claim.id} className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0"><p className="truncate font-medium">{claim.description}</p><p className="text-muted-foreground"><SafeDate date={claim.serviceDate} options={{ dateStyle: 'medium' }} />{claim.provider ? ` · ${claim.provider}` : ''}</p></div>
                        <Amount value={claim.benefitPaid} className="shrink-0 text-emerald-400" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" /> Private health</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Policies</span><p className="font-semibold">{summary.privateHealth.activePolicyCount} active <span className="font-normal text-muted-foreground">/ {summary.privateHealth.policyCount}</span></p></div>
                  <div><span className="text-muted-foreground">Claims</span><p className="font-semibold">{summary.privateHealth.claimCount}</p></div>
                  <div><span className="text-muted-foreground">Benefits paid</span><p className="font-semibold text-emerald-400"><Amount value={summary.privateHealth.benefitAmount} /></p></div>
                  <div><span className="text-muted-foreground">Net policy cost</span><p className="font-semibold"><Amount value={summary.privateHealth.effectiveCost} /></p></div>
                </div>
                {summary.privateHealth.policies.length > 0 && (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    {summary.privateHealth.policies.map((policy) => (
                      <div key={policy.id} className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0"><p className="truncate font-medium">{policy.policyName}</p><p className="text-muted-foreground">{policy.insurerName ?? 'Insurer not set'} · {policy.claimCount} claims</p></div>
                        <Amount value={policy.benefitAmount} className="shrink-0 text-emerald-400" />
                      </div>
                    ))}
                  </div>
                )}
                {summary.privateHealth.policyCount === 0 && <p className="text-sm text-muted-foreground">No private health policies recorded for this account.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Live source records used: {summary.liveImportCount} imported source{summary.liveImportCount === 1 ? '' : 's'}.</span>
            <span>Updated <SafeDate date={summary.generatedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} /></span>
          </div>
        </>
      )}
    </FadeIn>
  )
}