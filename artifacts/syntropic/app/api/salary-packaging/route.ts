export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const items = await prisma.salaryPackaging.findMany({
    where: { userId },
    orderBy: [{ isProvisional: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json()

  const item = await prisma.salaryPackaging.create({
    data: {
      userId,
      name: body.name || 'Package',
      employerId: body.employerId || null,
      packageType: body.packageType === 'oneoff' ? 'oneoff' : 'recurring',
      frequency: body.frequency || 'annually',
      grossSalary: Math.abs(parseFloat(body.grossSalary)) || 0,
      packagedAmount: Math.abs(parseFloat(body.packagedAmount)) || 0,
      benefitType: body.benefitType || null,
      reportableAmount: parseFloat(body.reportableAmount) || 0,
      gstComponent: parseFloat(body.gstComponent) || 0,
      postTaxDeduction: parseFloat(body.postTaxDeduction) || 0,
      reimbursement: parseFloat(body.reimbursement) || 0,
      startDate: body.startDate ? new Date(body.startDate) : null,
      isProvisional: body.isProvisional ?? true,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
