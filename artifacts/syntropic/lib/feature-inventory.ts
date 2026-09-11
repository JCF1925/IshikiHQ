import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'csv/sync'

export type FeatureInventoryRow = {
  module: string
  submodule: string
  feature: string
  surface: string
  routeOrSource: string
  notes: string
}

type CsvFeatureInventoryRow = Record<string, string | undefined>

const inventoryPath = path.join(
  process.cwd(),
  'docs',
  'ishiki-module-feature-inventory.csv',
)

export function getFeatureInventory(): FeatureInventoryRow[] {
  const csv = readFileSync(inventoryPath, 'utf8')
  const rows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as CsvFeatureInventoryRow[]

  return rows.map((row) => ({
    module: row.Module ?? '',
    submodule: row.Submodule ?? '',
    feature: row['Feature/Function'] ?? '',
    surface: row.Surface ?? '',
    routeOrSource: row['Route or Source'] ?? '',
    notes: row.Notes ?? '',
  }))
}