export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { consumeHouseholdInvitation } from '@/lib/household'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const email = session.user.email.toLowerCase()
  const { token } = await request.json()
  if (typeof token !== 'string' || !token) return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  try {
    const membership = await consumeHouseholdInvitation({ userId, email, token })
    return NextResponse.json(membership, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invitation is invalid' }, { status: 400 })
  }
}