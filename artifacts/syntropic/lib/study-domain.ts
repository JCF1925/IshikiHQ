import { prisma } from '@/lib/db'

export class StudyOwnershipError extends Error {}

export async function assertOwnedStudyProgram(userId: string, id: string) {
  const program = await prisma.studyProgram.findFirst({ where: { id, userId } })
  if (!program) throw new StudyOwnershipError('Program not found')
  return program
}

export async function assertOwnedStudyUnit(userId: string, id: string) {
  const unit = await prisma.studyUnit.findFirst({ where: { id, program: { userId } } })
  if (!unit) throw new StudyOwnershipError('Unit not found')
  return unit
}
