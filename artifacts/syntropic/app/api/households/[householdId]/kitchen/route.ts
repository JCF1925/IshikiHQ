export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'
import { validatePublicRecipeUrl } from '@/lib/recipe-import'

const errorResponse = (error: unknown) => NextResponse.json(
  { error: error instanceof Error ? error.message : 'Invalid request' },
  { status: error instanceof HouseholdAccessError ? error.status : 400 },
)
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const recipeImport = async (body: Record<string, any>) => {
  if (body.importMethod === undefined && body.sourceUrl === undefined) return null
  if (!['url', 'image'].includes(body.importMethod)) throw new Error('Recipe import method must be url or image')
  const sourceUrl = text(body.sourceUrl)
  if (body.importMethod === 'image' && sourceUrl) throw new Error('Photo imports cannot include a source URL')
  if (sourceUrl && body.importMethod !== 'url') throw new Error('A source URL requires a link import')
  return {
    importMethod: body.importMethod as 'url' | 'image',
    sourceUrl: sourceUrl ? (await validatePublicRecipeUrl(sourceUrl)).toString() : null,
  }
}
const date = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = new Date(String(value))
  if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid date')
  return parsed
}

export async function GET(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { householdId } = await params
  try {
    await requireHouseholdCapability((session.user as any).id, householdId, 'read')
    const q = new URL(request.url).searchParams.get('q')?.trim()
    const contains = q ? { contains: q, mode: 'insensitive' as const } : undefined
    const [recipes, inventory, mealPlans, shoppingList] = await Promise.all([
      prisma.householdRecipe.findMany({ where: { householdId, ...(contains ? { OR: [{ name: contains }, { description: contains }, { ingredients: { some: { name: contains } } }] } : {}) }, include: { ingredients: { orderBy: { sortOrder: 'asc' } } }, orderBy: { name: 'asc' } }),
      prisma.householdFoodInventory.findMany({ where: { householdId, ...(contains ? { OR: [{ name: contains }, { notes: contains }] } : {}) }, orderBy: [{ expiresAt: 'asc' }, { name: 'asc' }] }),
      prisma.householdMealPlan.findMany({ where: { householdId, ...(contains ? { OR: [{ title: contains }, { notes: contains }] } : {}) }, include: { recipe: { include: { ingredients: { orderBy: { sortOrder: 'asc' } } } } }, orderBy: { plannedFor: 'asc' } }),
      prisma.householdShoppingListEntry.findMany({ where: { householdId, ...(contains ? { OR: [{ name: contains }, { notes: contains }] } : {}) }, orderBy: [{ checked: 'asc' }, { createdAt: 'desc' }] }),
    ])
    return NextResponse.json({ recipes, inventory, mealPlans, shoppingList })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request, { params }: { params: Promise<{ householdId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'create')
    const body = await request.json()
    const resourceType = String(body.resourceType ?? '')
    const value = await prisma.$transaction(async tx => {
      let created: any
      let action: any
      if (resourceType === 'recipe') {
        if (!text(body.name)) throw new Error('Recipe name is required')
        if (body.ingredients !== undefined && !Array.isArray(body.ingredients)) throw new Error('Ingredients must be an array')
         const source = await recipeImport(body)
         created = await tx.householdRecipe.create({ data: { householdId, createdById: userId, name: text(body.name)!, description: text(body.description), instructions: text(body.instructions), servings: body.servings ?? null, prepMinutes: body.prepMinutes ?? null, cookMinutes: body.cookMinutes ?? null, notes: text(body.notes), sourceUrl: source?.sourceUrl ?? null, importMethod: source?.importMethod ?? null, ingredients: { create: (body.ingredients ?? []).map((item: any, index: number) => { if (!text(item.name)) throw new Error('Ingredient name is required'); return { householdId, createdById: userId, name: text(item.name)!, quantity: item.quantity ?? null, unit: text(item.unit), notes: text(item.notes), sortOrder: item.sortOrder ?? index } }) } }, include: { ingredients: { orderBy: { sortOrder: 'asc' } } } })
        action = 'recipe_created'
      } else if (resourceType === 'inventory') {
        if (!text(body.name) || !['pantry', 'fridge', 'freezer'].includes(body.location)) throw new Error('Name and pantry, fridge, or freezer location are required')
        created = await tx.householdFoodInventory.create({ data: { householdId, createdById: userId, name: text(body.name)!, location: body.location, quantity: body.quantity ?? 0, unit: text(body.unit), expiresAt: date(body.expiresAt), notes: text(body.notes) } })
        action = 'food_inventory_created'
      } else if (resourceType === 'mealPlan') {
        if (!text(body.title) || !body.plannedFor) throw new Error('Title and plannedFor are required')
        if (body.recipeId && !await tx.householdRecipe.findFirst({ where: { id: body.recipeId, householdId } })) throw new Error('Recipe not found')
        created = await tx.householdMealPlan.create({ data: { householdId, createdById: userId, recipeId: body.recipeId ?? null, title: text(body.title)!, plannedFor: date(body.plannedFor)!, mealType: text(body.mealType), servings: body.servings ?? null, notes: text(body.notes) } })
        action = 'meal_plan_created'
      } else if (resourceType === 'shoppingEntry') {
        if (!text(body.name)) throw new Error('Shopping entry name is required')
        created = await tx.householdShoppingListEntry.create({ data: { householdId, createdById: userId, name: text(body.name)!, quantity: body.quantity ?? null, unit: text(body.unit), checked: Boolean(body.checked), notes: text(body.notes) } })
        action = 'shopping_entry_created'
      } else throw new Error('resourceType must be recipe, inventory, mealPlan, or shoppingEntry')
       await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action, resourceType, resourceId: created.id, metadata: resourceType === 'recipe' && created.importMethod ? { importMethod: created.importMethod, sourceUrl: created.sourceUrl } : undefined } })
      return created
    })
    return NextResponse.json(value, { status: 201 })
  } catch (error) { return errorResponse(error) }
}