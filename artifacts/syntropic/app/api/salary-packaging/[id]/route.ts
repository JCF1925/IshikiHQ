export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const body = await request.json()
  const existing = await prisma.salaryPackaging.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.employerId !== undefined) data.employerId = body.employerId || null
  if (body.packageType !== undefined) data.packageType = body.packageType === 'oneoff' ? 'oneoff' : 'recurring'
  if (body.frequency !== undefined) data.frequency = body.frequency
  if (body.grossSalary !== undefined) data.grossSalary = Math.abs(parseFloat(body.grossSalary)) || 0
  if (body.packagedAmount !== undefined) data.packagedAmount = Math.abs(parseFloat(body.packagedAmount)) || 0
  if (body.benefitType !== undefined) data.benefitType = body.benefitType || null
  if (body.reportableAmount !== undefined) data.reportableAmount = parseFloat(body.reportableAmount) || 0
  if (body.gstComponent !== undefined) data.gstComponent = parseFloat(body.gstComponent) || 0
  if (body.postTaxDeduction !== undefined) data.postTaxDeduction = parseFloat(body.postTaxDeduction) || 0
  if (body.reimbursement !== undefined) data.reimbursement = parseFloat(body.reimbursement) || 0
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null
  if (body.isProvisional !== undefined) data.isProvisional = body.isProvisional
  if (body.notes !== undefined) data.notes = body.notes || null

  const updated = await prisma.salaryPackaging.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { id } = await params
  const existing = await prisma.salaryPackaging.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.salaryPackaging.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
