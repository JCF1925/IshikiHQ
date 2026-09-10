export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'
import { extractRecipeFromImage, extractRecipeFromUrl } from '@/lib/recipe-import'

const errorResponse = (error: unknown) => NextResponse.json(
  { error: error instanceof Error ? error.message : 'Recipe extraction failed' },
  { status: error instanceof HouseholdAccessError ? error.status : 400 },
)

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = await request.json()
      if (body.sourceType !== 'url') throw new Error('Choose a recipe link or photo')
      return NextResponse.json(await extractRecipeFromUrl(body.url))
    }
    if (!contentType.includes('multipart/form-data')) throw new Error('Choose a recipe link or photo')
    const form = await request.formData() as unknown as { get(name: string): FormDataEntryValue | null }
    if (form.get('sourceType') !== 'image') throw new Error('Choose a recipe link or photo')
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('Choose a recipe photo')
    return NextResponse.json(await extractRecipeFromImage(file))
  } catch (error) {
    return errorResponse(error)
  }
}