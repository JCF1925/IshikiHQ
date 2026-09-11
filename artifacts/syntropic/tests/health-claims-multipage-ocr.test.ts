import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { parseHealthClaimFile } from '../lib/health-claims'
import { multiPageScannedMedicareStatementPdf } from './fixtures/medicare-statement'

describe('multi-page scanned Medicare OCR', { concurrency: false }, () => {
  it('keeps distinct page tables ordered and reviewable', async () => {
    const parsed = await parseHealthClaimFile(
      'medicare',
      'multi-page-scanned-statement.pdf',
      'application/pdf',
      multiPageScannedMedicareStatementPdf(),
    )

    assert.deepEqual(
      parsed.rows.map(({ rowNumber, data, errors }) => ({
        rowNumber,
        serviceDate: data.serviceDate,
        description: data.description,
        provider: data.provider,
        itemNumber: data.itemNumber,
        feeCharged: data.feeCharged,
        benefitPaid: data.benefitPaid,
        errors,
      })),
      [
        { rowNumber: 3, serviceDate: '2026-09-08', description: 'OPTOMETRY', provider: 'NORTH CLINIC', itemNumber: '24', feeCharged: 80, benefitPaid: 30, errors: [] },
        { rowNumber: 4, serviceDate: '2026-09-09', description: 'DENTAL EXAM', provider: 'SOUTH CLINIC', itemNumber: '36', feeCharged: 120, benefitPaid: 50, errors: [] },
        { rowNumber: 7, serviceDate: '2026-09-10', description: 'PHYSIO REVIEW', provider: 'EAST CLINIC', itemNumber: '44', feeCharged: 200, benefitPaid: 100, errors: [] },
        { rowNumber: 8, serviceDate: '2026-09-11', description: 'EYE TEST', provider: 'WEST CLINIC', itemNumber: '55', feeCharged: 90, benefitPaid: 35, errors: [] },
      ],
    )
    assert.deepEqual(parsed.errors, [])
  })

  it('rejects a sixth scanned page at the five-page OCR boundary and leaves no OCR directory', async () => {
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith('medicare-ocr-'))
    const parsed = await parseHealthClaimFile(
      'medicare',
      'six-page-scanned-statement.pdf',
      'application/pdf',
      multiPageScannedMedicareStatementPdf(6),
    )
    const after = (await readdir(tmpdir())).filter((name) => name.startsWith('medicare-ocr-'))

    assert.deepEqual(parsed.rows, [])
    assert.deepEqual(parsed.errors, [
      'This scanned Medicare PDF is too large or complex to process safely. Upload a statement of 5 pages or fewer, or enter claims manually.',
    ])
    assert.deepEqual(after, before)
  })

  it('cleans the temporary OCR directory after local OCR completes', async () => {
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith('medicare-ocr-'))
    const parsed = await parseHealthClaimFile(
      'medicare',
      'multi-page-scanned-statement.pdf',
      'application/pdf',
      multiPageScannedMedicareStatementPdf(),
    )
    const after = (await readdir(tmpdir())).filter((name) => name.startsWith('medicare-ocr-'))

    assert.equal(parsed.rows.length, 4)
    assert.deepEqual(after, before)
  })
})