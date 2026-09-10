import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'
import {
  applyHealthClaimReviewEdits,
  claimFingerprint,
  MEDICARE_CLAIM_FIELDS,
  MEDICARE_REVIEW_FIELDS,
  MEDICARE_REVIEW_EDIT_FIELDS,
  MEDICARE_REVIEW_IMMUTABLE_FIELDS,
  parseAudAmount,
  parseHealthClaimFile,
  PRIVATE_HEALTH_CLAIM_FIELDS,
  PRIVATE_HEALTH_REVIEW_FIELDS,
  PRIVATE_HEALTH_REVIEW_EDIT_FIELDS,
  PRIVATE_HEALTH_REVIEW_IMMUTABLE_FIELDS,
  type MedicareClaimData,
  type PrivateHealthClaimData,
  validateClaimData,
} from '../lib/health-claims'
import {
  HEALTH_IMPORT_AUDIT_FIELD_LABELS,
  healthImportAuditFieldLabels,
} from '../lib/health-claim-audit'
import {
  compactScannedMedicareStatementPdf,
  compressedMedicareStatementPdf,
  imageOnlyMedicareStatementPdf,
  lowQualityScannedMedicareStatementPdf,
  wideScannedMedicareStatementPdf,
} from './fixtures/medicare-statement'
import {
  checkHealthClaimImportOwnership,
  formatHealthClaimOwnershipReport,
} from '../lib/health-claims-integrity'
import { collectPortableAccountData } from '../lib/account-security'

/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * HEALTH_CLAIM_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/health-claims-import.test.ts */
const databaseTestsEnabled = process.env.HEALTH_CLAIM_DATABASE_TESTS === '1'

const databaseAcceptanceInterruptMarker = process.env.HEALTH_CLAIM_DATABASE_INTERRUPT_MARKER
const routeSession = { userId: '', authTime: Math.floor(Date.now() / 1000) }
const deletedStorageKeys: string[] = []
const storedStorageKeys: string[] = []
const routeSchemaReady = true
const appleHealthModels = new Set([
  'appleHealthAuditRecord',
  'appleHealthAnchor',
  'appleHealthDeletion',
  'appleHealthSample',
  'appleHealthImportBatch',
])
const routePrisma = new Proxy(prisma, {
  get(target, property, receiver) {
    if (property === 'healthClaimImport' && !routeSchemaReady) {
      const schemaError = Object.assign(new Error('table unavailable'), { code: 'P2021' })
      return {
        findMany: async () => { throw schemaError },
        findUnique: async () => { throw schemaError },
      }
    }
    if (!databaseTestsEnabled && property === 'mobileUpload') {
      return { findMany: async () => [] }
    }
    if (property === '$transaction') {
      return (callback: (tx: typeof prisma) => Promise<unknown>) => target.$transaction((tx) => callback(new Proxy(tx as typeof prisma, {
        get(transaction, transactionProperty, transactionReceiver) {
          if (!databaseTestsEnabled && typeof transactionProperty === 'string' && appleHealthModels.has(transactionProperty)) {
            return { deleteMany: async () => ({ count: 0 }) }
          }
          return Reflect.get(transaction, transactionProperty, transactionReceiver)
        },
      })))
    }
    return Reflect.get(target, property, receiver)
  },
})

mock.module('@/auth', {
  namedExports: {
    auth: async () => routeSession.userId
      ? { user: { id: routeSession.userId }, authTime: routeSession.authTime }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma: routePrisma } })
mock.module('@/lib/s3', {
  namedExports: {
    storePrivateFile: async (userId: string, category: string, fileName: string) => {
    const storageKey = `private/${user.id}/health-claims/legacy-private-claim.csv`
      storedStorageKeys.push(storageKey)
      return storageKey
    },
    deleteFile: async (storageKey: string) => {
      deletedStorageKeys.push(storageKey)
    },
  },
})

describe('health claim audit field labels', () => {
  it('defines safe labels for every known Medicare and private-health field', () => {
    const labelledFields = Object.keys(HEALTH_IMPORT_AUDIT_FIELD_LABELS).sort()
    const knownFields = Array.from(new Set([
      ...MEDICARE_CLAIM_FIELDS,
      ...PRIVATE_HEALTH_CLAIM_FIELDS,
    ])).sort()
    const existing = validateClaimData('private_health', {
      claimNumber: 'PH-100',
      serviceDate: '2026-09-08',
      provider: 'Original provider',
      serviceType: 'Hospital',
      description: 'Original',
      itemNumber: 'P100',
      chargedAmount: '120',
      benefitAmount: '70',
      outOfPocket: '50',
      benefitDetail: 'Original benefit detail',
      claimStatus: 'Paid',
    }).data as PrivateHealthClaimData

    const edited = applyHealthClaimReviewEdits('private_health', existing, {
      provider: 'Corrected provider',
      serviceType: 'Extras',
      itemNumber: 'P999',
      benefitDetail: 'Tampered benefit detail',
      claimStatus: 'Rejected',
    })

    const csv = [
      'Claim Number,Service Date,Description,Provider,Service Type,Charged Amount,Benefit Amount,Benefit Detail',
      'C-100,01/07/2026,Physiotherapy,North Clinic,Extras,$100,$60,Annual limit benefit',
      'C-101,not-a-date,Dental,South Clinic,Extras,bad,$20,Needs review',
    ].join('\n')

    const csv = [
      'Claim Number,Service Date,Description,Provider,Service Type,Charged Amount,Benefit Amount,Benefit Detail',
      'C-100,01/07/2026,Physiotherapy,North Clinic,Extras,$100,$60,Annual limit benefit',
      'C-101,not-a-date,Dental,South Clinic,Extras,bad,$20,Needs review',
    ].join('\n')

    assert.equal(edited.description, 'Corrected')
    assert.equal(edited.scheduleFee, 100)
    assert.equal(edited.financialYear, '2026-27')
    assert.equal(edited.isForecast, true)
    assert.equal(edited.countsToSafetyNet, true)
    assert.equal('futureServerField' in edited, false)
  })

  it('applies editable fields while preserving immutable private-health fields', () => {
    const existing = validateClaimData('private_health', {
      claimNumber: 'PH-100',
      serviceDate: '2026-09-08',
      provider: 'Original provider',
      serviceType: 'Hospital',
      description: 'Original',
      itemNumber: 'P100',
      chargedAmount: '120',
      benefitAmount: '70',
      outOfPocket: '50',
      benefitDetail: 'Original benefit detail',
      claimStatus: 'Paid',
    }).data as PrivateHealthClaimData

    const edited = applyHealthClaimReviewEdits('private_health', existing, {
      provider: 'Corrected provider',
      serviceType: 'Extras',
      itemNumber: 'P999',
      benefitDetail: 'Tampered benefit detail',
      claimStatus: 'Rejected',
    })

    const csv = [
      'Claim Number,Service Date,Description,Provider,Service Type,Charged Amount,Benefit Amount,Benefit Detail',
      'C-100,01/07/2026,Physiotherapy,North Clinic,Extras,$100,$60,Annual limit benefit',
      'C-101,not-a-date,Dental,South Clinic,Extras,bad,$20,Needs review',
    ].join('\n')

    const csv = [
      'Claim Number,Service Date,Description,Provider,Service Type,Charged Amount,Benefit Amount,Benefit Detail',
      'C-100,01/07/2026,Physiotherapy,North Clinic,Extras,$100,$60,Annual limit benefit',
      'C-101,not-a-date,Dental,South Clinic,Extras,bad,$20,Needs review',
    ].join('\n')
    const result = await checkHealthClaimImportOwnership({
      $queryRaw: (async (strings: TemplateStringsArray) => {
        query = strings.join('')
        return [{ mismatchedRows: 2, affectedImports: 1 }]
      }) as typeof prisma.$queryRaw,
    })
    const result = await checkHealthClaimImportOwnership({
      $queryRaw: (async (strings: TemplateStringsArray) => {
        query = strings.join('')
        return [{ mismatchedRows: 2, affectedImports: 1 }]
      }) as typeof prisma.$queryRaw,
    })
    assert.equal(result.rows.length, 2)
    assert.deepEqual(result.rows[0].data, {
      claimNumber: 'C-100',
      serviceDate: '2026-07-01',
      provider: 'North Clinic',
      serviceType: 'Extras',
      description: 'Physiotherapy',
      itemNumber: null,
      chargedAmount: 100,
      benefitAmount: 60,
      outOfPocket: 40,
      benefitDetail: 'Annual limit benefit',
      claimStatus: null,
    })
    assert.ok(result.rows[1].errors.some((error) => error.includes('Service date')))
    assert.ok(result.rows[1].errors.some((error) => error.includes('charged amount')))
  })

  it('supports structurally valid compressed text PDFs and safely rejects image-only content', async () => {
    const parsed = await parseHealthClaimFile('medicare', 'statement.pdf', 'application/pdf', compressedMedicareStatementPdf())
    assert.equal(parsed.rows.length, 1)
    assert.equal(parsed.rows[0].data.description, 'Optometry')
    const rejected = await parseHealthClaimFile('medicare', 'scan.pdf', 'application/pdf', imageOnlyMedicareStatementPdf())

    const logged: string[] = []
    const encrypted = await parseHealthClaimFile(
      'medicare',
      'encrypted.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF'),
    )
    assert.equal(encrypted.rows.length, 0)
    assert.equal(
      encrypted.errors[0],
      'This PDF is encrypted or restricts text extraction, so it cannot be imported safely. Download an unprotected statement, upload a CSV, or enter claims manually.',
    )
    assert.doesNotMatch(encrypted.errors[0], /private document marker|password supplied|password requested/i)

    const malformed = await parseHealthClaimFile(
      'medicare',
      'broken.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7\nBT (private document marker) Tj ET'),
    )
    assert.equal(malformed.rows.length, 0)
    assert.match(malformed.errors[0], /incomplete|malformed/)
    assert.doesNotMatch(malformed.errors[0], /private document marker/)
  })

  it('rejects pseudo-PDF plaintext instead of treating raw bytes as extracted text', async () => {
    const result = await checkHealthClaimImportOwnership({
      $queryRaw: (async (strings: TemplateStringsArray) => {
        query = strings.join('')
        return [{ mismatchedRows: 2, affectedImports: 1 }]
      }) as typeof prisma.$queryRaw,
    })
    assert.equal(result.rows.length, 0)
    assert.match(result.errors[0], /malformed|not a valid PDF/)
  })

  it('does not parse synthetic private-health byte strings as PDFs', async () => {
    const fixedWidth = [
      '%PDF-1.7',
      'Claim No.  Date of Service  Service Description  Provider  Amount Claimed  Fund Benefit  Patient Gap',
      'PH-100  01/07/2026  Physiotherapy  North Clinic  $100.00  $60.00  $40.00',
      '%%EOF',
    ].join('\n')
    const fixedWidthResult = await parseHealthClaimFile('private_health', 'fund-statement.pdf', 'application/pdf', Buffer.from(fixedWidth))
    assert.equal(fixedWidthResult.rows.length, 0)
    assert.match(fixedWidthResult.errors[0], /malformed/)

    const cells = [
      '%PDF-1.7',
      'BT (Claim Number) Tj (Date of Service) Tj (Description) Tj (Provider) Tj (Charged Amount) Tj (Benefit Paid) Tj ET',
      'BT (PH-101) Tj (02/07/2026) Tj (Dental check) Tj (South Clinic) Tj ($180.00) Tj ($90.00) Tj ET',
      '%%EOF',
    ].join('\n')
    const cellResult = await parseHealthClaimFile('private_health', 'fund-cells.pdf', 'application/pdf', Buffer.from(cells))
    assert.equal(cellResult.rows.length, 0)
    assert.match(cellResult.errors[0], /malformed/)
  })

  it('rejects malformed PDF byte strings safely', async () => {
    const pdfText = [
      '%PDF-1.7',
      'Claim Number|Date of Service|Description|Amount Claimed|Fund Benefit',
      'PH-200|not-a-date|Physiotherapy|not-money|$20',
      '%%EOF',
    ].join('\n')
    const invalid = await parseHealthClaimFile('private_health', 'invalid-statement.pdf', 'application/pdf', Buffer.from(pdfText))
    assert.equal(invalid.rows.length, 0)
    assert.match(invalid.errors[0], /malformed/)

    const compressed = await parseHealthClaimFile('private_health', 'compressed.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nstream\nx\\x9c\\x00\\x01image bytes\nendstream\n%%EOF'))
    assert.equal(compressed.rows.length, 0)
    assert.match(compressed.errors[0], /malformed/)
  })

  it('creates stable fingerprints for duplicate detection and validates edited rows', () => {
    assert.equal(parseAudAmount('$1,234.50'), 1234.5)
    const first = validateClaimData('medicare', { serviceDate: '08/09/2026', description: 'GP', feeCharged: '$100', benefitPaid: '$40' })
    const second = validateClaimData('medicare', { serviceDate: '08/09/2026', description: 'GP', feeCharged: '$100', benefitPaid: '$40' })
    assert.deepEqual(first.errors, [])
    assert.equal(claimFingerprint('medicare', first.data), claimFingerprint('medicare', second.data))
    assert.ok(validateClaimData('medicare', { serviceDate: 'bad', description: '' }).errors.length >= 2)
  })

  it('keeps scanned Medicare OCR on-platform and resource bounded', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../lib/health-claims.ts', import.meta.url), 'utf8'))
    assert.match(source, /execFileAsync\('pdftoppm'/)
    assert.match(source, /execFileAsync\('tesseract'/)
    assert.match(source, /MAX_OCR_PAGES = 5/)
    assert.match(source, /OCR_TIMEOUT_MS = 45_000/)
    assert.match(source, /maxBuffer: MAX_OCR_OUTPUT_CHARS/)
    assert.doesNotMatch(source, /fetch\(|https?:\/\//)
  })

  it('keeps import and confirmation routes ownership-scoped and atomic', async () => {
    const importRoute = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/health-claims/import/[id]/route.ts', import.meta.url), 'utf8'))
    const uploadRoute = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/health-claims/import/route.ts', import.meta.url), 'utf8'))
    const medicareRoute = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/medicare-claims/route.ts', import.meta.url), 'utf8'))
    const policyRoute = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/phi-policies/route.ts', import.meta.url), 'utf8'))
    const client = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/(app)/health-funding/health-funding-client.tsx', import.meta.url), 'utf8'))
    const schema = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'))
    const accountDeleteRoute = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../app/api/account/delete/route.ts', import.meta.url), 'utf8'))
    assert.match(uploadRoute, /healthClaimReportWhere/)
    assert.match(importRoute, /healthClaimReportWhere/)
    assert.match(medicareRoute, /healthClaimOwnerWhere/)
    assert.match(policyRoute, /healthClaimOwnerWhere/)
    assert.match(importRoute, /where: .*id, userId/)
    assert.match(importRoute, /status: 'review'/)
    assert.match(importRoute, /policyId, userId/)
    assert.match(importRoute, /prisma\.\$transaction/)
    assert.match(importRoute, /'invalid'/)
    assert.match(importRoute, /status: 'duplicate'/)
    assert.match(importRoute, /deleteFile\(current\.storageKey\)/)
    assert.match(importRoute, /healthClaimImportAudit/)
    assert.match(importRoute, /'row_edited'/)
    assert.match(importRoute, /changedFields: fields/)
    assert.match(importRoute, /changedFields: true/)
    assert.match(importRoute, /action: 'row_excluded'/)
    assert.match(importRoute, /action: 'import_confirmed'/)
    assert.match(importRoute, /action: 'review_canceled'/)
    assert.match(importRoute, /action: 'source_removed'/)
    assert.doesNotMatch(importRoute, /beforeData|afterData/)
    assert.match(client, /healthImportAuditFieldLabels/)
    assert.match(client, /Changed fields:/)
    assert.match(client, /event\.action === 'row_edited' \|\| event\.action === 'row_included'/)
    assert.doesNotMatch(client, /event\.changedFields\.join/)
    assert.match(client, /saveRes\.status === 409 \|\| saveRes\.status === 423/)
    assert.match(client, /This import was already confirmed in another tab/)
    assert.match(client, /Reload the import from claim history before confirming again\./)
    assert.match(client, /const discardRejectedImport = async \(\) =>/)
    assert.match(client, /healthImport\.status !== 'rejected'/)
    assert.match(client, /method: 'DELETE'/)
    assert.match(client, /Discard and choose another file/)
    assert.match(client, /Failed source discarded\. Choose another file to retry\./)
    assert.ok(
      client.indexOf("method: 'DELETE'") < client.indexOf("toast.success('Failed source discarded. Choose another file to retry.')"),
      'The retry path must remove the failed source before returning to file selection',
    )
    assert.ok(
      client.indexOf("refreshRes = await fetch(`/api/health-claims/import/${healthImport.id}`)") <
      client.indexOf("toast.success('This import was already confirmed in another tab')"),
      'The stale review path must reload server state before showing completion',
    )
    assert.match(uploadRoute, /action: status === 'rejected' \? 'import_rejected' : 'source_uploaded'/)
    assert.match(uploadRoute, /isImportSchemaError/)
    assert.match(uploadRoute, /SERVICE_UNAVAILABLE/)
    assert.match(uploadRoute, /diagnosticId/)
    assert.doesNotMatch(uploadRoute, /console\.(?:log|error)\([^)]*(?:parsed|body|file|row)/s)
    assert.ok(uploadRoute.indexOf('healthClaimImport.findUnique') < uploadRoute.indexOf('const parsed = await parseHealthClaimFile'))
    assert.match(schema, /model HealthClaimImportAudit/)
    assert.match(schema, /changedFields\s+Json\?/)
    assert.match(accountDeleteRoute, /isSafeHealthClaimAuditMetadata/)
    assert.match(accountDeleteRoute, /fileName: '\[deleted\]'/)
    assert.match(accountDeleteRoute, /sha256: '\[deleted\]'/)
    assert.match(accountDeleteRoute, /detectedFields: (null|Prisma\.JsonNull)/)
    assert.match(accountDeleteRoute, /parseErrors: (null|Prisma\.JsonNull)/)
    assert.match(accountDeleteRoute, /health_claim_metadata_validation/)
  })
})

describe('health claim import ownership integrity', () => {
  it('queries only aggregate ownership mismatch counts', async () => {
    let query = ''
    const result = await checkHealthClaimImportOwnership({
      $queryRaw: (async (strings: TemplateStringsArray) => {
        query = strings.join('')
        return [{ mismatchedRows: 2, affectedImports: 1 }]
      }) as typeof prisma.$queryRaw,
    })

    assert.deepEqual(result, { mismatchedRows: 2, affectedImports: 1 })
    assert.match(query, /COUNT\(\*\)::integer AS "mismatchedRows"/)
    assert.match(query, /COUNT\(DISTINCT claim_row\."importId"\)::integer AS "affectedImports"/)
    assert.match(query, /claim_row\."userId" IS DISTINCT FROM claim_import\."userId"/)
    const selectedColumns = query.slice(query.indexOf('SELECT'), query.indexOf('FROM'))
    assert.doesNotMatch(
      selectedColumns,
      /(?:claim_row|claim_import)\.\*|"data"|"errors"|"fileName"|"storageKey"|"userId"/,
    )
  })

  it('reports failures without exposing claim payloads or user identifiers', () => {
    const report = formatHealthClaimOwnershipReport({ mismatchedRows: 2, affectedImports: 1 })

    assert.match(report, /FAIL \(2 mismatched rows across 1 import\)/)
    assert.match(report, /No claim payloads, source metadata, or user identifiers were selected or printed\./)
    assert.match(report, /No records were changed\./)
    assert.doesNotMatch(report, /userId|storageKey|description/)
    assert.equal(
      formatHealthClaimOwnershipReport({ mismatchedRows: 0, affectedImports: 0 }),
      'Health claim import ownership check: PASS (0 mismatched rows; read-only)',
    )
  })
})

describe('health claim import database acceptance', { skip: !databaseTestsEnabled }, () => {
  it('keeps claims private and confirmation atomic across users, retries, and duplicate sources', async () => {
    const suffix = `${process.pid}-${Date.now()}`
    const userA = await prisma.user.create({ data: { email: `health-audit-a-${suffix}@example.test` } })
    const userB = await prisma.user.create({ data: { email: `health-audit-b-${suffix}@example.test` } })
    const userIds = [userA.id, userB.id]

    const { GET: listImports, POST } = await import('../app/api/health-claims/import/route.ts')
    const { GET, PATCH, DELETE } = await import('../app/api/health-claims/import/[id]/route.ts')

    const json = async <T = Record<string, any>>(response: Response) => response.json() as Promise<T>
    const upload = async (userId: string, fileName: string, contents: string) => {
      routeSession.userId = userId
      const form = new FormData()
      form.set('kind', 'medicare')
      form.set('file', new File([contents], fileName, { type: 'text/csv' }))
      return POST(new Request('http://health-claims.test/api/health-claims/import', { method: 'POST', body: form }))
    }
    const itemContext = (id: string) => ({ params: Promise.resolve({ id }) })
    const patch = (userId: string, id: string, body: Record<string, unknown>) => {
      routeSession.userId = userId
      return PATCH(
        new Request(`http://health-claims.test/api/health-claims/import/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        itemContext(id),
      )
    }

    const patchAs = (userId: string, id: string, body: Record<string, unknown>) => {
      routeSession.userId = userId
      return PATCH(
        new Request(`http://health-claims.test/api/health-claims/import/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        itemContext(id),
      )
    }

      const medicareUpload = await upload(
        'medicare',
        'immutable-medicare.csv',
        [
          'Service Date,Description,Item Number,Provider,Schedule Fee,Fee Charged,Benefit Paid,Out of Pocket,Financial Year,Forecast,Counts to Safety Net',
          '08/09/2026,GP consultation,23,Example Medical,$50,$120,$45.50,$74.50,2026-27,false,true',
        ].join('\n'),
      )

    const read = (userId: string, id: string) => {
      routeSession.userId = userId
      return GET(new Request(`http://health-claims.test/api/health-claims/import/${id}`), itemContext(id))
    }
    const remove = (userId: string, id: string) => {
      routeSession.userId = userId
      return DELETE(new Request(`http://health-claims.test/api/health-claims/import/${id}`, { method: 'DELETE' }), itemContext(id))
    }
    const assertCannotAccess = async (actorId: string, targetId: string) => {
      routeSession.userId = actorId
      const listResponse = await listImports()
      assert.equal(listResponse.status, 200)
      const listed = await json<Array<{ id: string }>>(listResponse)
      assert.ok(!listed.some((item) => item.id === targetId))
      assert.equal((await read(actorId, targetId)).status, 404)
      routeSession.userId = actorId
      assert.equal((await patch(actorId, targetId, { action: 'confirm' })).status, 404)
      routeSession.userId = actorId
      assert.equal((await patch(actorId, targetId, { action: 'save', rows: [] })).status, 404)
      assert.equal((await remove(actorId, targetId)).status, 404)
    }

    const medicareHeader = 'Service Date,Description,Item Number,Provider,Fee Charged,Benefit Paid,Out of Pocket'
    const medicareRow = '08/09/2026,GP consultation,23,Example Medical,$120.00,$45.50,$74.50'

      const medicareOriginal = medicareRow.data
    const privateHeader = 'Claim Number,Service Date,Description,Provider,Service Type,Charged Amount,Benefit Amount,Benefit Detail'
      const privateRow = privateRecord.rows[0]

      const privateOriginal = privateRow.data

    let userAImportId = ''
    let userBImportId = ''
    let userAPolicyId = ''
    try {
      const userAUpload = await upload(userA.id, 'medicare', 'medicare-a.csv', `${medicareHeader}\n${medicareRow}`)
      assert.equal(userAUpload.status, 201)
      userAImportId = (await json(userAUpload)).id
      await pauseForDatabaseAcceptanceInterruption()

      const medicarePdf = compressedMedicareStatementPdf()
      const pdfUpload = await upload(userA.id, 'medicare', 'medicare-statement.pdf', medicarePdf)
      assert.equal(pdfUpload.status, 201)
      const pdfImport = await json(pdfUpload)
      assert.equal(pdfImport.status, 'review')
      assert.equal(pdfImport.rows.length, 1)
      assert.equal(pdfImport.rows[0].data.description, 'Optometry')
      routeSession.userId = userA.id
      assert.equal((await patch(userA.id, pdfImport.id, { action: 'confirm' })).status, 200)
      assert.equal(await prisma.medicareClaim.count({ where: { userId: userA.id } }), 1)

      const protectedDocumentCanary = 'private diagnosis from protected insurer statement'
      const protectedMetadataCanary = 'Author (Sensitive Insurer Metadata)'
      const protectedPasswordCanary = 'supplied-password=claim-secret'
      const protectedPdf = Buffer.from([
        '%PDF-1.7',
        `1 0 obj << /Encrypt 2 0 R /Title (${protectedDocumentCanary}) /${protectedMetadataCanary} >> endobj`,
        protectedPasswordCanary,
        '%%EOF',
      ].join('\n'))
      const medicareClaimsBeforeProtectedUpload = await prisma.medicareClaim.count({ where: { userId: userA.id } })
      const protectedUpload = await upload(userA.id, 'medicare', 'protected-statement.pdf', protectedPdf)
      assert.equal(protectedUpload.status, 201)
      const protectedImport = await json<{
        id: string
        status: string
        rows: unknown[]
        parseErrors: string[]
      }>(protectedUpload)
      assert.equal(protectedImport.status, 'rejected')
      assert.deepEqual(protectedImport.rows, [])
      assert.deepEqual(protectedImport.parseErrors, [
        'This PDF is encrypted or restricts text extraction, so it cannot be imported safely. Download an unprotected statement, upload a CSV, or enter claims manually.',
      ])
      const protectedResponseBody = JSON.stringify(protectedImport)
      for (const privateCanary of [
        protectedDocumentCanary,
        protectedMetadataCanary,
        protectedPasswordCanary,
        'claim-secret',
      ]) {
        assert.equal(protectedResponseBody.toLowerCase().includes(privateCanary.toLowerCase()), false)
      }
      assert.deepEqual(
        await prisma.healthClaimImport.findUniqueOrThrow({
          where: { id: protectedImport.id },
          select: { status: true, parseErrors: true, rows: { select: { id: true } } },
        }),
        {
          status: 'rejected',
          parseErrors: protectedImport.parseErrors,
          rows: [],
        },
      )
      const protectedConfirmation = await patch(userA.id, protectedImport.id, { action: 'confirm' })
      assert.notEqual(protectedConfirmation.status, 200)
      assert.equal(
        await prisma.medicareClaim.count({ where: { userId: userA.id } }),
        medicareClaimsBeforeProtectedUpload,
      )

      const userBUpload = await upload(userB.id, 'medicare', 'medicare-b.csv', `${medicareHeader}\n${medicareRow.replace('GP consultation', 'Dental review')}`)
      assert.equal(userBUpload.status, 201)
      userBImportId = (await json(userBUpload)).id

      await assertCannotAccess(userA.id, userBImportId)
      await assertCannotAccess(userB.id, userAImportId)
      assert.equal((await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: userAImportId } })).status, 'review')
      assert.equal((await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: userBImportId } })).status, 'review')

      const userARow = await prisma.healthClaimImportRow.findFirstOrThrow({ where: { importId: userAImportId } })
      const userASecondUpload = await upload(
        userA.id,
        'medicare',
        'medicare-a-second.csv',
        `${medicareHeader}\n08/09/2026,Optometry,24,Vision Clinic,$80.00,$30.00,$50.00`,
      )
      assert.equal(userASecondUpload.status, 201)
      const userASecondImportId = (await json(userASecondUpload)).id as string

      const { execFileSync } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')
      const migrationDatabaseUrl = new URL(process.env.DATABASE_URL ?? '')
      const migrationSchema = migrationDatabaseUrl.searchParams.get('schema')
      assert.match(migrationSchema ?? '', /^[a-z0-9_]+$/)
      migrationDatabaseUrl.searchParams.delete('schema')
      const applyMigration = (relativePath: string) => execFileSync(
        'psql',
        [migrationDatabaseUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL(relativePath, import.meta.url))],
        {
          env: { ...process.env, PGOPTIONS: `-c search_path=${migrationSchema}` },
          stdio: 'pipe',
        },
      )

      applyMigration('../prisma/migrations/20261006000000_health_claim_import_row_ownership_immutable/migration.sql')
      await assert.rejects(
        () => prisma.healthClaimImportRow.update({
          where: { id: userARow.id },
          data: { importId: userASecondImportId, rowNumber: 99 },
        }),
        /health claim import row ownership is immutable/,
      )

      applyMigration('../prisma/migrations/20261006000002_health_claim_import_row_owner_updates/migration.sql')
      const movedWithinOwner = await prisma.healthClaimImportRow.update({
        where: { id: userARow.id },
        data: { importId: userASecondImportId, rowNumber: 99 },
        select: { id: true, importId: true, userId: true },
      })
      assert.deepEqual(movedWithinOwner, { id: userARow.id, importId: userASecondImportId, userId: userA.id })

      const [finalOwnerConstraint] = await prisma.$queryRaw<Array<{ installed: boolean }>>`
        SELECT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'HealthClaimImportRow_importId_userId_fkey'
             AND conrelid = '"HealthClaimImportRow"'::regclass
        ) AS installed
      `
      if (!finalOwnerConstraint?.installed) {
        applyMigration('../prisma/migrations/20261006000003_health_claim_import_owner_updates/migration.sql')
      }
      await assert.rejects(
        () => prisma.healthClaimImport.update({
          where: { id: userASecondImportId },
          data: { userId: userB.id },
        }),
        (error: unknown) => (
          typeof error === 'object'
          && error !== null
          && 'code' in error
          && error.code === 'P2003'
        ),
      )
      assert.equal(
        (await prisma.healthClaimImport.findUniqueOrThrow({
          where: { id: userASecondImportId },
          select: { userId: true },
        })).userId,
        userA.id,
      )
      assert.deepEqual(
        await prisma.healthClaimImportRow.findUniqueOrThrow({
          where: { id: userARow.id },
          select: { importId: true, userId: true },
        }),
        { importId: userASecondImportId, userId: userA.id },
      )
      await assertCannotAccess(userB.id, userASecondImportId)

      const concurrentImport = await prisma.healthClaimImport.create({
        data: {
          userId: userA.id,
          kind: 'medicare',
          fileName: 'concurrent-owner-check.csv',
          contentType: 'text/csv',
          byteSize: 1,
          sha256: `concurrent-owner-check-${suffix}`,
          storageKey: `test/${userA.id}/concurrent-owner-check.csv`,
        },
      })
      let acknowledgeInsert = () => {}
      let releaseInsert = () => {}
      const insertAcknowledged = new Promise<void>((resolve) => { acknowledgeInsert = resolve })
      const insertReleased = new Promise<void>((resolve) => { releaseInsert = resolve })
      const insertTransaction = prisma.$transaction(async (tx) => {
        await tx.healthClaimImportRow.create({
          data: {
            importId: concurrentImport.id,
            userId: userA.id,
            rowNumber: 1,
            fingerprint: `concurrent-owner-check-${suffix}`,
            data: { description: 'Concurrent privacy check' },
          },
        })
        acknowledgeInsert()
        await insertReleased
      })
      await insertAcknowledged
      const concurrentOwnerUpdate = prisma.$transaction((tx) => (
        tx.healthClaimImport.update({
          where: { id: concurrentImport.id },
          data: { userId: userB.id },
        })
      )).then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      )
      const updateBeforeInsertCommit = await Promise.race([
        concurrentOwnerUpdate.then(() => 'completed'),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
      ])
      assert.equal(updateBeforeInsertCommit, 'blocked')
      releaseInsert()
      await insertTransaction
      const concurrentOwnerUpdateResult = await concurrentOwnerUpdate
      assert.equal(
        typeof concurrentOwnerUpdateResult.error === 'object'
          && concurrentOwnerUpdateResult.error !== null
          && 'code' in concurrentOwnerUpdateResult.error
          ? concurrentOwnerUpdateResult.error.code
          : null,
        'P2003',
      )
      assert.equal(
        (await prisma.healthClaimImport.findUniqueOrThrow({
          where: { id: concurrentImport.id },
          select: { userId: true },
        })).userId,
        userA.id,
      )
      assert.equal(
        (await prisma.healthClaimImportRow.findFirstOrThrow({
          where: { importId: concurrentImport.id },
          select: { userId: true },
        })).userId,
        userA.id,
      )
      await assertCannotAccess(userB.id, concurrentImport.id)

      await assert.rejects(
        () => prisma.healthClaimImportRow.update({
          where: { id: userARow.id },
          data: { importId: userBImportId },
        }),
        /health claim import row cannot move between owners/,
      )
      await assert.rejects(
        () => prisma.healthClaimImportRow.update({
          where: { id: userARow.id },
          data: { userId: userB.id },
        }),
        /health claim import row user must match import owner/,
      )
      await assert.rejects(
        () => prisma.healthClaimImportRow.update({
          where: { id: userARow.id },
          data: { importId: userBImportId, userId: userB.id },
        }),
        /health claim import row cannot move between owners/,
      )

      const assertUserARowOwnershipUnchanged = async () => {
        assert.deepEqual(
          await prisma.healthClaimImportRow.findUniqueOrThrow({
            where: { id: userARow.id },
            select: { importId: true, userId: true },
          }),
          { importId: userASecondImportId, userId: userA.id },
        )
      }
      const rejectBulkOwnershipChange = async (
        data: { importId?: string; userId?: string },
        expectedError: RegExp,
      ) => {
        await assert.rejects(
          () => prisma.healthClaimImportRow.updateMany({
            where: { id: userARow.id },
            data,
          }),
          expectedError,
        )
        await assertUserARowOwnershipUnchanged()
      }

      await rejectBulkOwnershipChange(
        { importId: userBImportId },
        /health claim import row cannot move between owners/,
      )
      await rejectBulkOwnershipChange(
        { userId: userB.id },
        /health claim import row user must match import owner/,
      )
      await rejectBulkOwnershipChange(
        { importId: userBImportId, userId: userB.id },
        /health claim import row cannot move between owners/,
      )

      assert.equal(typeof userARow.data, 'object')
      assert.ok(userARow.data !== null && !Array.isArray(userARow.data))
      const originalBulkData = userARow.data as Record<string, string | number | boolean | null>
      const bulkData = { ...originalBulkData, description: 'Bulk-edited consultation' }
      assert.deepEqual(
        await prisma.healthClaimImportRow.updateMany({
          where: { id: userARow.id },
          data: { data: bulkData, status: 'excluded' },
        }),
        { count: 1 },
      )
      assert.deepEqual(
        await prisma.healthClaimImportRow.findUniqueOrThrow({
          where: { id: userARow.id },
          select: { importId: true, userId: true, data: true, status: true },
        }),
        {
          importId: userASecondImportId,
          userId: userA.id,
          data: bulkData,
          status: 'excluded',
        },
      )

      await prisma.healthClaimImportRow.update({
        where: { id: userARow.id },
        data: { importId: userAImportId, rowNumber: 1, status: 'valid' },
      })

      const policy = await prisma.phiPolicy.create({
        data: {
          userId: user.id,
          policyName: 'Acceptance private health policy',
          policyNumber: 'POLICY-PRIVATE-CANARY',
        },
      })
      userAPolicyId = policy.id

      const invalidMedicare = await upload(
        userA.id,
        'medicare',
        'medicare-invalid.csv',
        `${medicareHeader}\n${medicareRow}\n08/09/2026,Broken row,24,Example Medical,bad,$5,$5`,
      )
      assert.equal(invalidMedicare.status, 201)
      const invalidMedicareImport = await json(invalidMedicare)
      const invalidMedicareId = invalidMedicareImport.id as string
      const invalidMedicareRows = invalidMedicareImport.rows as Array<{ id: string; status: string; data: Record<string, unknown> }>
      assert.equal(invalidMedicareRows.filter((row) => row.status === 'invalid').length, 1)
      routeSession.userId = userA.id
      const medicareCountBeforeInvalidConfirm = await prisma.medicareClaim.count({ where: { userId: userA.id } })
      assert.equal((await json(await patch(userA.id, invalidMedicareId, { action: 'confirm' }))).error.code, 'VALIDATION_ERROR')
      assert.equal(await prisma.medicareClaim.count({ where: { userId: userA.id } }), medicareCountBeforeInvalidConfirm)
      assert.equal((await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: invalidMedicareId } })).status, 'review')

      const invalidPrivate = await upload(
        userA.id,
        'private_health',
        'private-invalid.csv',
        `${privateHeader}\n${privateRow}\nC-101,not-a-date,Dental,South Clinic,Extras,bad,$20,Needs review`,
      )
      assert.equal(invalidPrivate.status, 201)
      const invalidPrivateImport = await json(invalidPrivate)
      const invalidPrivateId = invalidPrivateImport.id as string
      const privateCountBeforeInvalidConfirm = await prisma.phiClaim.count({ where: { userId: userA.id } })
      routeSession.userId = userA.id
      assert.equal((await json(await patch(userA.id, invalidPrivateId, { action: 'confirm', policyId: userAPolicyId }))).error.code, 'VALIDATION_ERROR')
      assert.equal(await prisma.phiClaim.count({ where: { userId: userA.id } }), privateCountBeforeInvalidConfirm)
      assert.equal((await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: invalidPrivateId } })).status, 'review')

      routeSession.userId = userA.id
      const confirmed = await patch(userA.id, userAImportId, { action: 'confirm' })
      assert.equal(confirmed.status, 200)
      assert.deepEqual(await json(confirmed), { ok: true, status: 'confirmed', id: userAImportId })
      assert.equal(await prisma.medicareClaim.count({ where: { userId: userA.id } }), 2)
      assert.deepEqual(await json(await patch(userA.id, userAImportId, { action: 'confirm' })), { ok: true, status: 'confirmed', id: userAImportId })
      assert.equal(await prisma.medicareClaim.count({ where: { userId: userA.id } }), 2)
      const duplicateSource = await upload(userA.id, 'medicare', 'medicare-a-again.csv', `${medicareHeader}\n${medicareRow}`)
      assert.equal(duplicateSource.status, 409)

      const duplicateClaim = await upload(userA.id, 'medicare', 'medicare-copy.csv', `${medicareHeader}\n${medicareRow}\n`)
      assert.equal(duplicateClaim.status, 201)
      const duplicateClaimImport = await json(duplicateClaim)
      assert.equal(duplicateClaimImport.rows[0].status, 'duplicate')
      routeSession.userId = userA.id
      assert.deepEqual(await json(await patch(userA.id, duplicateClaimImport.id, { action: 'confirm' })), {
        ok: true,
        status: 'confirmed',
        id: duplicateClaimImport.id,
      })
      assert.equal(await prisma.medicareClaim.count({ where: { userId: userA.id } }), 2)

      const correctedRows = invalidMedicareRows
        .filter((row) => row.status === 'invalid')
        .map((row) => ({ id: row.id, excluded: true }))
      routeSession.userId = userA.id
      assert.equal((await patch(userA.id, invalidMedicareId, { action: 'save', rows: correctedRows })).status, 200)
      const correctedConfirmation = await patch(userA.id, invalidMedicareId, { action: 'confirm' })
      assert.equal(correctedConfirmation.status, 200)
      assert.equal(await prisma.medicareClaim.count({ where: { userId: userA.id } }), 2)

      const concurrentMedicareUploads = await Promise.all([
        upload(userA.id, 'medicare-race-a.csv', `${medicareHeader}\n10/09/2026,Concurrent GP,36,Race Clinic,$90,$40,$50`),
        upload(userA.id, 'medicare-race-b.csv', `${medicareHeader}\n10/09/2026,Concurrent GP,36,Race Clinic,$90,$40,$50\n`),
      ])
      assert.deepEqual(concurrentMedicareUploads.map((response) => response.status), [201, 201])
      const concurrentMedicareImports = await Promise.all(concurrentMedicareUploads.map(json))
      routeSession.userId = userA.id
      const concurrentMedicareConfirmations = await Promise.all(
        concurrentMedicareImports.map((item) => patch(userA.id, item.id, { action: 'confirm' })),
      )
      assert.deepEqual(concurrentMedicareConfirmations.map((response) => response.status), [200, 200])
      const concurrentMedicareFingerprint = concurrentMedicareImports[0].rows[0].fingerprint
      assert.equal(await prisma.medicareClaim.count({
        where: { userId: userA.id, importFingerprint: concurrentMedicareFingerprint },
      }), 1)
      assert.deepEqual(
        (await prisma.healthClaimImportRow.findMany({
          where: { importId: { in: concurrentMedicareImports.map((item) => item.id) } },
          orderBy: { status: 'asc' },
          select: { status: true },
        })).map((row) => row.status),
        ['confirmed', 'duplicate'],
      )

      const privateRaceContents = `${privateHeader}\nC-RACE,11/09/2026,Concurrent physio,Race Allied,Extras,$110,$65,Concurrent benefit`
      const privateRaceUploads = await Promise.all([
        upload(userA.id, 'private_health', 'private-race-a.csv', privateRaceContents),
        upload(userA.id, 'private_health', 'private-race-b.csv', `${privateRaceContents}\n`),
      ])
      assert.deepEqual(privateRaceUploads.map((response) => response.status), [201, 201])
      const privateRaceImports = await Promise.all(privateRaceUploads.map(json))
      routeSession.userId = userA.id
      const privateRaceConfirmations = await Promise.all(
        privateRaceImports.map((item) => patch(userA.id, item.id, { action: 'confirm', policyId: userAPolicyId })),
      )
      assert.deepEqual(privateRaceConfirmations.map((response) => response.status), [200, 200])
      const privateRaceFingerprint = privateRaceImports[0].rows[0].fingerprint
      assert.equal(await prisma.phiClaim.count({
        where: { userId: userA.id, importFingerprint: privateRaceFingerprint },
      }), 1)
      assert.deepEqual(
        (await prisma.healthClaimImportRow.findMany({
          where: { importId: { in: privateRaceImports.map((item) => item.id) } },
          orderBy: { status: 'asc' },
          select: { status: true },
        })).map((row) => row.status),
        ['confirmed', 'duplicate'],
      )
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined)
      await prisma.$disconnect()
      routeSession.userId = ''
      void userAPolicyId
    }
  })

  it('rejects immutable Medicare and private-health edits on the database route', async () => {
    const suffix = `${process.pid}-${Date.now()}`
    const userA = await prisma.user.create({ data: { email: `health-audit-a-${suffix}@example.test` } })
    const userB = await prisma.user.create({ data: { email: `health-audit-b-${suffix}@example.test` } })
    const userIds = [userA.id, userB.id]

    const { PATCH } = await import('../app/api/health-claims/import/[id]/route.ts')
    const { GET, PATCH, DELETE } = await import('../app/api/health-claims/import/[id]/route.ts')

    const json = async <T = Record<string, any>>(response: Response) => response.json() as Promise<T>
    const upload = async (userId: string, fileName: string, contents: string) => {
      routeSession.userId = userId
      const form = new FormData()
      form.set('kind', 'medicare')
      form.set('file', new File([contents], fileName, { type: 'text/csv' }))
      return POST(new Request('http://health-claims.test/api/health-claims/import', { method: 'POST', body: form }))
    }
    const itemContext = (id: string) => ({ params: Promise.resolve({ id }) })
    const patch = (userId: string, id: string, body: Record<string, unknown>) => {
      routeSession.userId = userId
      return PATCH(
        new Request(`http://health-claims.test/api/health-claims/import/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        itemContext(id),
      )
    }

    const patchAs = (userId: string, id: string, body: Record<string, unknown>) => {
      routeSession.userId = userId
      return PATCH(
        new Request(`http://health-claims.test/api/health-claims/import/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        itemContext(id),
      )
    }

      const medicareUpload = await upload(
        'medicare',
        'immutable-medicare.csv',
        [
          'Service Date,Description,Item Number,Provider,Schedule Fee,Fee Charged,Benefit Paid,Out of Pocket,Financial Year,Forecast,Counts to Safety Net',
          '08/09/2026,GP consultation,23,Example Medical,$50,$120,$45.50,$74.50,2026-27,false,true',
        ].join('\n'),
      )

    const read = (userId: string, id: string) => {
      routeSession.userId = userId
      return GET(new Request(`http://health-claims.test/api/health-claims/import/${id}`), itemContext(id))
    }
    const remove = (userId: string, id: string) => {
      routeSession.userId = userId
      return DELETE(new Request(`http://health-claims.test/api/health-claims/import/${id}`, { method: 'DELETE' }), itemContext(id))
    }
    const auditEvents = (importId: string) => prisma.healthClaimImportAudit.findMany({
      where: { importId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    const assertActions = async (importId: string, expected: string[]) => {
      const events = await auditEvents(importId)
      assert.deepEqual(events.map((event) => event.action).sort(), [...expected].sort())
      return events
    }
    const medicareHeader = 'Service Date,Description,Item Number,Provider,Fee Charged,Benefit Paid,Out of Pocket'
    const medicareRow = '08/09/2026,GP consultation,23,Example Medical,$120.00,$45.50,$74.50'

      const medicareOriginal = medicareRow.data

    try {
      const uploaded = await upload(userA.id, 'audit-lifecycle.csv', `${medicareHeader}\n${medicareRow}\n08/09/2026,Optometry,24,Vision Clinic,$80.00,$30.00,$50.00`)
      assert.equal(uploaded.status, 201)
      const uploadedRecord = await json<{
        id: string
        rows: Array<{ id: string; rowNumber: number; status: string; data: Record<string, unknown> }>
      }>(uploaded)
    let importId = ''
      const firstRow = uploadedRecord.rows[0]
      const secondRow = uploadedRecord.rows[1]
      assert.equal((await assertActions(importId, ['source_uploaded'])).length, 1)

      const sourceUploaded = await prisma.healthClaimImportAudit.findFirstOrThrow({
        where: { importId, action: 'source_uploaded' },
      })
      assert.equal(sourceUploaded.userId, userA.id)
      assert.equal(sourceUploaded.actorUserId, userA.id)
      assert.equal(sourceUploaded.rowNumber, null)
      assert.equal(sourceUploaded.changedFields, null)

      const originalFetch = globalThis.fetch
      const previousAlertEnvironment = {
        webhookUrl: process.env.OPS_ALERT_WEBHOOK_URL,
        owner: process.env.OPS_ALERT_OWNER,
        environment: process.env.OPS_ALERT_ENVIRONMENT,
      }
      const alertBodies: Array<Record<string, any>> = []
      const operationalLogs: string[] = []
      let rejectAlert: ((error: Error) => void) | undefined
      await prisma.$executeRaw`
        DELETE FROM "OperationsAlertGroup"
        WHERE "key" = 'health_claim_ownership_violation'
      `
      process.env.OPS_ALERT_WEBHOOK_URL = 'https://alerts.example.test/receiver'
      process.env.OPS_ALERT_OWNER = 'health-claims-test-owner'
      process.env.OPS_ALERT_ENVIRONMENT = 'test'
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        alertBodies.push(JSON.parse(String(init?.body)))
        await new Promise<never>((_resolve, reject) => {
          rejectAlert = reject
        })
        throw new Error('alert receiver unexpectedly completed')
      }
      try {
        const originalConsoleError = console.error
        console.error = (...args: unknown[]) => {
          operationalLogs.push(args.map((arg) => (
            typeof arg === 'string' ? arg : JSON.stringify(arg)
          )).join(' '))
        }
        try {
          await assert.rejects(
            () => prisma.healthClaimImportAudit.createMany({
              data: [
                {
                  importId,
                  userId: userA.id,
                  actorUserId: userA.id,
                  action: 'row_edited',
                },
                {
                  importId,
                  userId: userB.id,
                  actorUserId: userA.id,
                  action: 'source_uploaded',
                },
              ],
            }),
            /user must match import owner/,
          )
        for (let attempt = 0; attempt < 200 && groupedCount < 3; attempt += 1) {

          const grouping = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT "count"
            FROM "OperationsAlertGroup"
            WHERE "key" = 'health_claim_ownership_violation'
          `
        const fallbackLog = operationalLogs.find((line) => line.includes('"errorCode":"DELIVERY_FAILED"'))

        const auditCountBeforeActorBatch = await prisma.healthClaimImportAudit.count({
          where: { importId },
        })
          const environmentKey = key === 'webhookUrl'
            ? 'OPS_ALERT_WEBHOOK_URL'
            : key === 'owner'
              ? 'OPS_ALERT_OWNER'
              : 'OPS_ALERT_ENVIRONMENT'
          if (value === undefined) delete process.env[environmentKey]
          else process.env[environmentKey] = value
        }
      }
      assert.equal(await prisma.healthClaimImportAudit.count({ where: { importId } }), 1)

      const auditCountBeforeOtherUser = await prisma.healthClaimImportAudit.count({ where: { importId } })
      assert.equal((await read(userB.id, importId)).status, 404)
      assert.equal((await patch(userB.id, importId, { action: 'save', rows: [] })).status, 404)
      assert.equal((await patch(userB.id, importId, { action: 'confirm' })).status, 404)
      assert.equal((await remove(userB.id, importId)).status, 404)
      assert.equal(await prisma.healthClaimImportAudit.count({ where: { importId } }), auditCountBeforeOtherUser)
      assert.equal(await prisma.healthClaimImportAudit.count({ where: { importId, userId: userB.id } }), 0)

      const editedData = { ...firstRow.data, description: 'Updated GP consultation' }
      assert.equal((await patch(userA.id, importId, { action: 'save', rows: [{ id: firstRow.id, data: editedData }] })).status, 200)
      const editEvent = await prisma.healthClaimImportAudit.findFirstOrThrow({ where: { importId, action: 'row_edited' } })
      assert.deepEqual(editEvent.changedFields, ['description'])
      assert.equal(editEvent.rowNumber, firstRow.rowNumber)
      assert.equal(editEvent.previousStatus, 'valid')
      assert.equal(editEvent.nextStatus, 'valid')
      assert.doesNotMatch(JSON.stringify(editEvent), /Updated GP consultation|Example Medical|120/)

      const auditCountBeforeUnchangedSave = await prisma.healthClaimImportAudit.count({ where: { importId } })
      assert.equal((await patch(userA.id, importId, { action: 'save', rows: [{ id: firstRow.id, data: editedData }] })).status, 200)
      assert.equal(await prisma.healthClaimImportAudit.count({ where: { importId } }), auditCountBeforeUnchangedSave)

      assert.equal((await patch(userA.id, importId, { action: 'save', rows: [{ id: secondRow.id, excluded: true }] })).status, 200)
      const excludeEvent = await prisma.healthClaimImportAudit.findFirstOrThrow({ where: { importId, action: 'row_excluded' } })
      assert.equal(excludeEvent.rowNumber, secondRow.rowNumber)
      assert.equal(excludeEvent.previousStatus, 'valid')
      assert.equal(excludeEvent.nextStatus, 'excluded')
      assert.equal(excludeEvent.changedFields, null)

      const restoredData = { ...secondRow.data, description: 'Restored optometry visit' }
      assert.equal((await patch(userA.id, importId, { action: 'save', rows: [{ id: secondRow.id, data: restoredData }] })).status, 200)
      const includeEvent = await prisma.healthClaimImportAudit.findFirstOrThrow({ where: { importId, action: 'row_included' } })
      assert.equal(includeEvent.rowNumber, secondRow.rowNumber)
      assert.equal(includeEvent.previousStatus, 'excluded')
      assert.equal(includeEvent.nextStatus, 'valid')
      assert.deepEqual(includeEvent.changedFields, ['description'])
      assert.doesNotMatch(JSON.stringify(includeEvent), /Restored optometry visit|Optometry|Vision Clinic|80/)
      assert.equal(alertBodies.length, 1)

      assert.equal((await patch(userA.id, importId, { action: 'confirm' })).status, 200)
      const confirmedEvents = await assertActions(importId, ['source_uploaded', 'row_edited', 'row_excluded', 'row_included', 'import_confirmed'])
      const confirmedEvent = confirmedEvents.find((event) => event.action === 'import_confirmed')
      assert.ok(confirmedEvent)
      assert.equal(confirmedEvent?.changedFields, null)
      assert.equal((await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: importId } })).status, 'confirmed')

      const auditBeforeTamper = await prisma.healthClaimImportAudit.findFirstOrThrow({ where: { importId, action: 'row_edited' } })
      await assert.rejects(
        () => prisma.healthClaimImportAudit.update({ where: { id: auditBeforeTamper.id }, data: { rowNumber: 99 } }),
        /immutable/,
      )
      await assert.rejects(
        () => prisma.healthClaimImportAudit.delete({ where: { id: auditBeforeTamper.id } }),
        /immutable/,
      )
      assert.equal(await prisma.healthClaimImportAudit.count({ where: { importId } }), confirmedEvents.length)

      const rejectedUpload = await upload(userA.id, 'audit-rejected.csv', 'not a claim statement')
      assert.equal(rejectedUpload.status, 201)
      const rejectedRecord = await json<{ id: string }>(rejectedUpload)
      await assertActions(rejectedRecord.id, ['import_rejected'])

      const canceledUpload = await upload(userA.id, 'audit-canceled.csv', `${medicareHeader}\n08/09/2026,Canceled review,25,Example Medical,$10.00,$5.00,$5.00`)
      assert.equal(canceledUpload.status, 201)
      const canceledRecord = await json<{ id: string }>(canceledUpload)
      assert.equal((await patch(userA.id, canceledRecord.id, { action: 'cancel' })).status, 200)
      await assertActions(canceledRecord.id, ['source_uploaded', 'review_canceled'])
      const canceledImport = await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: canceledRecord.id } })
      assert.equal(canceledImport.status, 'canceled')
      assert.ok(canceledImport.deletedAt)

      const removedUpload = await upload(userA.id, 'audit-removed.csv', `${medicareHeader}\n08/09/2026,Removed source,26,Example Medical,$11.00,$6.00,$5.00`)
      assert.equal(removedUpload.status, 201)
      const removedRecord = await json<{ id: string; rows: Array<{ id: string }> }>(removedUpload)
      assert.equal((await remove(userA.id, removedRecord.id)).status, 200)
      await assertActions(removedRecord.id, ['source_uploaded', 'source_removed'])
      const removedImport = await prisma.healthClaimImport.findUniqueOrThrow({ where: { id: removedRecord.id } })
      assert.ok(removedImport.deletedAt)
      assert.deepEqual(await prisma.healthClaimImportRow.findMany({ where: { importId: removedRecord.id } }), [])
      assert.equal(await prisma.healthClaimImportAudit.count({ where: { importId: removedRecord.id } }), 2)
      assert.equal((await read(userA.id, removedRecord.id)).status, 200)
      routeSession.userId = userA.id
      const liveImportList = await listImports()
      assert.equal(liveImportList.status, 200)
      const listedLiveImports = await liveImportList.json() as Array<{ id: string }>
      assert.ok(!listedLiveImports.some((item) => item.id === removedRecord.id))
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined)
      await prisma.$disconnect()
      routeSession.userId = ''
    }
  })
  it('erases imported claims and review payloads while retaining a metadata-only tombstone after account deletion', async () => {
    const suffix = `${process.pid}-${Date.now()}`
    const user = await prisma.user.create({ data: { email: `health-retention-legacy-${suffix}@example.test` } })

    let medicareImportId = ''
    const legacyRowOwner = await prisma.user.create({ data: { email: `health-account-delete-drift-${suffix}@example.test` } })

    const formerEmail = user.email
    let importId = ''
    let replacementUserId: string | undefined
    const storageKey = `private/${user.id}/health-claims/legacy-private-claim.csv`
    const importSha = `b${suffix.replace(/\D/g, '').padEnd(63, '0').slice(0, 63)}`
    const privateClaimValue = 'private physiotherapy claim value'
    const legacyPrivateClaimValue = 'legacy mismatched private claim must be erased'

    try {
      const mobileDevice = await prisma.mobileDevice.create({
        data: {
          userId: user.id,
          installId: `install-${suffix}`,
          platform: 'ios',
          deviceName: 'Acceptance iPhone',
        },
      })
      const mobileStorageKey = `test/${user.id}/mobile-uploads/private-statement.csv`
      const mobileUpload = await prisma.mobileUpload.create({
        data: {
          userId: user.id,
          fileName: 'private-statement.csv',
          contentType: 'text/csv',
          byteSize: 512,
          sha256: `c${suffix.replace(/\D/g, '').padEnd(63, '0').slice(0, 63)}`,
          storageKey: mobileStorageKey,
          expiresAt: new Date('2026-10-08T00:00:00.000Z'),
        },
      })
      const healthBatch = await prisma.appleHealthImportBatch.create({
        data: {
          userId: user.id,
          deviceId: mobileDevice.id,
          sampleType: 'stepCount',
          nextAnchor: 'acceptance-next-anchor',
          requestHash: `health-request-${suffix}`,
          acceptedCount: 1,
          duplicateCount: 0,
          deletionCount: 1,
        },
      })
      await prisma.appleHealthSample.create({
        data: {
          userId: user.id,
          batchId: healthBatch.id,
          healthKitUuid: `sample-${suffix}`,
          sampleType: 'stepCount',
          value: 1234,
          unit: 'count',
          startAt: new Date('2026-09-08T00:00:00.000Z'),
          endAt: new Date('2026-09-08T00:05:00.000Z'),
          sourceBundleId: 'com.apple.Health',
          sourceRevision: 'acceptance',
          metadata: {},
          payloadHash: `sample-hash-${suffix}`,
        },
      })
      await prisma.appleHealthDeletion.create({
        data: {
          userId: user.id,
          batchId: healthBatch.id,
          healthKitUuid: `deleted-sample-${suffix}`,
          sampleType: 'stepCount',
          healthKitDeletedAt: new Date('2026-09-08T00:06:00.000Z'),
        },
      })
      await prisma.appleHealthAuditRecord.create({
        data: {
          userId: user.id,
          deviceId: mobileDevice.id,
          action: 'import_completed',
          subjectType: 'import_batch',
          subjectId: healthBatch.id,
          details: { acceptedCount: 1, deletionCount: 1 },
        },
      })
      const policy = await prisma.phiPolicy.create({
        data: {
          userId: user.id,
          policyName: 'Acceptance private health policy',
          policyNumber: 'POLICY-PRIVATE-CANARY',
        },
      })
      const imported = await prisma.healthClaimImport.create({
        data: {
          userId: user.id,
          kind: 'medicare',
          fileName: 'legacy-private-claim.csv',
          contentType: 'text/csv',
          byteSize: 64,
          sha256: 'b'.repeat(64),
          storageKey: `private/${user.id}/health-claims/legacy-private-claim.csv`,
          status: 'review',
        },
      })
      importId = imported.id
      const row = await prisma.healthClaimImportRow.create({
        data: {
          importId: imported.id,
          userId: user.id,
          rowNumber: 2,
          fingerprint: `private-claim-${suffix}`,
          data: {
            claimNumber: 'PH-DELETE-001',
            description: privateClaimValue,
            provider: 'Private clinic',
            benefitAmount: 60,
          },
          status: 'confirmed',
        },
      })
      let legacyRowId = ''
      await prisma.$executeRaw`
        ALTER TABLE "HealthClaimImportRow"
        DROP CONSTRAINT "HealthClaimImportRow_importId_userId_fkey"
      `
      await prisma.$executeRaw`ALTER TABLE "HealthClaimImportRow" DISABLE TRIGGER "HealthClaimImportRow_owner_integrity"`
      try {
        const legacyRow = await prisma.healthClaimImportRow.create({
          data: {
            importId: imported.id,
            userId: legacyRowOwner.id,
            rowNumber: 3,
            fingerprint: `legacy-private-claim-${suffix}`,
            data: {
              claimNumber: 'PH-LEGACY-DRIFT',
              description: legacyPrivateClaimValue,
              provider: 'Legacy private clinic',
              benefitAmount: 91,
            },
            status: 'valid',
          },
        })
        legacyRowId = legacyRow.id
      } finally {
        await prisma.$executeRaw`ALTER TABLE "HealthClaimImportRow" ENABLE TRIGGER "HealthClaimImportRow_owner_integrity"`
        await prisma.$executeRaw`
          ALTER TABLE "HealthClaimImportRow"
          ADD CONSTRAINT "HealthClaimImportRow_importId_userId_fkey"
          FOREIGN KEY ("importId", "userId")
          REFERENCES "HealthClaimImport"("id", "userId")
          ON DELETE CASCADE
          ON UPDATE RESTRICT
          NOT VALID
        `
      }
      await prisma.healthClaimImportAudit.createMany({
        data: [
          {
            importId: imported.id,
            userId: user.id,
            actorUserId: user.id,
            action: 'source_uploaded',
          },
          {
            importId: imported.id,
            userId: user.id,
            actorUserId: user.id,
            action: 'import_confirmed',
          },
        ],
      })
      const claim = await prisma.phiClaim.create({
        data: {
          userId: user.id,
          policyId: policy.id,
          claimNumber: 'PH-DELETE-001',
          serviceDate: new Date('2026-07-01T00:00:00.000Z'),
          provider: 'Private clinic',
          serviceType: 'Extras',
          description: privateClaimValue,
          chargedAmount: 100,
          benefitAmount: 60,
          outOfPocket: 40,
          benefitDetail: 'Annual limit benefit',
          sourceImportId: imported.id,
          sourceRowId: row.id,
          importFingerprint: row.fingerprint,
        },
      })
      const medicareClaim = await prisma.medicareClaim.create({
        data: {
          userId: user.id,
          serviceDate: new Date('2026-07-02T00:00:00.000Z'),
          description: 'Imported Medicare claim must not survive deletion',
          provider: 'Private Medicare clinic',
          benefitPaid: 45,
          outOfPocket: 55,
          sourceImportId: imported.id,
          importFingerprint: `medicare-delete-${suffix}`,
        },
      })
      const { DELETE: deleteAccount } = await import('../app/api/account/delete/route.ts')
      routeSession.userId = user.id
      routeSession.authTime = Math.floor(Date.now() / 1000)
      const response = await deleteAccount(new Request('http://health-claims.test/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
      }))
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json().then((body) => body.deleted), true)
      assert.ok(deletedStorageKeys.includes(storageKey))
      assert.ok(deletedStorageKeys.includes(mobileStorageKey))
      assert.equal(await prisma.mobileUpload.count({ where: { id: mobileUpload.id } }), 0)
      assert.equal(await prisma.appleHealthSample.count({ where: { batchId: healthBatch.id } }), 0)
      assert.equal(await prisma.appleHealthDeletion.count({ where: { batchId: healthBatch.id } }), 0)
      assert.equal(await prisma.appleHealthImportBatch.count({ where: { id: healthBatch.id } }), 0)
      assert.equal(await prisma.appleHealthAuditRecord.count({ where: { userId: user.id } }), 0)

      assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null)
      assert.equal(await prisma.phiClaim.count({ where: { id: claim.id } }), 0)
      assert.equal(await prisma.medicareClaim.count({ where: { id: medicareClaim.id } }), 0)
      assert.equal(await prisma.phiPolicy.count({ where: { id: policy.id } }), 0)
      assert.equal(await prisma.healthClaimImportRow.count({ where: { id: row.id } }), 0)
      assert.equal(await prisma.healthClaimImportRow.count({ where: { id: legacyRowId } }), 0)
      assert.equal(
        await prisma.healthClaimImportRow.count({
          where: { data: { path: ['description'], equals: legacyPrivateClaimValue } },
        }),
        0,
      )

      const tombstone = await prisma.healthClaimImport.findUniqueOrThrow({
        where: { id: imported.id },
        select: {
          kind: true,
          status: true,
          contentType: true,
          byteSize: true,
          fileName: true,
          sha256: true,
          storageKey: true,
          detectedFields: true,
          parseErrors: true,
          userId: true,
          deletedAt: true,
          rows: { select: { id: true } },
          auditEvents: {
            select: { action: true, userId: true, actorUserId: true, changedFields: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      assert.deepEqual({
        kind: tombstone.kind,
        status: tombstone.status,
        contentType: tombstone.contentType,
        byteSize: tombstone.byteSize,
        fileName: tombstone.fileName,
        sha256: tombstone.sha256,
        storageKey: tombstone.storageKey,
        detectedFields: tombstone.detectedFields,
        parseErrors: tombstone.parseErrors,
        userId: tombstone.userId,
        hasDeletedAt: Boolean(tombstone.deletedAt),
        rowCount: tombstone.rows.length,
        auditEvents: tombstone.auditEvents,
      }, {
        kind: 'medicare',
        status: 'review',
        contentType: 'text/csv',
        byteSize: 64,
        fileName: '[deleted]',
        sha256: '[deleted]',
        storageKey: '[deleted]',
        detectedFields: null,
        parseErrors: null,
        userId: null,
        hasDeletedAt: true,
        rowCount: 0,
        auditEvents: [
          { action: 'source_uploaded', userId: null, actorUserId: null, changedFields: null },
          { action: 'import_confirmed', userId: null, actorUserId: null, changedFields: null },
        ],
      })
      assert.doesNotMatch(
        JSON.stringify(tombstone),
        /POLICY-PRIVATE-CANARY|PH-DELETE-001|PH-LEGACY-DRIFT|private physiotherapy|legacy mismatched|Private clinic|"benefitAmount":(?:91|60)/,
      )
      const portableExport = await collectPortableAccountData(user.id)
      const serializedPortableExport = JSON.stringify(portableExport)
      assert.equal(portableExport.manifest.includedModels.includes('HealthClaimImport'), false)
      assert.equal(portableExport.manifest.includedModels.includes('HealthClaimImportRow'), false)
      assert.equal(portableExport.manifest.includedModels.includes('HealthClaimImportAudit'), false)
      for (const deletedAccountMarker of [
        'legacy-private-claim.csv',
        importSha,
        'private parser metadata canary',
        storageKey,
        'source_uploaded',
        'import_confirmed',
        privateClaimValue,
        legacyPrivateClaimValue,
        'Imported Medicare claim must not survive deletion',
        'POLICY-PRIVATE-CANARY',
        'PH-DELETE-001',
      ]) {
        assert.equal(
          serializedPortableExport.includes(deletedAccountMarker),
          false,
          `portable export leaked deleted-account marker: ${deletedAccountMarker}`,
        )
      }
      const { GET: listImports } = await import('../app/api/health-claims/import/route.ts')
      const { GET: getImport, PATCH: patchImport, DELETE: deleteImport } = await import('../app/api/health-claims/import/[id]/route.ts')

      const { GET: listMedicareClaims } = await import('../app/api/medicare-claims/route.ts')
      const listResponse = await listImports()
      assert.equal(listResponse.status, 200)
      const listedImports = await listResponse.json() as Array<{ id: string }>
      assert.ok(!listedImports.some((item) => item.id === imported.id))

      const detailResponse = await getImport(
        new Request(`http://health-claims.test/api/health-claims/import/${imported.id}`),
        { params: Promise.resolve({ id: imported.id }) },
      )
      assert.equal(detailResponse.status, 404)
      assert.deepEqual(await detailResponse.json(), {
        error: { code: 'NOT_FOUND', message: 'Import not found' },
      })

      const detachedMutationContext = { params: Promise.resolve({ id: imported.id }) }
      const detachedMutationError = { error: { code: 'NOT_FOUND', message: 'Import not found' } }
      const storageKeysBeforeDetachedMutation = [...deletedStorageKeys]
      const saveResponse = await patchImport(
        new Request(`http://health-claims.test/api/health-claims/import/${imported.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'save', rows: [] }),
        }),
        detachedMutationContext,
      )
      assert.equal(saveResponse.status, 404)
      assert.deepEqual(await saveResponse.json(), detachedMutationError)

      const confirmResponse = await patchImport(
        new Request(`http://health-claims.test/api/health-claims/import/${imported.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'confirm' }),
        }),
        detachedMutationContext,
      )
      assert.equal(confirmResponse.status, 404)
      assert.deepEqual(await confirmResponse.json(), detachedMutationError)

      const deleteResponse = await deleteImport(
        new Request(`http://health-claims.test/api/health-claims/import/${imported.id}`, { method: 'DELETE' }),
        detachedMutationContext,
      )
      assert.equal(deleteResponse.status, 404)
      assert.deepEqual(await deleteResponse.json(), detachedMutationError)
      assert.deepEqual(deletedStorageKeys, storageKeysBeforeDetachedMutation)
      assert.deepEqual(
        await prisma.healthClaimImportAudit.findMany({
          where: { importId: imported.id },
          select: { action: true },
          orderBy: { createdAt: 'asc' },
        }),
        [{ action: 'source_uploaded' }, { action: 'import_confirmed' }],
      )

      const replacementUser = await prisma.user.create({ data: { email: formerEmail } })
      const { GET: listPolicies } = await import('../app/api/phi-policies/route.ts')
      replacementUserId = replacementUser.id
      routeSession.userId = replacementUser.id
      routeSession.authTime = Math.floor(Date.now() / 1000)

      const replacementImportListResponse = await listImports()
      assert.equal(replacementImportListResponse.status, 200)
      const replacementImports = await replacementImportListResponse.json() as Array<{ id: string }>
      assert.ok(!replacementImports.some((item) => item.id === imported.id))

      const replacementImportDetailResponse = await getImport(
        new Request(`http://health-claims.test/api/health-claims/import/${imported.id}`),
        { params: Promise.resolve({ id: imported.id }) },
      )
      assert.equal(replacementImportDetailResponse.status, 404)
      assert.deepEqual(await replacementImportDetailResponse.json(), detachedMutationError)

      const replacementMedicareResponse = await listMedicareClaims(
        new Request('http://health-claims.test/api/medicare-claims?year=2026'),
      )
      assert.equal(replacementMedicareResponse.status, 200)
      const replacementMedicareBody = await replacementMedicareResponse.json() as { claims: unknown[] }
      assert.deepEqual(replacementMedicareBody.claims, [])

      const replacementPoliciesResponse = await listPolicies()
      assert.equal(replacementPoliciesResponse.status, 200)
      assert.deepEqual(await replacementPoliciesResponse.json(), [])
    } finally {
      routeSession.userId = ''
      routeSession.authTime = Math.floor(Date.now() / 1000)
      await prisma.healthClaimImport.delete({ where: { id: importId } }).catch(() => undefined)
      if (replacementUserId) {
        await prisma.user.delete({ where: { id: replacementUserId } }).catch(() => undefined)
      }
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: legacyRowOwner.id } }).catch(() => undefined)
      await prisma.$disconnect()
      deletedStorageKeys.length = 0
    }
  })

  it('blocks account deletion when legacy audit metadata contains claim values', async () => {
    const suffix = `${process.pid}-${Date.now()}`
    const user = await prisma.user.create({ data: { email: `health-retention-legacy-${suffix}@example.test` } })

    let medicareImportId = ''
    const sensitiveValue = 'legacy private diagnosis'
    let importId = ''

    try {
      const imported = await prisma.healthClaimImport.create({
        data: {
          userId: user.id,
          kind: 'medicare',
          fileName: 'legacy-private-claim.csv',
          contentType: 'text/csv',
          byteSize: 64,
          sha256: 'b'.repeat(64),
          storageKey: `private/${user.id}/health-claims/legacy-private-claim.csv`,
          status: 'review',
        },
      })
      importId = imported.id
      await prisma.$executeRawUnsafe('ALTER TABLE "HealthClaimImportAudit" DISABLE TRIGGER "HealthClaimImportAudit_metadata_safety"')
      try {
        await prisma.healthClaimImportAudit.create({
          data: {
            importId,
            userId: user.id,
            actorUserId: user.id,
            action: 'row_edited',
            changedFields: { description: sensitiveValue },
          },
        })
      } finally {
        await prisma.$executeRawUnsafe('ALTER TABLE "HealthClaimImportAudit" ENABLE TRIGGER "HealthClaimImportAudit_metadata_safety"')
      }

      routeSession.userId = user.id
      routeSession.authTime = Math.floor(Date.now() / 1000)
      const { DELETE: deleteAccount } = await import('../app/api/account/delete/route.ts')
      const deletionResponse = await deleteAccount(new Request('http://health-claims.test/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
      }))
      assert.equal(deletionResponse.status, 409)
      const responseBody = await deletionResponse.text()
      assert.doesNotMatch(responseBody, new RegExp(sensitiveValue))

      const unchangedImport = await prisma.healthClaimImport.findUniqueOrThrow({
        where: { id: importId },
        select: { userId: true, fileName: true, storageKey: true },
      })
      assert.deepEqual(unchangedImport, {
        userId: user.id,
        fileName: 'legacy-private-claim.csv',
        storageKey: `private/${user.id}/health-claims/legacy-private-claim.csv`,
      })
    } finally {
      routeSession.userId = ''
      routeSession.authTime = Math.floor(Date.now() / 1000)
      await prisma.healthClaimImport.delete({ where: { id: importId } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })
})

      const privateAudit = await prisma.healthClaimImportAudit.findFirstOrThrow({
        where: { importId: privateImportId, action: 'row_edited' },
        select: { changedFields: true },
      })

      const storedMedicare = await prisma.healthClaimImportRow.findUniqueOrThrow({
        where: { id: medicareRow.id },
        select: { data: true },
      })

      const medicareAudit = await prisma.healthClaimImportAudit.findFirstOrThrow({
        where: { importId: medicareImportId, action: 'row_edited' },
        select: { changedFields: true },
      })

      const privateUpload = await upload(
        'private_health',
        'immutable-private-health.csv',
        [
          'Claim Number,Service Date,Description,Provider,Service Type,Item Number,Charged Amount,Benefit Amount,Out of Pocket,Benefit Detail,Claim Status',
          'PH-100,01/07/2026,Physiotherapy,North Clinic,Extras,P100,$100,$60,$40,Annual limit benefit,Paid',
        ].join('\n'),
      )

      const medicareRecord = await json<{
        id: string
        rows: Array<{ id: string; data: Record<string, unknown> }>
      }>(medicareUpload)

      const storedPrivateData = storedPrivate.data as Record<string, unknown>

      const storedMedicareData = storedMedicare.data as Record<string, unknown>

      const privateRecord = await json<{
        id: string
        rows: Array<{ id: string; data: Record<string, unknown> }>
      }>(privateUpload)

      const storedPrivate = await prisma.healthClaimImportRow.findUniqueOrThrow({
        where: { id: privateRow.id },
        select: { data: true },
      })

      const privateSave = await patch(privateImportId, {
        action: 'save',
        rows: [{
          id: privateRow.id,
          data: {
            ...privateOriginal,
            provider: 'Corrected provider',
            serviceType: 'Dental',
            itemNumber: 'P999',
            benefitDetail: 'Tampered benefit detail',
            claimStatus: 'Rejected',
          },
        }],
      })

      const medicareSave = await patch(medicareImportId, {
        action: 'save',
        rows: [{
          id: medicareRow.id,
          data: {
            ...medicareOriginal,
            description: 'Corrected GP consultation',
            scheduleFee: 999,
            financialYear: '2099-00',
            isForecast: true,
            countsToSafetyNet: false,
          },
        }],
      })

    let privateImportId = ''

        let groupedCount = 0

    const capture = (...args: unknown[]) => logged.push(args.map((value) => String(value)).join(' '))

      const [wide, compact, lowQuality] = await Promise.all([
        parseHealthClaimFile('medicare', 'wide-scan.pdf', 'application/pdf', wideScannedMedicareStatementPdf()),
        parseHealthClaimFile('medicare', 'compact-scan.pdf', 'application/pdf', compactScannedMedicareStatementPdf()),
        parseHealthClaimFile('medicare', 'low-quality-scan.pdf', 'application/pdf', lowQualityScannedMedicareStatementPdf()),
      ])

    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    }

const databaseAcceptanceInterruptDelayMs = Number.parseInt(
  process.env.HEALTH_CLAIM_DATABASE_INTERRUPT_DELAY_MS ?? '',
  10,
)

const pauseForDatabaseAcceptanceInterruption = async () => {
  if (
    !databaseAcceptanceInterruptMarker
    || !Number.isFinite(databaseAcceptanceInterruptDelayMs)
    || databaseAcceptanceInterruptDelayMs <= 0
  ) {
    return
  }

  await writeFile(databaseAcceptanceInterruptMarker, 'health claim database test started\n', 'utf8')
  await new Promise((resolve) => setTimeout(resolve, databaseAcceptanceInterruptDelayMs))
}
