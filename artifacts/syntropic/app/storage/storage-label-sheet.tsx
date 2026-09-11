'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { AlertTriangle, Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GeneratedStorageLabel, StorageLabelSelection } from '@/hooks/use-storage'
import { isStorageLabelLayoutId, normalizeStorageLabelLayoutId, STORAGE_LABEL_LAYOUT_IDS, type StorageLabelLayoutId } from '@/lib/storage-label-layout'

type SelectedRecord = StorageLabelSelection & { name: string }
type LabelLayoutId = StorageLabelLayoutId

type LabelLayout = {
  id: LabelLayoutId
  name: string
  description: string
  pageSize: 'letter' | 'a4'
  pageWidth: string
  pageHeight: string
  pagePadding: string
  labelWidth: string
  labelHeight: string
  columnGap: string
  rowGap: string
  columns: number
  labelsPerPage: number
  qrSize: string
  labelPadding: string
  textSize: string
  mode: 'standard' | 'compact'
}

const LABEL_LAYOUTS: Record<LabelLayoutId, LabelLayout> = {
  plain: {
    id: 'plain',
    name: 'Plain paper',
    description: 'Letter paper with a roomy, scan-friendly grid',
    pageSize: 'letter',
    pageWidth: '8.5in',
    pageHeight: '11in',
    pagePadding: '0.5in 0.45in',
    labelWidth: '2.35in',
    labelHeight: '2.25in',
    columnGap: '0.2in',
    rowGap: '0.2in',
    columns: 3,
    labelsPerPage: 12,
    qrSize: '1.1in',
    labelPadding: '0.1in',
    textSize: '11pt',
    mode: 'standard',
  },
  'avery-5160': {
    id: 'avery-5160',
    name: 'Avery 5160 / 8160',
    description: 'US Letter, 30 labels (2.625 × 1 in)',
    pageSize: 'letter',
    pageWidth: '8.5in',
    pageHeight: '11in',
    pagePadding: '0.5in 0.1875in',
    labelWidth: '2.625in',
    labelHeight: '1in',
    columnGap: '0.125in',
    rowGap: '0in',
    columns: 3,
    labelsPerPage: 30,
    qrSize: '0.72in',
    labelPadding: '0.04in',
    textSize: '8.5pt',
    mode: 'compact',
  },
  'avery-l7163': {
    id: 'avery-l7163',
    name: 'Avery L7163',
    description: 'A4, 14 labels (99.1 × 38.1 mm)',
    pageSize: 'a4',
    pageWidth: '210mm',
    pageHeight: '297mm',
    pagePadding: '15.1mm 4.7mm',
    labelWidth: '99.1mm',
    labelHeight: '38.1mm',
    columnGap: '2mm',
    rowGap: '0mm',
    columns: 2,
    labelsPerPage: 14,
    qrSize: '0.82in',
    labelPadding: '1.5mm',
    textSize: '9pt',
    mode: 'compact',
  },
  'avery-l7160': {
    id: 'avery-l7160',
    name: 'Avery L7160',
    description: 'A4, 21 labels (63.5 × 38.1 mm)',
    pageSize: 'a4',
    pageWidth: '210mm',
    pageHeight: '297mm',
    pagePadding: '15.1mm 6mm',
    labelWidth: '63.5mm',
    labelHeight: '38.1mm',
    columnGap: '1.5mm',
    rowGap: '0mm',
    columns: 3,
    labelsPerPage: 21,
    qrSize: '0.76in',
    labelPadding: '1.5mm',
    textSize: '8.5pt',
    mode: 'compact',
  },
}

function splitIntoPages<T>(items: T[], pageSize: number) {
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize))
  }
  return pages
}

export function StorageLabelSheet({
  open,
  onOpenChange,
  selected,
  generateLabels,
  preparedLabels,
  householdId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: SelectedRecord[]
  generateLabels: (selections: StorageLabelSelection[]) => Promise<GeneratedStorageLabel[]>
  preparedLabels?: GeneratedStorageLabel[] | null
  householdId: string
}) {
  const [drafts, setDrafts] = useState<SelectedRecord[]>([])
  const [labels, setLabels] = useState<GeneratedStorageLabel[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [layoutId, setLayoutId] = useState<LabelLayoutId>('plain')
  const [preferenceLoading, setPreferenceLoading] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const [preferenceSaved, setPreferenceSaved] = useState(false)

  const layout = LABEL_LAYOUTS[layoutId]
  const labelPages = splitIntoPages(labels, layout.labelsPerPage)
  const printVariables = {
    '--sheet-page-width': layout.pageWidth,
    '--sheet-page-height': layout.pageHeight,
    '--sheet-padding': layout.pagePadding,
    '--label-width': layout.labelWidth,
    '--label-height': layout.labelHeight,
    '--label-column-gap': layout.columnGap,
    '--label-row-gap': layout.rowGap,
    '--label-columns': layout.columns,
    '--label-qr-size': layout.qrSize,
    '--label-padding': layout.labelPadding,
    '--label-text-size': layout.textSize,
  } as CSSProperties

  useEffect(() => {
    if (!open) return
    setDrafts(selected.map((record) => ({ ...record, displayText: record.displayText || record.name })))
    setLabels(preparedLabels ?? [])
    setError('')
    setPreferenceError('')
    setPreferenceSaved(false)
    setPreferenceLoading(true)
    void (async () => {
      try {
        const response = await fetch(`/api/households/${householdId}/storage/label-sheet`)
        const result = await response.json().catch(() => null)
        if (!response.ok) throw new Error(result?.error || 'The saved label sheet could not be loaded.')
        setLayoutId(normalizeStorageLabelLayoutId(result?.layoutId))
      } catch (cause) {
        setLayoutId('plain')
        setPreferenceError(cause instanceof Error ? cause.message : 'The saved label sheet could not be loaded.')
      } finally {
        setPreferenceLoading(false)
      }
    })()
  }, [open, selected, preparedLabels, householdId])

  const savePreference = async () => {
    setPreferenceBusy(true)
    setPreferenceError('')
    setPreferenceSaved(false)
    try {
      const response = await fetch(`/api/households/${householdId}/storage/label-sheet`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutId }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'The label sheet preference could not be saved.')
      setLayoutId(normalizeStorageLabelLayoutId(result?.layoutId))
      setPreferenceSaved(true)
    } catch (cause) {
      setPreferenceError(cause instanceof Error ? cause.message : 'The label sheet preference could not be saved.')
    } finally {
      setPreferenceBusy(false)
    }
  }

  const prepare = async () => {
    setError('')
    if (drafts.some(({ displayText }) => !displayText.trim())) {
      setError('Add display text for every selected label.')
      return
    }
    setBusy(true)
    try {
      setLabels(await generateLabels(drafts.map(({ type, id, displayText }) => ({ type, id, displayText: displayText.trim() }))))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Labels could not be prepared.')
    } finally {
      setBusy(false)
    }
  }

  const print = async () => {
    setError('')
    setBusy(true)
    try {
      const response = await fetch('/api/storage/qr/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: labels.map(({ token }) => token) }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Label preflight failed.')
      if (!result.valid) {
        setError(`${result.invalidIndexes.length} label reference${result.invalidIndexes.length === 1 ? ' is' : 's are'} revoked, missing, or unavailable. Prepare a new sheet before printing.`)
        return
      }
      window.print()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Label preflight failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="label-sheet-dialog max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="print:hidden">
          <DialogTitle>{preparedLabels?.length ? 'Reprint storage label' : 'Print storage labels'}</DialogTitle>
        </DialogHeader>

        {!labels.length ? (
          <div className="space-y-4 print:hidden">
            <p className="text-sm text-muted-foreground">
              Choose the only text that will appear outside each QR code. Avoid private notes or other sensitive details.
            </p>
            <div className="space-y-2">
              <Label htmlFor="label-layout">Label sheet</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={layoutId} onValueChange={(value) => {
                  if (isStorageLabelLayoutId(value)) {
                    setLayoutId(value)
                    setPreferenceSaved(false)
                  }
                }} disabled={busy || preferenceBusy}>
                  <SelectTrigger id="label-layout">
                    <SelectValue placeholder="Choose a label sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {STORAGE_LABEL_LAYOUT_IDS.map((id) => {
                      const option = LABEL_LAYOUTS[id]
                      return (
                        <SelectItem value={option.id} key={option.id}>
                          {option.name} — {option.description}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={savePreference} disabled={busy || preferenceBusy}>
                  {preferenceBusy ? 'Saving…' : preferenceSaved ? 'Saved for household' : 'Save as household default'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{layout.description}. The preview uses the sheet's real physical dimensions.</p>
              {preferenceError && <p role="alert" className="text-xs text-destructive">{preferenceError}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {drafts.map((record, index) => (
                <div className="space-y-2 rounded-lg border p-3" key={`${record.type}:${record.id}`}>
                  <Label htmlFor={`label-text-${index}`} className="capitalize">{record.type} label text</Label>
                  <Input
                    id={`label-text-${index}`}
                    maxLength={80}
                    value={record.displayText}
                    onChange={(event) => setDrafts((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, displayText: event.target.value } : entry))}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="print:hidden rounded-lg bg-muted/50 p-3 text-sm">
              <p>{labels.length} independently revocable label{labels.length === 1 ? '' : 's'} ready on <strong>{layout.name}</strong> ({labelPages.length} page{labelPages.length === 1 ? '' : 's'}).</p>
              <p className="mt-2 text-xs text-muted-foreground">
                QR codes are kept at least 0.72 in wide for reliable scanning. In your browser print dialog, choose <strong>Actual size</strong> or <strong>100% scale</strong> and turn off “Fit to page”. Use the matching paper size and enable background graphics if your browser offers that setting. Scaling changes can move adhesive labels out of alignment.
              </p>
            </div>
            <section className="storage-label-preview" aria-label={`Printable ${layout.name} storage labels`}>
              <div className="storage-label-sheet" style={printVariables}>
                {labelPages.map((page, pageIndex) => (
                  <div
                    className="storage-label-page"
                    data-label-mode={layout.mode}
                    data-page-size={layout.pageSize}
                    key={`label-page-${pageIndex}`}
                  >
                    {page.map((label) => (
                      <article className="storage-print-label flex break-inside-avoid flex-col items-center justify-center gap-2 rounded-lg border bg-white p-4 text-center text-black" key={label.referenceId}>
                        <QRCodeSVG className="storage-print-qr" value={label.url} size={220} level="M" marginSize={1} title={`Authenticated ${label.type} storage link`} />
                        <div className="storage-print-text max-w-full break-words font-semibold">{label.displayText}</div>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {error && (
          <div role="alert" className="print:hidden flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!labels.length ? (
            <Button disabled={busy || preferenceLoading || !drafts.length} onClick={prepare}>{preferenceLoading ? 'Loading saved sheet…' : busy ? 'Preparing…' : 'Prepare sheet'}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy || preferenceLoading} onClick={() => setLabels([])}>Edit text or sheet</Button>
              <Button disabled={busy || preferenceLoading} onClick={print}><Printer className="mr-2 h-4 w-4" />{busy ? 'Checking…' : 'Check & print'}</Button>
            </>
          )}
        </DialogFooter>
        <style jsx global>{`
          @media print {
            body * { visibility: hidden !important; }
            .label-sheet-dialog, .label-sheet-dialog * { visibility: visible !important; }
            .label-sheet-dialog {
              position: absolute !important;
              inset: 0 !important;
              max-width: none !important;
              max-height: none !important;
              width: 100% !important;
              transform: none !important;
              border: 0 !important;
              box-shadow: none !important;
              overflow: visible !important;
            }
            .storage-label-preview { overflow: visible !important; padding: 0 !important; }
            .storage-label-page {
              box-shadow: none !important;
              margin: 0 !important;
              break-inside: avoid;
            }
            .storage-label-page:not(:last-child) { break-after: page; }
            .storage-print-label { page-break-inside: avoid; }
          }

          @page storage-letter { size: letter; margin: 0; }
          @page storage-a4 { size: A4; margin: 0; }

          .storage-label-preview {
            overflow-x: auto;
            border-radius: 0.75rem;
            background: hsl(var(--muted) / 0.45);
            padding: 1rem;
          }
          .storage-label-page {
            display: grid;
            grid-template-columns: repeat(var(--label-columns), var(--label-width));
            grid-auto-rows: var(--label-height);
            column-gap: var(--label-column-gap);
            row-gap: var(--label-row-gap);
            box-sizing: border-box;
            width: var(--sheet-page-width);
            min-height: var(--sheet-page-height);
            padding: var(--sheet-padding);
            background: white;
            box-shadow: 0 2px 8px rgb(15 23 42 / 0.12);
            color: black;
          }
          .storage-label-page[data-page-size="letter"] { page: storage-letter; }
          .storage-label-page[data-page-size="a4"] { page: storage-a4; }
          .storage-print-label {
            width: var(--label-width);
            height: var(--label-height);
            min-height: 0;
            box-sizing: border-box;
            padding: var(--label-padding) !important;
            border-color: rgb(148 163 184 / 0.55);
          }
          .storage-label-page[data-label-mode="compact"] .storage-print-label {
            flex-direction: row !important;
            text-align: left !important;
          }
          .storage-print-qr {
            display: block;
            width: var(--label-qr-size);
            height: var(--label-qr-size);
            min-width: var(--label-qr-size);
            min-height: var(--label-qr-size);
            flex: 0 0 var(--label-qr-size);
          }
          .storage-print-text {
            font-size: var(--label-text-size);
            line-height: 1.15;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}
