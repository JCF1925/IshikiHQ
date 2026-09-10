import { test, expect, type Page, type Route } from '@playwright/test'

const authorizedHouseholdId = 'household-recipe-owner'
const unauthorizedHouseholdId = 'household-other-family'
const fixtureRecipeUrl = 'https://recipes.example.test/family-pasta'

type Recipe = {
  id: string
  name: string
  ingredients: Array<{ id: string; name: string }>
  instructions: string
  prepMinutes: number
  cookMinutes: number
}

type RouteMode = 'authorized' | 'unauthorized' | 'failed'

type KitchenRouteState = {
  importRequests: Array<{ householdId: string; url: string }>
  saveRequests: Array<{ householdId: string; body: Record<string, unknown> }>
  savedRecipe: Recipe | null
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installKitchenRoutes(page: Page, mode: RouteMode): Promise<KitchenRouteState> {
  const householdId = mode === 'unauthorized' ? unauthorizedHouseholdId : authorizedHouseholdId
  const state: KitchenRouteState = {
    importRequests: [],
    saveRequests: [],
    savedRecipe: null,
  }

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const { pathname } = requestUrl
    const method = route.request().method()

    if (pathname === '/api/households' && method === 'GET') {
      await json(route, 200, {
        contexts: [
          { kind: 'private', id: 'private', name: 'Private' },
          {
            kind: 'household',
            id: householdId,
            membershipId: `${householdId}-membership`,
            name: mode === 'unauthorized' ? 'Other family' : 'Recipe family',
            role: mode === 'unauthorized' ? 'viewer' : 'member',
          },
        ],
      })
      return
    }

    if (pathname === `/api/households/${householdId}/kitchen` && method === 'GET') {
      await json(route, 200, {
        recipes: state.savedRecipe ? [state.savedRecipe] : [],
        inventory: [],
        mealPlans: [],
        shoppingList: [],
      })
      return
    }

    if (pathname === `/api/households/${householdId}/kitchen/import` && method === 'POST') {
      const body = route.request().postDataJSON() as { sourceType?: string; url?: string }
      state.importRequests.push({ householdId, url: body.url ?? '' })

      if (mode === 'unauthorized') {
        await json(route, 403, { error: 'You do not have permission to create recipes in this household' })
        return
      }
      if (mode === 'failed') {
        await json(route, 400, { error: 'No structured recipe was found on this page' })
        return
      }

      await json(route, 200, {
        name: 'Family Pasta',
        ingredients: ['300 g pasta', '2 cups tomato sauce'],
        instructions: 'Boil the pasta and stir through the sauce.',
        prepMinutes: 10,
        cookMinutes: 15,
        confidence: { name: 'high', ingredients: 'high', instructions: 'high', timing: 'high' },
        warnings: [],
        sourceType: 'url',
      })
      return
    }

    if (pathname === `/api/households/${householdId}/kitchen` && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      state.saveRequests.push({ householdId, body })

      if (mode === 'unauthorized') {
        await json(route, 403, { error: 'You do not have permission to create recipes in this household' })
        return
      }

      const ingredients = Array.isArray(body.ingredients)
        ? body.ingredients.map((ingredient, index) => ({
            id: `saved-ingredient-${index + 1}`,
            name: String((ingredient as { name?: unknown }).name ?? ''),
          }))
        : []
      state.savedRecipe = {
        id: 'saved-family-pasta',
        name: String(body.name ?? ''),
        ingredients,
        instructions: String(body.instructions ?? ''),
        prepMinutes: Number(body.prepMinutes ?? 0),
        cookMinutes: Number(body.cookMinutes ?? 0),
      }
      await json(route, 201, state.savedRecipe)
      return
    }

    await route.fallback()
  })

  return state
}

async function openRecipes(page: Page) {
  await page.goto('/kitchen')
  await expect(page.getByRole('heading', { name: 'Kitchen & Meals', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Recipes/ }).click()
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible()
}

test('an authorized household member can edit and confirm an imported recipe', async ({ page }) => {
  const state = await installKitchenRoutes(page, 'authorized')
  await openRecipes(page)

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import a recipe' })
  await expect(importDialog).toBeVisible()
  await importDialog.getByLabel('Recipe URL').fill(fixtureRecipeUrl)

  const importResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/households/${authorizedHouseholdId}/kitchen/import`
    && response.request().method() === 'POST'
  ))
  await importDialog.getByRole('button', { name: 'Prepare preview', exact: true }).click()
  expect((await importResponse).status()).toBe(200)

  const reviewDialog = page.getByRole('dialog', { name: 'Review imported recipe' })
  await expect(reviewDialog).toBeVisible()
  await expect(reviewDialog.getByLabel('Recipe Name')).toHaveValue('Family Pasta')
  await expect(reviewDialog.getByLabel(/Ingredients/)).toHaveValue('300 g pasta\n2 cups tomato sauce')

  await reviewDialog.getByLabel('Recipe Name').fill('Edited family pasta')
  await reviewDialog.getByLabel(/Instructions/).fill('Boil pasta, then stir through the sauce and serve.')

  const saveResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/households/${authorizedHouseholdId}/kitchen`
    && response.request().method() === 'POST'
  ))
  await reviewDialog.getByRole('button', { name: 'Confirm and save recipe', exact: true }).click()
  expect((await saveResponse).status()).toBe(201)

  await expect(page.getByText('Edited family pasta', { exact: true })).toBeVisible()
  expect(state.importRequests).toEqual([{ householdId: authorizedHouseholdId, url: fixtureRecipeUrl }])
  expect(state.saveRequests).toHaveLength(1)
  expect(state.saveRequests[0].body).toMatchObject({
    resourceType: 'recipe',
    name: 'Edited family pasta',
    instructions: 'Boil pasta, then stir through the sauce and serve.',
  })
})

test('a member without access cannot preview or save a recipe into another household', async ({ page }) => {
  const state = await installKitchenRoutes(page, 'unauthorized')
  await openRecipes(page)

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import a recipe' })
  await importDialog.getByLabel('Recipe URL').fill(fixtureRecipeUrl)

  const importResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/households/${unauthorizedHouseholdId}/kitchen/import`
    && response.request().method() === 'POST'
  ))
  await importDialog.getByRole('button', { name: 'Prepare preview', exact: true }).click()
  expect((await importResponse).status()).toBe(403)
  await expect(importDialog.getByRole('alert')).toHaveText('You do not have permission to create recipes in this household')
  await expect(page.getByRole('dialog', { name: 'Review imported recipe' })).toHaveCount(0)

  await importDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New Recipe', exact: true }).click()
  const manualDialog = page.getByRole('dialog', { name: 'Add Recipe' })
  await manualDialog.getByLabel('Recipe Name').fill('Should not be saved')
  await manualDialog.getByLabel(/Ingredients/).fill('1 ingredient')
  await manualDialog.getByLabel(/Instructions/).fill('Do not persist this recipe.')

  const saveResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/households/${unauthorizedHouseholdId}/kitchen`
    && response.request().method() === 'POST'
  ))
  await manualDialog.getByRole('button', { name: 'Save Recipe', exact: true }).click()
  expect((await saveResponse).status()).toBe(403)

  expect(state.importRequests).toHaveLength(1)
  expect(state.saveRequests).toHaveLength(1)
  expect(state.saveRequests[0].householdId).toBe(unauthorizedHouseholdId)
  expect(state.savedRecipe).toBeNull()
  await expect(page.getByText('Should not be saved', { exact: true })).toHaveCount(0)
})

test('a failed extraction shows a safe recovery message without creating a recipe', async ({ page }) => {
  const state = await installKitchenRoutes(page, 'failed')
  await openRecipes(page)

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import a recipe' })
  await importDialog.getByLabel('Recipe URL').fill(fixtureRecipeUrl)

  const importResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/households/${authorizedHouseholdId}/kitchen/import`
    && response.request().method() === 'POST'
  ))
  await importDialog.getByRole('button', { name: 'Prepare preview', exact: true }).click()
  expect((await importResponse).status()).toBe(400)

  await expect(importDialog.getByRole('alert')).toHaveText('No structured recipe was found on this page')
  await expect(page.getByRole('dialog', { name: 'Review imported recipe' })).toHaveCount(0)
  expect(state.saveRequests).toHaveLength(0)
  expect(state.savedRecipe).toBeNull()
  await expect(page.getByText('No recipes yet', { exact: true })).toBeVisible()
})