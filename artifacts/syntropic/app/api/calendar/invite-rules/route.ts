export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { z } from 'zod'

export const inviteRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
  medicalRule: z.boolean().default(false),
  eventTypes: z.array(z.string().max(80)).max(50).default([]),
  tags: z.array(z.string().max(80)).max(50).default([]),
  linkedPersonIds: z.array(z.string().cuid()).max(100).default([]),
  recurringTemplateId: z.string().max(200).nullable().optional(),
  locationMatcher: z.string().max(500).nullable().optional(),
  minimumTravelMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  inviteePersonIds: z.array(z.string().cuid()).min(1).max(100),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  return apiSuccess({ rules: await prisma.calendarInviteRule.findMany({ where: { userId: (session.user as any).id }, orderBy: { createdAt: 'asc' } }) })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, inviteRuleSchema)
  if (!parsed.success) return parsed.response
  const inviteePersonIds = [...new Set(parsed.data.inviteePersonIds)]
  const people = await prisma.person.findMany({
    where: { userId: (session.user as any).id, id: { in: inviteePersonIds } },
    select: { id: true, email: true },
  })
  const validIds = new Set(people.filter(person => person.email && z.string().email().safeParse(person.email).success).map(person => person.id))
  const invalidIds = inviteePersonIds.filter(id => !validIds.has(id))
  if (invalidIds.length) return apiError('VALIDATION_ERROR', 'Every invitee must be an owned person with a valid email address', 400, { invalidPersonIds: invalidIds })
  return apiSuccess(await prisma.calendarInviteRule.create({
    data: { userId: (session.user as any).id, ...parsed.data, inviteePersonIds },
  }), { status: 201 })
}