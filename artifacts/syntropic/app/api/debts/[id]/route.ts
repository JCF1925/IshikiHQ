export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getDebtDetail } from '@/lib/interpersonal-debt'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await getDebtDetail((session.user as any).id, (await params).id)) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Not found' }, { status: 404 }) }
}