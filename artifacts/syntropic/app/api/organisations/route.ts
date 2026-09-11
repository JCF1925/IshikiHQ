export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

type OrganisationBody = Record<string, unknown>
type BodyValue = { value: string | null } | { error: string }

function readBodyValue(body: OrganisationBody, field: string, required = false): BodyValue {
  const value = body[field]
  if (value === undefined || value === null) {
    return required ? { error: `${field} is required` } : { value: null }
  }
  if (typeof value !== 'string') return { error: `${field} must be text` }
  const trimmed = value.trim()
  if (required && !trimmed) return { error: `${field} is required` }
  return { value: trimmed || null }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const organisations = await prisma.organisation.findMany({
    where: { userId },
    include: { _count: { select: { people: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(organisations)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const body = await request.json().catch(() => null) as OrganisationBody | null

  if (!body || Array.isArray(body) || typeof body !== 'object') {
    return NextResponse.json({ error: 'Practice details must be a JSON object' }, { status: 400 })
  }

  const name = readBodyValue(body, 'name', true)
  if ('error' in name) return NextResponse.json({ error: name.error }, { status: 400 })
  if (!name.value) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const fields = ['type', 'address', 'phone', 'website', 'notes', 'medicarePracticeIdentifier']
  const values: Record<string, { value: string | null }> = {}
  for (const field of fields) {
    const result = readBodyValue(body, field)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    values[field] = result
  }

  const organisation = await prisma.organisation.create({
    data: {
      userId,
      name: name.value,
      type: values.type.value,
      address: values.address.value,
      phone: values.phone.value,
      website: values.website.value,
      notes: values.notes.value,
      medicarePracticeIdentifier: values.medicarePracticeIdentifier.value,
    },
  })
  return NextResponse.json(organisation, { status: 201 })
}
