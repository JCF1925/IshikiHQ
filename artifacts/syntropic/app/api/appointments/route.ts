export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { evaluateReferral } from '@/lib/referrals'
import { finiteNumber, optionalDate, validateAppointmentCareOwnership } from '@/lib/appointment-care'

const num = (v: any) => (v != null && v !== '' ? parseFloat(v) : null)
const date = (v: any) => v ? new Date(v) : new Date()

async function syncReferralUsage(tx: Prisma.TransactionClient, appointmentId: string, userId: string) {
  const appointment = await tx.appointment.findFirst({
    where: { id: appointmentId, userId },
    include: {
      practitioner: { select: { id: true, referralRequired: true } },
      referral: { include: { usages: { select: { serviceDate: true, status: true } } } },
      referralUsages: { where: { status: 'counted' }, select: { id: true } },
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
  const eligibleForUsage = appointment.status === 'completed' && Boolean(appointment.referralId) && evaluation.eligible
  if (eligibleForUsage && appointment.referralId) {
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
    data: {
      medicareRebateEligible: evaluation.eligible,
      medicareRebateWarning: evaluation.eligible ? null : evaluation.message,
    },
  })
  return evaluation
}


function withReferralStatus(appointment: any) {
  const evaluation = evaluateReferral(
    appointment.referral,
    Boolean(appointment.practitioner?.referralRequired),
    appointment.startTime,
    appointment.practitionerId,
    appointment.referral?.usages ?? [],
  )
  return {
    ...appointment,
    referralStatus: evaluation.code,
    referralStatusMessage: evaluation.message,
    referralRemaining: evaluation.remaining,
    medicareRebateEligible: appointment.medicareRebateEligible && evaluation.eligible,
    medicareRebateWarning: appointment.medicareRebateEligible && evaluation.eligible ? appointment.medicareRebateWarning : evaluation.message,
  }
}

const appointmentInclude = {
  practitioner: { select: { id: true, name: true, role: true, referralRequired: true, isActive: true } },
  organisation: { select: { id: true, name: true } },
  referral: {
    include: {
      usages: { where: { status: 'counted' }, select: { serviceDate: true, status: true } },
    },
  },
} as const

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const appointments = await prisma.appointment.findMany({
    where: { userId },
    include: appointmentInclude,
    orderBy: { startTime: 'desc' },
  })
  return NextResponse.json(appointments.map(withReferralStatus))
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const b = await request.json()

  if (!b.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  try {
    await validateAppointmentCareOwnership(userId, {
      practitionerId: b.practitionerId, practiceId: b.organisationId,
      offeringId: b.offeringId, referralId: b.referralId,
    })
    optionalDate(b.startTime, 'startTime')
    finiteNumber(b.cost, 'cost')
    finiteNumber(b.medicareRebate, 'medicareRebate')
    finiteNumber(b.outOfPocket, 'outOfPocket')
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        userId,
        title: b.title.trim(),
        practitionerId: b.practitionerId || null,
        organisationId: b.organisationId || null,
        referralId: b.referralId || null,
        appointmentType: b.appointmentType || null,
        startTime: date(b.startTime),
        durationMinutes: b.durationMinutes != null && b.durationMinutes !== '' ? parseInt(b.durationMinutes) : null,
        location: b.location || null,
        status: b.status || 'scheduled',
        cost: num(b.cost),
        medicareItem: b.medicareItem || null,
        medicareRebate: num(b.medicareRebate),
        outOfPocket: num(b.outOfPocket),
        notes: b.notes || null,
        offeringId: b.offeringId || null,
      },
    })
    await syncReferralUsage(tx, appointment.id, userId)
    return tx.appointment.findUnique({ where: { id: appointment.id }, include: appointmentInclude })
  })
  return NextResponse.json(withReferralStatus(result), { status: 201 })
}