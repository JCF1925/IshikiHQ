export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
export async function GET() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const [offerings, agenda, outcomes, medications, prescriptions, schedules, stock] = await Promise.all([
    prisma.appointmentOffering.findMany({ where: { userId, isActive: true }, include: { practice: true, overrides: { where: { isActive: true } } } }),
    prisma.privateAgendaItem.findMany({ where: { userId }, include: { practitioner: true, practice: true, symptom: true, appointment: true }, orderBy: { startsAt: 'asc' } }),
    prisma.appointmentOutcome.findMany({ where: { userId }, include: { appointment: { include: { practitioner: true, organisation: true, offering: true } }, supersedes: true }, orderBy: { recordedAt: 'desc' } }),
    prisma.medication.findMany({ where: { userId, isActive: true } }),
    prisma.prescription.findMany({ where: { userId }, include: { medication: true, prescriber: { include: { organisation: true } } }, orderBy: { datePrescribed: 'desc' } }),
    prisma.dosageSchedule.findMany({ where: { userId, isActive: true }, include: { medication: true, prescription: true } }),
    prisma.stockLevel.findMany({ where: { userId }, include: { medication: true } }),
  ])
  return NextResponse.json({ offerings, agenda, outcomes, medications, prescriptions, schedules, stock })
}
