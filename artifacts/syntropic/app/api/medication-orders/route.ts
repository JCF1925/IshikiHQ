import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { pharmacyRequestSchema, validationError } from '@/lib/medication-validation'
import { fortnightStart } from '@/lib/pharmacy-refill'
import { getRefillForecasts } from '@/lib/pharmacy-refill-forecast'

export async function GET() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const [pharmacies, orders] = await Promise.all([
    prisma.pharmacy.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    prisma.pharmacyOrder.findMany({ where: { userId }, include: { pharmacy: true, lines: { include: { medication: true } }, events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
  ])
  return NextResponse.json({ pharmacies, orders, forecast: await getRefillForecasts(userId) })
}

export async function POST(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id; const body = await request.json().catch(() => ({}))
  const parsedRequest = pharmacyRequestSchema.safeParse(body)
  if (!parsedRequest.success) return NextResponse.json(validationError(parsedRequest.error), { status: 400 })
  if (parsedRequest.data.type === 'pharmacy') {
    const parsed = parsedRequest.data
    const pharmacy = { name: parsed.name, address: parsed.address, phone: parsed.phone, notes: parsed.notes }
    return NextResponse.json(await prisma.pharmacy.create({ data: { userId, ...pharmacy } }), { status: 201 })
  }
  if (parsedRequest.data.type === 'preference') {
    const parsed = parsedRequest.data
    const preference = { medicationId: parsed.medicationId, pharmacyId: parsed.pharmacyId }
    const ok = await prisma.$transaction(async tx => {
      const [med, pharmacy] = await Promise.all([
        tx.medication.findFirst({ where: { id: preference.medicationId, userId } }),
        tx.pharmacy.findFirst({ where: { id: preference.pharmacyId, userId, isActive: true } }),
      ])
      if (!med || !pharmacy) throw new Error('NOT_FOUND')
      return tx.medicationPharmacyPreference.upsert({ where: { userId_medicationId: { userId, medicationId: preference.medicationId } }, create: { userId, ...preference }, update: { pharmacyId: preference.pharmacyId } })
    }).catch(e => e.message === 'NOT_FOUND' ? null : Promise.reject(e))
    if (!ok) return NextResponse.json({ error: 'Medication or pharmacy was not found' }, { status: 404 })
    return NextResponse.json(ok)
  }
  if (parsedRequest.data.type !== 'order') return NextResponse.json({ error: 'Unsupported request' }, { status: 400 })
  const parsed = parsedRequest.data
  const periodStart = fortnightStart(parsed.periodStart)
  const data = { ...parsed, periodStart, periodEnd: new Date(periodStart.getTime() + 13 * 86400000) }
  const result = await prisma.$transaction(async tx => {
    const pharmacy = await tx.pharmacy.findFirst({ where: { id: data.pharmacyId, userId, isActive: true } }); if (!pharmacy) throw new Error('NOT_FOUND')
    const existing = await tx.pharmacyOrder.findUnique({ where: { userId_pharmacyId_periodStart: { userId, pharmacyId: data.pharmacyId, periodStart: data.periodStart } }, select: { id: true, status: true } })
    if (existing && existing.status !== 'draft') throw new Error('ORDER_LOCKED')
    if (data.lines.length) {
      if (data.lines.some(line => line.status === 'received' || line.status === 'cancelled')) throw new Error('INVALID_LINE')
      const meds = await tx.medication.findMany({ where: { userId, id: { in: data.lines.map(l => l.medicationId) } }, select: { id: true } })
      if (meds.length !== new Set(data.lines.map(l => l.medicationId)).size) throw new Error('INVALID_LINE')
      const prescriptions = data.lines.filter(l => l.prescriptionId).map(l => l.prescriptionId!)
      const scripts = await tx.prescription.findMany({ where: { userId, id: { in: prescriptions } }, select: { id: true, medicationId: true } })
      if (scripts.length !== prescriptions.length || data.lines.some(l => l.prescriptionId && !scripts.some(p => p.id === l.prescriptionId && p.medicationId === l.medicationId))) throw new Error('INVALID_LINE')
    }
    const order = await tx.pharmacyOrder.upsert({
      where: { userId_pharmacyId_periodStart: { userId, pharmacyId: data.pharmacyId, periodStart: data.periodStart } },
      create: { userId, pharmacyId: data.pharmacyId, periodStart: data.periodStart, periodEnd: data.periodEnd, notes: data.notes ?? null },
      update: { notes: data.notes ?? null },
    })
    for (const line of data.lines) await tx.pharmacyOrderLine.upsert({ where: { orderId_medicationId: { orderId: order.id, medicationId: line.medicationId } }, create: { orderId: order.id, ...line }, update: { quantity: line.quantity, prescriptionId: line.prescriptionId ?? null, status: line.status ?? 'ordered', substitutionNote: line.substitutionNote ?? null } })
    return tx.pharmacyOrder.findUnique({ where: { id: order.id }, include: { lines: true, pharmacy: true } })
  }).catch(e => e.message === 'NOT_FOUND' ? null : e.message === 'INVALID_LINE' ? 'invalid-line' : e.message === 'ORDER_LOCKED' ? 'order-locked' : Promise.reject(e))
   if (result === 'invalid-line') return NextResponse.json({ error: 'One or more order lines is not owned by this account or has the wrong prescription' }, { status: 400 })
  if (result === 'order-locked') return NextResponse.json({ error: 'This fortnight order is no longer a draft' }, { status: 409 })
   if (!result) return NextResponse.json({ error: 'Pharmacy was not found' }, { status: 404 })
  return NextResponse.json(result, { status: 201 })
}