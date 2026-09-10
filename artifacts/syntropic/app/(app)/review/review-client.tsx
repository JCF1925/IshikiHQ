'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox, CheckCircle2, Trash2, AlertCircle, Repeat, XCircle, Mail, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber, SafeDate } from '@/components/safe-format'

type Txn = {
  id: string; date: string; amount: number; currency: string; merchant: string | null; description: string | null
  category: string | null; status: string; isRecurring: boolean; isForecast: boolean
  account?: { name: string } | null
  categorySuggestion?: {
    id: string; suggestedCategory: string; confidence: number; evidence: { basis?: string; matchingCount?: number; evidenceCount?: number }
    autoApplied: boolean
  } | null
}
type Cat = { id: string; name: string; parentId: string | null; isActive: boolean; kind: string }
type Candidate = { id: string; kind: string; title: string; confidence: number; status: string; proposedAction: { type?: string } }
type SyncJob = { id: string; status: string; progressCurrent: number; progressTotal: number | null; attemptCount: number; failureMessage: string | null }

export function ReviewClient() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<SyncJob[]>([])

  const fetchTxns = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions?review=true&limit=200')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTxns(data.transactions ?? [])
    } catch { toast.error('Failed to load review queue') }
    finally { setLoading(false) }
  }, [])
  const fetchCats = useCallback(async () => {
    try {
      const r = await fetch('/api/categories')
      if (r.ok) {
        const all = await r.json()
        const parentIds = new Set((all ?? []).map((c: any) => c?.parentId).filter(Boolean))
        setCats((all ?? []).filter((c: any) => c?.isActive !== false && !parentIds.has(c?.id) && c?.kind !== 'transfer'))
      }
    } catch { /* silent */ }
  }, [])
  const fetchAutomation = useCallback(async () => {
    try {
      const [forwarded, redbark] = await Promise.all([fetch('/api/forwarded-messages'), fetch('/api/redbark/connections')])
      if (forwarded.ok) setCandidates((await forwarded.json()).candidates?.filter((item: Candidate) => item.status === 'pending') ?? [])
      if (redbark.ok) setJobs(((await redbark.json()).connections ?? []).flatMap((connection: any) => connection.jobs ?? []))
    } catch { /* Transaction review remains available if integration status cannot load. */ }
  }, [])

  useEffect(() => { fetchTxns(); fetchCats(); fetchAutomation() }, [fetchTxns, fetchCats, fetchAutomation])

  const setCategory = async (t: Txn, category: string) => {
    setTxns((prev) => prev.map((x) => (x.id === t.id ? { ...x, category } : x)))
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }) })
      if (!res.ok) throw new Error()
    } catch { toast.error('Failed to set category'); fetchTxns() }
  }

  const confirm_ = async (t: Txn) => {
    if (!t.category) { toast.error('Assign a category before confirming'); return }
    setBusy(t.id)
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }) })
      if (!res.ok) throw new Error()
      toast.success('Confirmed')
      setTxns((prev) => prev.filter((x) => x.id !== t.id))
    } catch { toast.error('Failed to confirm') }
    finally { setBusy(null) }
  }

  const remove = async (t: Txn) => {
    if (!confirm('Delete this transaction?')) return
    setBusy(t.id)
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Deleted')
      setTxns((prev) => prev.filter((x) => x.id !== t.id))
    } catch { toast.error('Failed to delete') }
    finally { setBusy(null) }
  }
  const decideSuggestion = async (t: Txn, action: 'accept' | 'reject' | 'correct', category?: string) => {
    if (!t.categorySuggestion) return
    setBusy(t.id)
    try {
      const res = await fetch(`/api/transactions/${t.id}/suggestion`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: t.categorySuggestion.id, action, category }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'reject' ? 'Suggestion rejected' : 'Category choice recorded')
      await fetchTxns()
    } catch { toast.error('Failed to record suggestion decision') }
    finally { setBusy(null) }
  }
  const decideCandidate = async (candidate: Candidate, action: 'accept' | 'reject') => {
    const res = await fetch(`/api/forwarded-messages/${candidate.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    if (!res.ok) return toast.error('Failed to update forwarded candidate')
    setCandidates((items) => items.filter((item) => item.id !== candidate.id))
    toast.success(action === 'accept' ? 'Proposed action accepted for review' : 'Candidate rejected')
  }

  const uncategorised = txns.filter((t) => !t.category).length

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Inbox className="h-6 w-6" /> Review queue</h1>
          <p className="text-muted-foreground text-sm mt-1">Transactions needing attention — unconfirmed or uncategorised. Allocate a category, then confirm.</p>
        </div>
      </FadeIn>

      <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Inbox className="h-4 w-4" /> Needs review</div>
            <p className="font-mono text-xl font-bold">{txns.length}</p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertCircle className="h-4 w-4" /> Uncategorised</div>
            <p className={`font-mono text-xl font-bold ${uncategorised ? 'text-amber-500' : ''}`}>{uncategorised}</p>
          </CardContent></Card>
        </StaggerItem>
      </Stagger>

      {(candidates.length > 0 || jobs.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {candidates.length > 0 && <Card><CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Forwarded message candidates</h2>
            {candidates.map((candidate) => <div key={candidate.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2"><Badge variant="outline">{candidate.kind}</Badge><span className="text-xs">{Math.round(candidate.confidence * 100)}% confidence</span></div>
              <p className="text-sm font-medium mt-2">{candidate.title}</p>
              <p className="text-xs text-muted-foreground">{candidate.proposedAction.type?.replace(/_/g, ' ')}</p>
              <div className="flex gap-2 mt-2"><Button size="sm" onClick={() => decideCandidate(candidate, 'accept')}>Accept</Button><Button size="sm" variant="outline" onClick={() => decideCandidate(candidate, 'reject')}>Reject</Button></div>
            </div>)}
          </CardContent></Card>}
          {jobs.length > 0 && <Card><CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Bank feed jobs</h2>
            {jobs.map((job) => <div key={job.id} className="flex justify-between rounded-lg border p-3 text-xs">
              <span><Badge variant="outline">{job.status.replace(/_/g, ' ')}</Badge> · attempt {job.attemptCount}</span>
              <span>{job.progressCurrent}{job.progressTotal == null ? '' : ` / ${job.progressTotal}`}</span>
              {job.failureMessage && <span className="text-destructive">{job.failureMessage}</span>}
            </div>)}
          </CardContent></Card>}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : txns.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">All clear — nothing needs review right now.</p>
        </CardContent></Card>
      ) : (
        <FadeIn delay={0.1}>
          <Card><CardContent className="p-3 space-y-1">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-muted/50 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{t.merchant || t.description || 'Transaction'}</p>
                    {t.isRecurring && <Badge variant="outline" className="text-[10px] gap-1"><Repeat className="h-3 w-3" /> Recurring</Badge>}
                    {t.status === 'pending' && <Badge variant="secondary" className="text-[10px]">Pending</Badge>}
                    {!t.category && <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/40">Uncategorised</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <SafeDate date={t.date} options={{ dateStyle: 'medium' }} />{t.account?.name ? ` · ${t.account.name}` : ''}
                  </p>
                  {t.categorySuggestion && <div className="mt-1 text-xs text-muted-foreground">
                    Suggested <strong>{t.categorySuggestion.suggestedCategory}</strong> · {Math.round(t.categorySuggestion.confidence * 100)}% confidence · {t.categorySuggestion.evidence.matchingCount ?? 0}/{t.categorySuggestion.evidence.evidenceCount ?? 0} confirmed matches
                    {t.categorySuggestion.autoApplied && <Badge variant="outline" className="ml-2 text-[10px]">Auto-applied, pending review</Badge>}
                    <div className="flex gap-1 mt-1">
                      <Button size="sm" variant="outline" onClick={() => decideSuggestion(t, 'accept')} disabled={busy === t.id}>Accept suggestion</Button>
                      <Button size="sm" variant="ghost" onClick={() => decideSuggestion(t, 'correct', t.category || '')} disabled={busy === t.id}>Use selected category</Button>
                      <Button size="sm" variant="ghost" onClick={() => decideSuggestion(t, 'reject')} disabled={busy === t.id}><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                    </div>
                  </div>}
                </div>
                <p className={`font-mono text-sm font-semibold ${t.amount < 0 ? '' : 'text-emerald-500'}`}>
                  <SafeNumber value={t.amount} currency={t.currency} />
                </p>
                <Select value={t.category || 'none'} onValueChange={(v: string) => setCategory(t, v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorised</SelectItem>
                    {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => confirm_(t)} loading={busy === t.id} className="shrink-0"><CheckCircle2 className="h-4 w-4 mr-1" /> Confirm</Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(t)} disabled={busy === t.id} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent></Card>
        </FadeIn>
      )}
    </div>
  )
}
