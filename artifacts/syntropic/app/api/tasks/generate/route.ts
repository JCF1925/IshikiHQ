export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { fortnightStart } from '@/lib/pharmacy-refill'
import { getRefillForecasts } from '@/lib/pharmacy-refill-forecast'

type Candidate = {
  title: string
  description?: string | null
  priority: string
  dueDate?: string | null
  moduleRef: string
  tags: string[]
  source: string
}

function addMonths(d: Date, n: number) {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

// Next occurrence of a recurring transaction on/after `today`.
function nextOccurrence(anchor: Date, frequency: string, interval: number, today: Date): Date {
  const step = Math.max(1, interval || 1)
  let d = new Date(anchor)
  let guard = 0
  while (d < today && guard < 600) {
    switch (frequency) {
      case 'weekly': d = new Date(d.getTime() + 7 * step * 86400000); break
      case 'fortnightly': d = new Date(d.getTime() + 14 * step * 86400000); break
      case 'quarterly': d = addMonths(d, 3 * step); break
      case 'annually': d = addMonths(d, 12 * step); break
      case 'monthly':
      default: d = addMonths(d, step); break
    }
    guard++
  }
  return d
}

async function buildCandidates(userId: string): Promise<Candidate[]> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const candidates: Candidate[] = []

  // 1. Low medication stock → reorder
  const stock = await prisma.stockLevel.findMany({ where: { userId }, include: { medication: true } })
  for (const s of stock) {
    if (s.currentQuantity <= s.reorderThreshold && s.medication?.isActive !== false) {
      candidates.push({
        title: `Reorder ${s.medication?.name ?? 'medication'}`,
        description: `Stock is low (${s.currentQuantity} left, reorder at ${s.reorderThreshold}).`,
        priority: 'high',
        dueDate: null,
        moduleRef: `stock:${s.medicationId}`,
        tags: ['health', 'medication'],
        source: 'Low medication stock',
      })
    }
  }

  // 2. Scripts expiring soon or out of repeats
  const scripts = await prisma.prescription.findMany({ where: { userId }, include: { medication: true } })
  const soon = new Date(today.getTime() + 30 * 86400000)
  for (const p of scripts) {
    const expiringSoon = p.expiryDate && new Date(p.expiryDate) <= soon && new Date(p.expiryDate) >= today
    const outOfRepeats = (p.repeatsUsed ?? 0) >= (p.repeats ?? 0) + 1
    if (expiringSoon || outOfRepeats) {
      candidates.push({
        title: `Renew script for ${p.medication?.name ?? 'medication'}`,
        description: expiringSoon ? `Script expires ${new Date(p.expiryDate!).toLocaleDateString('en-AU')}.` : 'No repeats remaining.',
        priority: 'high',
        dueDate: p.expiryDate ? new Date(p.expiryDate).toISOString() : null,
        moduleRef: `prescription:${p.id}`,
        tags: ['health', 'script'],
        source: 'Script renewal',
      })
    }
  }

  // 3. Bills / subscriptions due in the next 7 days
  const bills = await prisma.recurringTransaction.findMany({ where: { userId, isActive: true, isBill: true } })
  const weekAhead = new Date(today.getTime() + 7 * 86400000)
  for (const b of bills) {
    if (b.endDate && new Date(b.endDate) < today) continue
    const due = nextOccurrence(new Date(b.anchorDate), b.frequency, b.interval, today)
    if (due <= weekAhead) {
      candidates.push({
        title: `Pay ${b.name}`,
        description: `${b.merchant ? b.merchant + ' — ' : ''}$${b.amount.toFixed(2)} due ${due.toLocaleDateString('en-AU')}.`,
        priority: 'medium',
        dueDate: due.toISOString(),
        moduleRef: `recurring:${b.id}:${due.toISOString().slice(0, 10)}`,
        tags: ['money', 'bill'],
        source: 'Bill due',
      })
    }
  }

  // 4. Upcoming appointments in the next 3 days → prepare
  const appts = await prisma.appointment.findMany({ where: { userId, status: 'scheduled', startTime: { gte: today, lte: new Date(today.getTime() + 3 * 86400000) } }, include: { practitioner: true } })
  for (const a of appts) {
    candidates.push({
      title: `Prepare for: ${a.title}`,
      description: `${a.practitioner?.name ? a.practitioner.name + ' — ' : ''}${new Date(a.startTime).toLocaleString('en-AU')}${a.location ? ' @ ' + a.location : ''}.`,
      priority: 'medium',
      dueDate: new Date(a.startTime).toISOString(),
      moduleRef: `appointment:${a.id}`,
      tags: ['health', 'appointment'],
      source: 'Upcoming appointment',
    })
  }

  // Medication refills are grouped into one review task per fortnight. The
  // forecast is still reviewable and manual-first; task generation only
  // prompts the owner to inspect it and never places an order.
  const refillForecasts = await getRefillForecasts(userId, today)
  const refillsDue = refillForecasts.filter(forecast => forecast.needsRefill && forecast.refillDate != null && forecast.refillDate <= weekAhead)
  if (refillsDue.length) {
    const periodKey = fortnightStart(today).toISOString().slice(0, 10)
    candidates.push({
      title: 'Review medication refills',
      description: `Review ${refillsDue.length} medicine(s) due in the following week. Forecasts include scheduled use and recorded PRN use only.`,
      priority: 'medium',
      dueDate: weekAhead.toISOString(),
      moduleRef: `medication-refill-review:${periodKey}`,
      tags: ['health', 'medication', 'pharmacy'],
      source: 'Medication refill forecast',
    })
  }

  return candidates
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const candidates = await buildCandidates(userId)
  // Exclude ones that already have an open task with the same moduleRef.
  const existing = await prisma.task.findMany({
    where: { userId, status: { notIn: ['done', 'cancelled'] }, moduleRef: { in: candidates.map((c) => c.moduleRef) } },
    select: { moduleRef: true },
  })
  const taken = new Set(existing.map((e) => e.moduleRef))
  const fresh = candidates.filter((c) => !taken.has(c.moduleRef))
  return NextResponse.json({ candidates: fresh })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json().catch(() => ({}))
  const selected: string[] | undefined = body.moduleRefs // optional subset

  const candidates = await buildCandidates(userId)
  const existing = await prisma.task.findMany({
    where: { userId, status: { notIn: ['done', 'cancelled'] }, moduleRef: { in: candidates.map((c) => c.moduleRef) } },
    select: { moduleRef: true },
  })
  const taken = new Set(existing.map((e) => e.moduleRef))
  let toCreate = candidates.filter((c) => !taken.has(c.moduleRef))
  if (Array.isArray(selected)) toCreate = toCreate.filter((c) => selected.includes(c.moduleRef))

  if (toCreate.length === 0) return NextResponse.json({ created: 0 })

  await prisma.task.createMany({
    data: toCreate.map((c) => ({
      userId,
      title: c.title,
      description: c.description ?? null,
      status: 'todo',
      priority: c.priority,
      isUrgent: c.priority === 'high',
      isImportant: true,
      dueDate: c.dueDate ? new Date(c.dueDate) : null,
      tags: c.tags,
      moduleRef: c.moduleRef,
    })),
  })
  return NextResponse.json({ created: toCreate.length })
}
