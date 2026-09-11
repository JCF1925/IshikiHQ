export const STORAGE_LABEL_LAYOUT_IDS = [
  'plain',
  'avery-5160',
  'avery-l7163',
  'avery-l7160',
] as const

export type StorageLabelLayoutId = (typeof STORAGE_LABEL_LAYOUT_IDS)[number]

export function isStorageLabelLayoutId(value: unknown): value is StorageLabelLayoutId {
  return typeof value === 'string'
    && (STORAGE_LABEL_LAYOUT_IDS as readonly string[]).includes(value)
}

export function normalizeStorageLabelLayoutId(value: unknown): StorageLabelLayoutId {
  return isStorageLabelLayoutId(value) ? value : 'plain'
}