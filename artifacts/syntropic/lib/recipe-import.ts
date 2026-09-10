import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const MAX_RECIPE_IMAGE_BYTES = 8 * 1024 * 1024
export const RECIPE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type RecipeImportPreview = {
  name: string
  ingredients: string[]
  instructions: string
  prepMinutes: number | null
  cookMinutes: number | null
  confidence: Record<'name' | 'ingredients' | 'instructions' | 'timing', 'high' | 'medium' | 'low'>
  warnings: string[]
  sourceType: 'url' | 'image'
}

const privateIpv4 = (address: string) => {
  const parts = address.split('.').map(Number)
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0
}

const unsafeAddress = (address: string) => {
  if (isIP(address) === 4) return privateIpv4(address)
  const normalized = address.toLowerCase()
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
}

export async function validatePublicRecipeUrl(value: unknown) {
  let url: URL
  try {
    url = new URL(String(value ?? ''))
  } catch {
    throw new Error('Enter a valid recipe URL')
  }
  if (url.protocol !== 'https:') throw new Error('Recipe links must use HTTPS')
  if (url.username || url.password || url.port) throw new Error('Recipe links cannot include credentials or a custom port')
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => unsafeAddress(address))) throw new Error('Recipe link must use a public website')
  return url
}

const minutes = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  const match = String(value ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?/i)
  return match ? Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) : null
}

const instructionText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value.map((item) => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object' && 'text' in item) return String(item.text).trim()
    if (item && typeof item === 'object' && 'itemListElement' in item) return instructionText(item.itemListElement)
    return ''
  }).filter(Boolean).join('\n')
}

function findRecipe(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipe(item)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
    if (types.some((type) => String(type).toLowerCase() === 'recipe')) return record
    if (record['@graph']) return findRecipe(record['@graph'])
  }
  return null
}

export function normalizeRecipePreview(
  raw: Record<string, unknown>,
  sourceType: 'url' | 'image',
): RecipeImportPreview {
  const name = String(raw.name ?? raw.title ?? '').trim()
  const ingredientsValue = raw.recipeIngredient ?? raw.ingredients
  const ingredients = (Array.isArray(ingredientsValue) ? ingredientsValue : String(ingredientsValue ?? '').split('\n'))
    .map(String).map((item) => item.trim()).filter(Boolean).slice(0, 100)
  const instructions = instructionText(raw.recipeInstructions ?? raw.instructions).slice(0, 20_000)
  const prepMinutes = minutes(raw.prepMinutes ?? raw.prepTime)
  const cookMinutes = minutes(raw.cookMinutes ?? raw.cookTime)
  const warnings: string[] = []
  if (!name) warnings.push('Recipe title is missing')
  if (!ingredients.length) warnings.push('Ingredients are missing')
  if (!instructions) warnings.push('Instructions are missing')
  if (prepMinutes === null && cookMinutes === null) warnings.push('Timing could not be identified')
  const confidence = {
    name: name ? 'high' : 'low',
    ingredients: ingredients.length >= 2 ? 'high' : ingredients.length ? 'medium' : 'low',
    instructions: instructions.length >= 20 ? 'high' : instructions ? 'medium' : 'low',
    timing: prepMinutes !== null || cookMinutes !== null ? 'high' : 'low',
  } as const
  return { name, ingredients, instructions, prepMinutes, cookMinutes, confidence, warnings, sourceType }
}

export async function extractRecipeFromUrl(value: unknown) {
  const url = await validatePublicRecipeUrl(value)
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'IshikiRecipeImporter/1.0' },
  })
  if (!response.ok) throw new Error('The recipe page could not be opened')
  const type = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('Recipe link must point to a web page')
  const declaredSize = Number(response.headers.get('content-length') ?? 0)
  if (declaredSize > 2_000_000) throw new Error('Recipe page is too large to import')
  const html = (await response.text()).slice(0, 2_000_001)
  if (html.length > 2_000_000) throw new Error('Recipe page is too large to import')
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of scripts) {
    try {
      const recipe = findRecipe(JSON.parse(match[1]))
      if (recipe) return normalizeRecipePreview(recipe, 'url')
    } catch {
      // Other JSON-LD blocks may still be valid.
    }
  }
  throw new Error('No structured recipe was found on this page')
}

function parseAiJson(value: string) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as Record<string, unknown>
}

export function parseRecipeCardText(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const ingredientHeading = lines.findIndex((line) => /^ingredients?\s*:?\s*$/i.test(line))
  const instructionHeading = lines.findIndex((line) => /^(?:instructions?|directions?|method)\s*:?\s*$/i.test(line))
  const titleEnd = [ingredientHeading, instructionHeading].filter((index) => index > 0).sort((a, b) => a - b)[0] ?? 1
  const name = lines.slice(0, titleEnd)
    .filter((line) => !/^(?:prep(?:aration)?|cook(?:ing)?|total)(?:\s+time)?\s*:/i.test(line))
    .join(' ').slice(0, 200)
  const ingredientStart = ingredientHeading >= 0 ? ingredientHeading + 1 : 1
  const ingredientEnd = instructionHeading > ingredientStart ? instructionHeading : ingredientStart
  const ingredients = lines.slice(ingredientStart, ingredientEnd)
  const instructions = instructionHeading >= 0 ? lines.slice(instructionHeading + 1).join('\n') : ''
  const prep = value.match(/prep(?:aration)?(?:\s+time)?\s*:?\s*(\d+)\s*(?:min|minute)/i)
  const cook = value.match(/cook(?:ing)?(?:\s+time)?\s*:?\s*(\d+)\s*(?:min|minute)/i)
  return normalizeRecipePreview({
    name,
    ingredients,
    instructions,
    prepMinutes: prep ? Number(prep[1]) : null,
    cookMinutes: cook ? Number(cook[1]) : null,
  }, 'image')
}

async function extractRecipeWithLocalOcr(file: File) {
  const directory = await mkdtemp(join(tmpdir(), 'ishiki-recipe-'))
  const input = join(directory, `card.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`)
  try {
    await writeFile(input, new Uint8Array(await file.arrayBuffer()))
    const { stdout } = await promisify(execFile)('tesseract', [input, 'stdout', '--psm', '6'], {
      timeout: 30_000,
      maxBuffer: 512 * 1024,
    })
    if (!stdout.trim()) throw new Error('The recipe photo did not contain readable text')
    return parseRecipeCardText(stdout)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function extractRecipeFromImage(file: File) {
  if (!RECIPE_IMAGE_TYPES.has(file.type)) throw new Error('Recipe photo must be a JPEG, PNG, or WebP image')
  if (!file.size || file.size > MAX_RECIPE_IMAGE_BYTES) throw new Error('Recipe photo must be between 1 byte and 8 MB')
  const header = new Uint8Array((await file.slice(0, 12).arrayBuffer()))
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
  const isWebp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP'
  if ((file.type === 'image/jpeg' && !isJpeg) || (file.type === 'image/png' && !isPng) || (file.type === 'image/webp' && !isWebp)) {
    throw new Error('Recipe photo content does not match its file format')
  }
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  if (!baseUrl || !apiKey) {
    try {
      return await extractRecipeWithLocalOcr(file)
    } catch {
      throw new Error('The recipe photo could not be read')
    }
  }
  const image = Buffer.from(await file.arrayBuffer()).toString('base64')
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      max_completion_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Extract only the recipe visible in this photographed recipe card. Return JSON with name, ingredients (string array), instructions, prepMinutes, cookMinutes. Use null for unknown times and empty values for unreadable fields. Do not invent content.' },
          { type: 'image_url', image_url: { url: `data:${file.type};base64,${image}` } },
        ],
      }],
    }),
  })
  if (!response.ok) {
    try {
      return await extractRecipeWithLocalOcr(file)
    } catch {
      throw new Error('The recipe photo could not be read')
    }
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = result.choices?.[0]?.message?.content
  if (!content) throw new Error('The recipe photo did not contain readable recipe details')
  try {
    return normalizeRecipePreview(parseAiJson(content), 'image')
  } catch {
    throw new Error('The recipe photo could not be converted into a reviewable recipe')
  }
}