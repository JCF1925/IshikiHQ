import { prisma } from '@/lib/db'

export function finiteNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a finite number`)
  return parsed
}
export function optionalDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`)
  return date
}
export function jsonField(value: unknown, field: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object') throw new Error(`${field} must be an object or array`)
  return value as object
}

/** Validate all cross-domain ids before a care record is written. */
export async function validateAppointmentCareOwnership(userId: string, ids: {
  practitionerId?: string | null
  practiceId?: string | null
  symptomId?: string | null
  offeringId?: string | null
  appointmentId?: string | null
  referralId?: string | null
  supersedesId?: string | null
}) {
  const checks: Promise<unknown>[] = []
  const practitionerPromise = ids.practitionerId
    ? prisma.person.findFirst({ where: { id: ids.practitionerId, userId }, select: { id: true, organisationId: true } })
    : Promise.resolve(null)
  const practicePromise = ids.practiceId
    ? prisma.organisation.findFirst({ where: { id: ids.practiceId, userId }, select: { id: true } })
    : Promise.resolve(null)
  const offeringPromise = ids.offeringId
    ? prisma.appointmentOffering.findFirst({ where: { id: ids.offeringId, userId }, select: { id: true, practiceId: true } })
    : Promise.resolve(null)
  if (ids.practitionerId) checks.push(practitionerPromise)
  if (ids.practiceId) checks.push(practicePromise)
  if (ids.offeringId) checks.push(offeringPromise)
  if (ids.symptomId) checks.push(prisma.symptom.findFirst({ where: { id: ids.symptomId, userId }, select: { id: true } }))
  if (ids.appointmentId) checks.push(prisma.appointment.findFirst({ where: { id: ids.appointmentId, userId }, select: { id: true } }))
  if (ids.referralId) checks.push(prisma.referral.findFirst({ where: { id: ids.referralId, userId }, select: { id: true } }))
  if (ids.supersedesId) checks.push(prisma.appointmentOutcome.findFirst({ where: { id: ids.supersedesId, userId }, select: { id: true } }))
  const results = await Promise.all(checks)
  if (results.some((result) => !result)) throw new Error('Referenced care record does not belong to this account')
  const [practitioner, offering] = await Promise.all([practitionerPromise, offeringPromise])
  if (ids.practiceId && practitioner && practitioner.organisationId && practitioner.organisationId !== ids.practiceId) {
    throw new Error('Practitioner does not belong to the selected practice')
  }
  if (ids.offeringId && ids.practiceId && offering && offering.practiceId !== ids.practiceId) {
    throw new Error('Offering does not belong to the selected practice')
  }
}
