import { readFile } from 'node:fs/promises'
import { parse } from 'csv/sync'

export const featureInventoryHeader = [
  'Module',
  'Submodule',
  'Feature/Function',
  'Surface',
  'Route or Source',
  'Notes',
]

const routeLiteralPattern = /\bhref\s*(?::|=)\s*(?:\{\s*)?['"]([^'"]+)['"]/g

export function extractSidebarRoutes(sidebarSource) {
  return new Set(
    [...sidebarSource.matchAll(routeLiteralPattern)]
      .map((match) => match[1].trim())
      .filter((route) => route.startsWith('/')),
  )
}

function parseInventoryRows(inventoryText) {
  try {
    return {
      rows: parse(inventoryText, {
        bom: true,
        skip_empty_lines: false,
        relax_column_count: true,
      }),
      errors: [],
    }
  } catch (error) {
    return {
      rows: [],
      errors: [`CSV parse error: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

function formatRouteList(routes) {
  return routes.length > 0 ? routes.join(', ') : 'none'
}

export function checkFeatureInventory({ inventoryText, sidebarSource }) {
  const parsed = parseInventoryRows(inventoryText)
  const errors = [...parsed.errors]
  const rows = parsed.rows
  const header = rows[0]

  if (!header || header.length !== featureInventoryHeader.length ||
      header.some((value, index) => value !== featureInventoryHeader[index])) {
    errors.push(`CSV header must be: ${featureInventoryHeader.join(',')}`)
  }

  const webRoutes = new Set()
  for (const [index, row] of rows.slice(1).entries()) {
    const lineNumber = index + 2
    if (!Array.isArray(row) || row.length !== featureInventoryHeader.length) {
      errors.push(`CSV row ${lineNumber} must contain exactly ${featureInventoryHeader.length} columns`)
      continue
    }

    const blankColumns = row
      .map((value, columnIndex) => (typeof value === 'string' && value.trim() ? null : featureInventoryHeader[columnIndex]))
      .filter(Boolean)
    if (blankColumns.length > 0) {
      errors.push(`CSV row ${lineNumber} has blank columns: ${blankColumns.join(', ')}`)
    }

    if (row[3]?.trim() === 'Web') {
      for (const source of row[4].split(';')) {
        const route = source.trim()
        if (route.startsWith('/')) webRoutes.add(route)
      }
    }
  }

  const sidebarRoutes = extractSidebarRoutes(sidebarSource)
  const missingRoutes = [...sidebarRoutes].filter((route) => !webRoutes.has(route)).sort()
  const staleRoutes = [...webRoutes].filter((route) => !sidebarRoutes.has(route)).sort()

  return {
    errors,
    missingRoutes,
    staleRoutes,
    message: [
      ...errors.map((error) => `Feature inventory error: ${error}`),
      `Missing routes: ${formatRouteList(missingRoutes)}`,
      `Stale routes: ${formatRouteList(staleRoutes)}`,
    ].join('\n'),
  }
}

async function runFeatureInventoryCheck() {
  const [inventoryText, sidebarSource] = await Promise.all([
    readFile('docs/ishiki-module-feature-inventory.csv', 'utf8'),
    readFile('components/app-sidebar.tsx', 'utf8'),
  ])
  const result = checkFeatureInventory({ inventoryText, sidebarSource })
  if (result.errors.length > 0 || result.missingRoutes.length > 0 || result.staleRoutes.length > 0) {
    console.error(result.message)
    process.exitCode = 1
  } else {
    console.log('Feature inventory is valid and matches visible web navigation routes.')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFeatureInventoryCheck()
}