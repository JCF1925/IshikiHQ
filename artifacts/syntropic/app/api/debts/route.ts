export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const q = new URL(request.url).searchParams.get('search')?.trim()
  const [agreements, people, households, transactions] = await Promise.all([
    prisma.debtAgreement.findMany({ where: { userId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { person: { name: { contains: q, mode: 'insensitive' } } }] } : {}) }, include: { person: true, household: true, movements: { orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }] } }, orderBy: { updatedAt: 'desc' } }),
    prisma.person.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    prisma.household.findMany({ where: { memberships: { some: { userId, removedAt: null } } }, orderBy: { name: 'asc' } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 100 }),
  ])
  const debts = agreements.map((a) => {
    const principal = a.movements.find((m) => m.type === 'principal_advance')
    return { ...a, direction: a.direction === 'owed_to_me' ? 'they_owe_me' : 'i_owe_them', principalAmount: Number(principal?.amount ?? 0), startDate: principal?.effectiveAt ?? a.createdAt, dueDate: a.dueDate, interestAnnualRate: a.annualInterestRate, interestStartDate: a.interestEffectiveAt, currentBalance: (a.direction === 'owed_by_me' ? -1 : 1) * a.movements.reduce((s, m) => s + (m.type === 'repayment' ? -1 : 1) * Number(m.amount), 0) }
  })
  return NextResponse.json({ debts, people, households, transactions })
}

export async function POST(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const body = await request.json()
  try {
    if (!['they_owe_me', 'i_owe_them'].includes(body.direction)) throw new Error('Invalid debt direction')
    const principal = Number(body.principalAmount); const start = new Date(body.startDate)
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(start.getTime())) throw new Error('Positive principal and valid start date are required')
    const due = body.dueDate ? new Date(body.dueDate) : null
    if (due && (!Number.isFinite(due.getTime()) || due < start)) throw new Error('Due date must be on or after start date')
    const rate = body.interestAnnualRate === undefined ? null : Number(body.interestAnnualRate)
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw new Error('Interest rate must be finite and non-negative')
    const person = await prisma.person.findFirst({ where: { id: body.personId, userId } }); if (!person) throw new Error('Person not found')
    if (body.householdId) {
      const member = await prisma.householdMembership.findFirst({ where: { householdId: body.householdId, userId, removedAt: null } })
      if (!member || (body.membershipId && body.membershipId !== member.id)) throw new Error('Household membership not found')
    }
    const currency = String(body.currency ?? 'AUD').toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency')
    if (body.householdId && !body.householdMembershipId) throw new Error('Household membership is required')
    if (body.householdId) { const m = await prisma.householdMembership.findFirst({ where: { id: body.householdMembershipId, householdId: body.householdId, userId, removedAt: null } }); if (!m) throw new Error('Active household membership not found') }
    if (body.interestStartDate && (!Number.isFinite(new Date(body.interestStartDate).getTime()) || new Date(body.interestStartDate) < start)) throw new Error('Interest start date must be valid and not precede start')
    const direction = body.direction === 'they_owe_me' ? 'owed_to_me' : 'owed_by_me'
    const duplicate = await prisma.debtAgreement.findFirst({ where: { userId, personId: person.id, householdId: body.householdId ?? null, direction } })
    if (duplicate) throw new Error('A debt with this person and context already exists; record another movement on the existing debt')
    const agreement = await prisma.$transaction(async (tx) => {
      const a = await tx.debtAgreement.create({ data: { userId, personId: person.id, householdId: body.householdId ?? null, membershipId: body.householdMembershipId ?? null, direction, currency, annualInterestRate: rate, interestEffectiveAt: rate === null ? null : (body.interestStartDate ? new Date(body.interestStartDate) : start), dueDate: due, name: body.name ?? null, notes: body.notes ?? null } })
      await tx.debtMovement.create({ data: { agreementId: a.id, createdById: userId, type: 'principal_advance', amount: principal, effectiveAt: start, description: 'Initial principal advance' } })
      return a
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json(agreement, { status: 201 })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 400 }) }
}