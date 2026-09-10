export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { assertImmutableCreator, HouseholdAccessError, requireHouseholdCapability } from '@/lib/household'

const errorResponse = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: error instanceof HouseholdAccessError ? error.status : 400 })
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const parsedDate = (value: unknown) => { if (value === null || value === '') return null; const d = new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error('Invalid date'); return d }

async function existing(type: string, id: string, householdId: string) {
  if (type === 'recipe') return prisma.householdRecipe.findFirst({ where: { id, householdId } })
  if (type === 'inventory') return prisma.householdFoodInventory.findFirst({ where: { id, householdId } })
  if (type === 'mealPlan') return prisma.householdMealPlan.findFirst({ where: { id, householdId } })
  if (type === 'shoppingEntry') return prisma.householdShoppingListEntry.findFirst({ where: { id, householdId } })
  throw new Error('Unknown kitchen resource type')
}

export async function PATCH(request: Request, { params }: { params: Promise<{ householdId: string; resourceType: string; resourceId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, resourceType, resourceId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'update')
    const body = await request.json()
    const old: any = await existing(resourceType, resourceId, householdId)
    if (!old) throw new HouseholdAccessError('Kitchen resource not found', 404)
    assertImmutableCreator(old.createdById, body.createdById)
    const result = await prisma.$transaction(async tx => {
      let value: any
      let action: any
      if (resourceType === 'recipe') {
        if (body.ingredients !== undefined && !Array.isArray(body.ingredients)) throw new Error('Ingredients must be an array')
        await tx.householdRecipe.update({
          where: { id: resourceId },
          data: {
            name: body.name === undefined ? old.name : text(body.name),
            description: body.description === undefined ? old.description : text(body.description),
            instructions: body.instructions === undefined ? old.instructions : text(body.instructions),
            servings: body.servings === undefined ? old.servings : body.servings,
            prepMinutes: body.prepMinutes === undefined ? old.prepMinutes : body.prepMinutes,
            cookMinutes: body.cookMinutes === undefined ? old.cookMinutes : body.cookMinutes,
            notes: body.notes === undefined ? old.notes : text(body.notes),
          },
        })
        let ingredientChanges: Prisma.InputJsonObject | undefined
        if (body.ingredients !== undefined) {
          const before = await tx.householdRecipeIngredient.findMany({
            where: { householdId, recipeId: resourceId },
          })
          const byId = new Map(before.map((ingredient) => [ingredient.id, ingredient]))
          const retainedIds = new Set<string>()
          const createdIds: string[] = []
          for (const [index, item] of body.ingredients.entries()) {
            const name = text(item.name)
            if (!name) throw new Error('Ingredient name is required')
            if (item.id) {
              const current = byId.get(String(item.id))
              if (!current) throw new HouseholdAccessError('Ingredient not found in this recipe', 400)
              assertImmutableCreator(current.createdById, item.createdById)
              if (retainedIds.has(current.id)) throw new Error('Ingredient IDs must be unique')
              retainedIds.add(current.id)
              await tx.householdRecipeIngredient.update({
                where: { id: current.id },
                data: {
                  name,
                  quantity: item.quantity === undefined ? current.quantity : item.quantity,
                  unit: item.unit === undefined ? current.unit : text(item.unit),
                  notes: item.notes === undefined ? current.notes : text(item.notes),
                  sortOrder: item.sortOrder ?? index,
                },
              })
            } else {
              const created = await tx.householdRecipeIngredient.create({
                data: {
                  householdId,
                  recipeId: resourceId,
                  createdById: userId,
                  name,
                  quantity: item.quantity ?? null,
                  unit: text(item.unit),
                  notes: text(item.notes),
                  sortOrder: item.sortOrder ?? index,
                },
              })
              retainedIds.add(created.id)
              createdIds.push(created.id)
            }
          }
          const removed = before.filter((ingredient) => !retainedIds.has(ingredient.id))
          if (removed.length) {
            await tx.householdRecipeIngredient.deleteMany({
              where: { recipeId: resourceId, id: { in: removed.map((ingredient) => ingredient.id) } },
            })
          }
          ingredientChanges = {
            createdIds,
            retainedIds: [...retainedIds].filter((id) => byId.has(id)),
            removed: removed.map(({ id, createdById, name }) => ({ id, createdById, name })),
          }
        }
        value = await tx.householdRecipe.findUniqueOrThrow({
          where: { id: resourceId },
          include: { ingredients: { orderBy: { sortOrder: 'asc' } } },
        })
        action = 'recipe_updated'
        await tx.householdAuditRecord.create({
          data: {
            householdId,
            actorUserId: userId,
            action,
            resourceType,
            resourceId,
            metadata: ingredientChanges ? { ingredientChanges } : undefined,
          },
        })
      } else if (resourceType === 'inventory') {
        if (body.location !== undefined && !['pantry', 'fridge', 'freezer'].includes(body.location)) throw new Error('Invalid food location')
        value = await tx.householdFoodInventory.update({ where: { id: resourceId }, data: { name: body.name === undefined ? old.name : text(body.name), location: body.location ?? old.location, quantity: body.quantity ?? old.quantity, unit: body.unit === undefined ? old.unit : text(body.unit), expiresAt: body.expiresAt === undefined ? old.expiresAt : parsedDate(body.expiresAt), notes: body.notes === undefined ? old.notes : text(body.notes) } }); action = 'food_inventory_updated'
      } else if (resourceType === 'mealPlan') {
        if (body.recipeId && !await tx.householdRecipe.findFirst({ where: { id: body.recipeId, householdId } })) throw new Error('Recipe not found')
        value = await tx.householdMealPlan.update({ where: { id: resourceId }, data: { recipeId: body.recipeId === undefined ? old.recipeId : body.recipeId, title: body.title === undefined ? old.title : text(body.title), plannedFor: body.plannedFor === undefined ? old.plannedFor : parsedDate(body.plannedFor)!, mealType: body.mealType === undefined ? old.mealType : text(body.mealType), servings: body.servings === undefined ? old.servings : body.servings, notes: body.notes === undefined ? old.notes : text(body.notes) } }); action = 'meal_plan_updated'
      } else {
        value = await tx.householdShoppingListEntry.update({ where: { id: resourceId }, data: { name: body.name === undefined ? old.name : text(body.name), quantity: body.quantity === undefined ? old.quantity : body.quantity, unit: body.unit === undefined ? old.unit : text(body.unit), checked: body.checked === undefined ? old.checked : Boolean(body.checked), notes: body.notes === undefined ? old.notes : text(body.notes) } }); action = 'shopping_entry_updated'
      }
      if (resourceType !== 'recipe') {
        await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action, resourceType, resourceId } })
      }
      return value
    })
    return NextResponse.json(result)
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ householdId: string; resourceType: string; resourceId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const { householdId, resourceType, resourceId } = await params
  try {
    await requireHouseholdCapability(userId, householdId, 'delete')
    const old: any = await existing(resourceType, resourceId, householdId)
    if (!old) throw new HouseholdAccessError('Kitchen resource not found', 404)
    await prisma.$transaction(async tx => {
      if (resourceType === 'recipe') await tx.householdRecipe.delete({ where: { id: resourceId } })
      else if (resourceType === 'inventory') await tx.householdFoodInventory.delete({ where: { id: resourceId } })
      else if (resourceType === 'mealPlan') await tx.householdMealPlan.delete({ where: { id: resourceId } })
      else await tx.householdShoppingListEntry.delete({ where: { id: resourceId } })
      const action: any = resourceType === 'recipe' ? 'recipe_deleted' : resourceType === 'inventory' ? 'food_inventory_deleted' : resourceType === 'mealPlan' ? 'meal_plan_deleted' : 'shopping_entry_deleted'
      await tx.householdAuditRecord.create({ data: { householdId, actorUserId: userId, action, resourceType, resourceId, metadata: { creatorUserId: old.createdById, name: old.name ?? old.title } } })
    })
    return NextResponse.json({ deleted: true })
  } catch (error) { return errorResponse(error) }
}