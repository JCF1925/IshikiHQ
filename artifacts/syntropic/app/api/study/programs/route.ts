export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { prisma } from '@/lib/db'
import { studyProgramCreateSchema } from '@/lib/study-validation'

export async function GET() {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id
  const programs = await prisma.studyProgram.findMany({
    where: { userId },
    include: {
      requirements: true,
      periods: { orderBy: { startDate: 'desc' } },
      units: { include: { assessments: { include: { components: true }, orderBy: { dueAt: 'asc' } }, teachingPeriod: true }, orderBy: { code: 'asc' } },
      gradingScales: { orderBy: { effectiveFrom: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return apiSuccess(programs)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const parsed = await parseBody(request, studyProgramCreateSchema)
  if (!parsed.success) return parsed.response
  const program = await prisma.studyProgram.create({ data: { ...(parsed.data as any), userId: (session.user as any).id } })
  return apiSuccess(program, { status: 201 })
}
