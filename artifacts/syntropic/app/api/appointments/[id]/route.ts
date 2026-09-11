export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { evaluateReferral } from '@/lib/referrals'
import { finiteNumber, optionalDate, validateAppointmentCareOwnership } from '@/lib/appointment-care'

async function syncReferralUsage(tx: Prisma.TransactionClient, appointmentId: string, userId: string) {
  const appointment = await tx.appointment.findFirst({
    where: { id: appointmentId, userId },
    include: {
      practitioner: { select: { id: true, referralRequired: true } },
      referral: { include: { usages: { select: { serviceDate: true, status: true } } } },
    },
  })
  if (!appointment) return null

  await tx.referralUsage.updateMany({
    where: { appointmentId, status: 'counted' },
    data: { status: 'released', releasedAt: new Date(), releaseReason: appointment.status === 'cancelled' ? 'appointment_cancelled' : 'appointment_corrected' },
  })

  const refreshedReferral = appointment.referralId
    ? await tx.referral.findUnique({ where: { id: appointment.referralId }, include: { usages: { where: { status: 'counted' }, select: { serviceDate: true, status: true } } } })
    : null
  const evaluation = evaluateReferral(
    refreshedReferral,
    Boolean(appointment.practitioner?.referralRequired),
    appointment.startTime,
    appointment.practitionerId,
    refreshedReferral?.usages ?? [],
  )
  if (appointment.status === 'completed' && appointment.referralId && evaluation.eligible) {
    await tx.referralUsage.upsert({
      where: { appointmentId_referralId: { appointmentId, referralId: appointment.referralId } },
      create: { userId, referralId: appointment.referralId, appointmentId, serviceDate: appointment.startTime, status: 'counted' },
      update: { serviceDate: appointment.startTime, status: 'counted', releasedAt: null, releaseReason: null },
    })
  }
  if (appointment.referralId) {
    const usageCount = await tx.referralUsage.count({ where: { referralId: appointment.referralId, status: 'counted' } })
    await tx.referral.update({ where: { id: appointment.referralId }, data: { appointmentsUsed: usageCount } })
  }
  await tx.appointment.update({
    where: { id: appointmentId },
    data: { medicareRebateEligible: evaluation.eligible, medicareRebateWarning: evaluation.eligible ? null : evaluation.message },
  })
  return evaluation
}


const appointmentInclude = {
  practitioner: { select: { id: true, name: true, role: true, referralRequired: true, isActive: true } },
  organisation: { select: { id: true, name: true } },
  referral: { include: { usages: { where: { status: 'counted' }, select: { serviceDate: true, status: true } } } },
} as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const b = await request.json()
  const owned = await prisma.appointment.findFirst({ where: { id, userId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await validateAppointmentCareOwnership(userId, {
      practitionerId: b.practitionerId, practiceId: b.organisationId,
      offeringId: b.offeringId, referralId: b.referralId,
    })
    if ('startTime' in b) optionalDate(b.startTime, 'startTime')
    if ('cost' in b) finiteNumber(b.cost, 'cost')
    if ('medicareRebate' in b) finiteNumber(b.medicareRebate, 'medicareRebate')
    if ('outOfPocket' in b) finiteNumber(b.outOfPocket, 'outOfPocket')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findUnique({ where: { id }, select: { referralId: true } })
    const data: any = {}
    for (const k of ['title', 'practitionerId', 'organisationId', 'referralId', 'appointmentType', 'location', 'status', 'medicareItem', 'notes', 'offeringId']) {
      if (k in b) data[k] = b[k] || null
    }
    if ('startTime' in b) data.startTime = optionalDate(b.startTime, 'startTime')
    if ('durationMinutes' in b) data.durationMinutes = b.durationMinutes !== '' ? parseInt(b.durationMinutes) : null
    if ('cost' in b) data.cost = finiteNumber(b.cost, 'cost')
    if ('medicareRebate' in b) data.medicareRebate = finiteNumber(b.medicareRebate, 'medicareRebate')
    if ('outOfPocket' in b) data.outOfPocket = finiteNumber(b.outOfPocket, 'outOfPocket')
    await tx.appointment.update({ where: { id }, data })
    await syncReferralUsage(tx, id, userId)
    const updated = await tx.appointment.findUnique({ where: { id }, include: appointmentInclude })
    if (before?.referralId && before.referralId !== updated?.referralId) {
      const usageCount = await tx.referralUsage.count({ where: { referralId: before.referralId, status: 'counted' } })
      await tx.referral.update({ where: { id: before.referralId }, data: { appointmentsUsed: usageCount } })
    }
    return updated
  })
  return NextResponse.json(result)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const owned = await prisma.appointment.findFirst({ where: { id, userId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({ where: { id, userId }, select: { referralId: true } })
    await tx.referralUsage.updateMany({
      where: { appointmentId: id, userId, status: 'counted' },
      data: { status: 'released', releasedAt: new Date(), releaseReason: 'appointment_deleted' },
    })
    await tx.appointment.deleteMany({ where: { id, userId } })
    if (appointment?.referralId) {
      const usageCount = await tx.referralUsage.count({ where: { referralId: appointment.referralId, status: 'counted' } })
      await tx.referral.update({ where: { id: appointment.referralId }, data: { appointmentsUsed: usageCount } })
    }
  })
  return NextResponse.json({ ok: true })
}