export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { getDerivedAccountBalances, materialiseDueTransactionLocks } from '@/lib/financial-truth'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  await materialiseDueTransactionLocks(userId)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(today)
  dayAfter.setDate(dayAfter.getDate() + 2)

  const [todaySchedules, recentTransactions, upcomingTasks, accounts, upcomingEvents, lowStockMeds] = await Promise.all([
    // Today's medication schedules
    prisma.dosageSchedule.findMany({
      where: { userId, isActive: true },
      include: {
        prescription: { include: { medication: true } },
        medicationLogs: {
          where: { takenAt: { gte: today, lt: tomorrow } },
        },
      },
    }),
    // Recent transactions
    prisma.transaction.findMany({
      where: { userId },
      include: { account: true },
      orderBy: { date: 'desc' },
      take: 5,
    }),
    // Upcoming tasks
    prisma.task.findMany({
      where: {
        userId,
        status: { in: ['todo', 'in_progress'] },
        dueDate: { lte: dayAfter },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      take: 10,
    }),
    // Account balances
    getDerivedAccountBalances(userId, true),
    // Upcoming events
    prisma.event.findMany({
      where: {
        userId,
        startDatetime: { gte: today, lte: dayAfter },
      },
      orderBy: { startDatetime: 'asc' },
      take: 5,
    }),
    // Low stock medications
    prisma.stockLevel.findMany({
      where: { userId },
      include: { medication: true },
    }),
  ])

  const lowStock = (lowStockMeds ?? []).filter((s: any) => s.currentQuantity <= s.reorderThreshold)

  return NextResponse.json({
    todaySchedules,
    recentTransactions,
    upcomingTasks,
    accounts,
    upcomingEvents,
    lowStock,
    stats: {
       totalBalance: (accounts ?? []).reduce((sum: number, a: any) => sum + (a?.derivedBalance ?? 0), 0),
      tasksDueToday: (upcomingTasks ?? []).filter((t: any) => {
        const d = t?.dueDate ? new Date(t.dueDate) : null
        return d && d >= today && d < tomorrow
      }).length,
      lowStockCount: lowStock?.length ?? 0,
    },
  })
}
