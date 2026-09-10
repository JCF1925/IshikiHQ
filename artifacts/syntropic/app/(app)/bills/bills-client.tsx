'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Receipt, CheckCircle2, CalendarClock, Repeat, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber, SafeDate } from '@/components/safe-format'

type Txn = {
  id: string; date: string; amount: number; currency: string; merchant: string | null; description: string | null
  category: string | null; status: string; isRecurring: boolean; isForecast: boolean; bnplPlanId: string | null
  account?: { name: string } | null
}

function dayDiff(dateStr: string): number {
  const d = new Date(dateStr); const now = new Date()
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((a - b) / 86400000)
}

export function BillsClient() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)

  const fetchTxns = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions?status=pending&limit=200')
      if (!res.ok) throw new Error()
      const data = await res.json()
      const upcoming = (data.transactions ?? []).filter((t: Txn) => t.amount < 0)
      upcoming.sort((a: Txn, b: Txn) => new Date(a.date).getTime() - new Date(b.date).getTime())
      setTxns(upcoming)
    } catch { toast.error('Failed to load upcoming payments') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTxns() }, [fetchTxns])

  const markPaid = async (t: Txn) => {
    setPaying(t.id)
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }) })
      if (!res.ok) throw new Error()
      toast.success('Marked as paid')
      setTxns((prev) => prev.filter((x) => x.id !== t.id))
    } catch { toast.error('Failed to update') }
    finally { setPaying(null) }
  }

  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400000)
  const next30 = txns.filter((t) => new Date(t.date) <= in30)
  const total30 = next30.reduce((s, t) => s + Math.abs(t.amount), 0)
  const overdue = txns.filter((t) => dayDiff(t.date) < 0)

  const Row = ({ t }: { t: Txn }) => {
    const dd = dayDiff(t.date)
    const over = dd < 0
    const soon = dd >= 0 && dd <= 3
    return (
      <div className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-muted/50 group">
        <div className={`shrink-0 ${over ? 'text-destructive' : soon ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {over ? <AlertTriangle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{t.merchant || t.description || 'Payment'}</p>
            {t.isRecurring && <Badge variant="outline" className="text-[10px] gap-1"><Repeat className="h-3 w-3" /> Recurring</Badge>}
            {t.bnplPlanId && <Badge variant="outline" className="text-[10px]">BNPL</Badge>}
            {t.category && <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <SafeDate date={t.date} options={{ dateStyle: 'medium' }} />
            {' · '}
            {over ? <span className="text-destructive">{Math.abs(dd)} day{Math.abs(dd) === 1 ? '' : 's'} overdue</span>
              : dd === 0 ? <span className="text-amber-500">Due today</span>
              : <span>in {dd} day{dd === 1 ? '' : 's'}</span>}
            {t.account?.name ? ` · ${t.account.name}` : ''}
          </p>
        </div>
        <p className="font-mono text-sm font-semibold"><SafeNumber value={Math.abs(t.amount)} currency={t.currency} /></p>
        <Button size="sm" variant="outline" onClick={() => markPaid(t)} loading={paying === t.id} className="shrink-0">
          <CheckCircle2 className="h-4 w-4 mr-1" /> Paid
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Receipt className="h-6 w-6" /> Subscriptions &amp; Bills</h1>
          <p className="text-muted-foreground text-sm mt-1">Every upcoming payment — recurring or one-off. Mark as paid to confirm it in your ledger.</p>
        </div>
      </FadeIn>

      <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CalendarClock className="h-4 w-4" /> Due next 30 days</div>
            <p className="font-mono text-xl font-bold"><SafeNumber value={total30} currency="AUD" /></p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Receipt className="h-4 w-4" /> Upcoming payments</div>
            <p className="font-mono text-xl font-bold">{next30.length}</p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertTriangle className="h-4 w-4" /> Overdue</div>
            <p className={`font-mono text-xl font-bold ${overdue.length ? 'text-destructive' : ''}`}>{overdue.length}</p>
          </CardContent></Card>
        </StaggerItem>
      </Stagger>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : txns.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nothing due. Add recurring items or upcoming transactions and they’ll appear here.</p>
        </CardContent></Card>
      ) : (
        <FadeIn delay={0.1}>
          <Card><CardContent className="p-3">
            {txns.map((t) => <Row key={t.id} t={t} />)}
          </CardContent></Card>
        </FadeIn>
      )}
    </div>
  )
}
