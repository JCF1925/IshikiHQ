import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { normalizeRecipePreview, parseRecipeCardText, validatePublicRecipeUrl } from '../lib/recipe-import.ts'

test('normalizes structured recipe metadata into an editable preview', () => {
  const preview = normalizeRecipePreview({
    '@type': 'Recipe',
    name: 'Soup',
    recipeIngredient: ['1 onion', '2 cups stock'],
    recipeInstructions: [{ text: 'Simmer until tender.' }],
    prepTime: 'PT10M',
    cookTime: 'PT1H5M',
  }, 'url')
  assert.equal(preview.name, 'Soup')
  assert.deepEqual(preview.ingredients, ['1 onion', '2 cups stock'])
  assert.equal(preview.instructions, 'Simmer until tender.')
  assert.equal(preview.prepMinutes, 10)
  assert.equal(preview.cookMinutes, 65)
  assert.deepEqual(preview.warnings, [])
})

test('marks missing imported recipe fields as low confidence without saving', () => {
  const preview = normalizeRecipePreview({ name: 'Faded card' }, 'image')
  assert.equal(preview.confidence.ingredients, 'low')
  assert.equal(preview.confidence.instructions, 'low')
  assert.equal(preview.confidence.timing, 'low')
  assert.deepEqual(preview.warnings, [
    'Ingredients are missing',
    'Instructions are missing',
    'Timing could not be identified',
  ])
})

test('turns recipe-card OCR text into reviewable fields', () => {
  const preview = parseRecipeCardText(`Tomato Soup
Prep time: 10 minutes
Cook time: 25 minutes
Ingredients
2 tomatoes
1 cup stock
Instructions
Chop tomatoes.
Simmer with stock.`)
  assert.equal(preview.name, 'Tomato Soup')
  assert.deepEqual(preview.ingredients, ['2 tomatoes', '1 cup stock'])
  assert.equal(preview.instructions, 'Chop tomatoes.\nSimmer with stock.')
  assert.equal(preview.prepMinutes, 10)
  assert.equal(preview.cookMinutes, 25)
})

test('rejects malformed and non-HTTPS recipe sources before fetching', async () => {
  await assert.rejects(() => validatePublicRecipeUrl('not a link'), /valid recipe URL/)
  await assert.rejects(() => validatePublicRecipeUrl('http://example.com/recipe'), /must use HTTPS/)
})

test('keeps extraction household-authorized and confirmation separate from persistence', () => {
  const importRoute = readFileSync(new URL('../app/api/households/[householdId]/kitchen/import/route.ts', import.meta.url), 'utf8')
  const kitchenRoute = readFileSync(new URL('../app/api/households/[householdId]/kitchen/route.ts', import.meta.url), 'utf8')
  const kitchenPage = readFileSync(new URL('../app/kitchen/page.tsx', import.meta.url), 'utf8')
  assert.match(importRoute, /requireHouseholdCapability\(userId, householdId, 'create'\)/)
  assert.doesNotMatch(importRoute, /householdRecipe\.create/)
  assert.match(kitchenPage, /Confirm and save recipe/)
  assert.match(kitchenPage, /importMethod: preview\.sourceType/)
  assert.match(kitchenPage, /retainSourceUrl/)
  assert.match(kitchenRoute, /householdRecipe\.create/)
  assert.match(kitchenRoute, /validatePublicRecipeUrl/)
  assert.match(kitchenRoute, /sourceUrl/)
  assert.match(kitchenRoute, /metadata: resourceType === 'recipe' && created\.importMethod/)
  assert.match(kitchenRoute, /householdAuditRecord\.create/)
})