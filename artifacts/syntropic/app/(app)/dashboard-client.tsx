'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SafeDate, SafeTime } from '@/components/safe-format'
import { SafeNumber } from '@/components/safe-format'
import {
  Pill, CreditCard, CheckSquare, Calendar,
  AlertTriangle, Clock, DollarSign, CheckCircle
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { FadeIn, SlideIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { getDashboardData, type DashboardData } from '@/lib/dashboard-cache'

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = async (force = false) => {
    setError('')
    try {
      setData(await getDashboardData(force))
    } catch {
      setError('The dashboard could not be loaded. Please try again.')
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const logMedication = async (scheduleId: string) => {
    try {
      const res = await fetch('/api/medication-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId, takenAt: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error()
      toast.success('Medication logged')
       fetchData(true)
    } catch {
      toast.error('Failed to log medication')
    }
  }

  const priorityColors: Record<string, string> = {
    urgent: 'bg-destructive text-destructive-foreground',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-400',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400',
    low: 'bg-muted text-muted-foreground',
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96 mt-2" /></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-foreground">{error}</p>
          <Button className="mt-3" variant="outline" onClick={() => { setLoading(true); void fetchData(true) }}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const schedules = data?.todaySchedules ?? []
  const transactions = data?.recentTransactions ?? []
  const tasks = data?.upcomingTasks ?? []
  const events = data?.upcomingEvents ?? []
  const lowStock = data?.lowStock ?? []
  const stats = data?.stats ?? { totalBalance: 0, tasksDueToday: 0, lowStockCount: 0 }

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Your life, structured. Here&apos;s today&apos;s overview.</p>
        </div>
      </FadeIn>

      {/* Stats cards */}
      <Stagger className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
        <StaggerItem>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Balance</p>
                <p className="text-xl font-bold font-mono">
                  <SafeNumber value={stats.totalBalance} currency="AUD" />
                </p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <CheckSquare className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tasks Due Today</p>
                <p className="text-xl font-bold font-mono">{stats.tasksDueToday}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stats.lowStockCount > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
                <Pill className={`h-5 w-5 ${stats.lowStockCount > 0 ? 'text-destructive' : 'text-emerald-500'}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Low Stock Alerts</p>
                <p className="text-xl font-bold font-mono">{stats.lowStockCount}</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <FadeIn>
          <Card className="border-destructive/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">Low stock alerts</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {lowStock.map((s: any) => (
                  <Badge key={s?.id} variant="destructive" className="text-xs">
                    {s?.medication?.name ?? 'Unknown'}: {s?.currentQuantity ?? 0} remaining
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's medication schedule */}
        <SlideIn from="left">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base"><Pill className="h-4 w-4" /> Today&apos;s Medications</span>
                <Link href="/medications"><Button variant="ghost" size="xs">View all</Button></Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {schedules.length === 0 && <p className="text-sm text-muted-foreground">No medications scheduled today</p>}
              {schedules.map((s: any) => {
                const taken = (s?.medicationLogs?.length ?? 0) > 0
                return (
                  <div key={s?.id} className="flex min-w-0 items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${taken ? 'bg-emerald-500/20' : 'bg-muted'}`}>
                        {taken ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s?.prescription?.medication?.name ?? 'Unknown'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s?.doseAmount ?? ''} {s?.prescription?.medication?.unit ?? ''} — {(s?.times ?? []).join(', ')}
                        </p>
                      </div>
                    </div>
                    {!taken && (
                      <Button size="xs" variant="outline" onClick={() => logMedication(s?.id)}>
                        Take
                      </Button>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </SlideIn>

        {/* Upcoming tasks */}
        <SlideIn from="right">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base"><CheckSquare className="h-4 w-4" /> Upcoming Tasks</span>
                <Link href="/tasks"><Button variant="ghost" size="xs">View all</Button></Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks due soon</p>}
              {tasks.map((t: any) => (
                <div key={t?.id} className="flex min-w-0 items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t?.title ?? 'Untitled'}</p>
                    {t?.dueDate && (
                      <p className="text-xs text-muted-foreground">
                        Due <SafeDate date={t.dueDate} options={{ dateStyle: 'medium' }} />
                      </p>
                    )}
                  </div>
                  <Badge className={priorityColors[t?.priority ?? 'medium']}>{t?.priority ?? 'medium'}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </SlideIn>

        {/* Recent transactions */}
        <SlideIn from="left">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Recent Transactions</span>
                <Link href="/transactions"><Button variant="ghost" size="xs">View all</Button></Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {transactions.length === 0 && <p className="text-sm text-muted-foreground">No recent transactions</p>}
              {transactions.map((t: any) => (
                <div key={t?.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{t?.merchant ?? t?.description ?? 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {t?.category ?? 'Uncategorised'} • <SafeDate date={t?.date} options={{ dateStyle: 'short' }} />
                    </p>
                  </div>
                  <span className={`font-mono text-sm font-medium ${(t?.amount ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'}`}>
                    <SafeNumber value={t?.amount ?? 0} currency="AUD" />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </SlideIn>

        {/* Upcoming events */}
        <SlideIn from="right">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base"><Calendar className="h-4 w-4" /> Upcoming Events</span>
                <Link href="/events"><Button variant="ghost" size="xs">View all</Button></Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.length === 0 && <p className="text-sm text-muted-foreground">No upcoming events</p>}
              {events.map((e: any) => (
                <div key={e?.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{e?.title ?? 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground">
                      <SafeTime date={e?.startDatetime} options={{ hour: '2-digit', minute: '2-digit' }} />
                      {e?.location && ` • ${e.location}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{e?.type ?? 'event'}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </SlideIn>
      </div>
    </div>
  )
}
