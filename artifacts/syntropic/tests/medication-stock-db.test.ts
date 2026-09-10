/* Database acceptance coverage. Enable only against an isolated disposable DB:
 * MEDICATION_STOCK_DATABASE_TESTS=1 pnpm exec tsx --test --experimental-test-module-mocks tests/medication-stock-db.test.ts */
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { prisma } from '../lib/db.ts'
import { withMedicationStockTransaction } from '../lib/medication-stock.ts'

const enabled = process.env.MEDICATION_STOCK_DATABASE_TESTS === '1'
const session = { userId: '' }

mock.module('@/auth', {
  namedExports: {
    auth: async () => session.userId ? { user: { id: session.userId } } : null,
  },
})

const json = (body: unknown, method = 'POST') => new Request('http://medication-stock.test', {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const orderedLedger = async (userId: string, medicationId: string) =>
  prisma.stockTransaction.findMany({
    where: { userId, medicationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { quantityChange: true, balanceAfter: true, notes: true },
  })

const assertLedgerMatchesStock = async (userId: string, medicationId: string, initial: number) => {
  const stock = await prisma.stockLevel.findUniqueOrThrow({
    where: { userId_medicationId: { userId, medicationId } },
    select: { currentQuantity: true },
  })
  const ledger = await orderedLedger(userId, medicationId)
  let balance = initial
  for (const entry of ledger) {
    if (!entry.notes?.startsWith('Historical stock reconciliation:')) balance += entry.quantityChange
    assert.equal(entry.balanceAfter, balance)
    assert.ok(entry.balanceAfter >= 0)
  }
  assert.equal(stock.currentQuantity, balance)
}

describe('medication stock database concurrency acceptance', { skip: !enabled }, () => {
  it('caps parallel repeat dispensing at the prescription allowance', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const user = await prisma.user.create({ data: { email: `medication-race-${suffix}@example.test` } })
    session.userId = user.id
    const medication = await prisma.medication.create({ data: { userId: user.id, name: 'Race test medication' } })
    const prescription = await prisma.prescription.create({
      data: {
        userId: user.id,
        medicationId: medication.id,
        datePrescribed: new Date(),
        quantity: 10,
        repeats: 4,
        repeatsUsed: 0,
        expiryDate: new Date(Date.now() + 86_400_000),
      },
    })
    await prisma.stockLevel.create({ data: { userId: user.id, medicationId: medication.id, currentQuantity: 10 } })

    try {
      const { PATCH } = await import('../app/api/prescriptions/[id]/route.ts')
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => PATCH(
          json({ action: 'dispense' }),
          { params: Promise.resolve({ id: prescription.id }) },
        )),
      )
      assert.equal(responses.filter(response => response.status === 200).length, 5)
      assert.equal(responses.filter(response => response.status === 400).length, 3)

      const finalPrescription = await prisma.prescription.findUniqueOrThrow({ where: { id: prescription.id } })
      assert.equal(finalPrescription.repeatsUsed, 5)
      const finalStock = await prisma.stockLevel.findUniqueOrThrow({
        where: { userId_medicationId: { userId: user.id, medicationId: medication.id } },
      })
      assert.equal(finalStock.currentQuantity, 60)
      await assertLedgerMatchesStock(user.id, medication.id, 10)
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('keeps concurrent doses, corrections, and manual deductions non-negative', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const user = await prisma.user.create({ data: { email: `dose-race-${suffix}@example.test` } })
    session.userId = user.id
    const medication = await prisma.medication.create({ data: { userId: user.id, name: 'Dose race medication' } })
    const prescription = await prisma.prescription.create({
      data: { userId: user.id, medicationId: medication.id, datePrescribed: new Date(), quantity: 30 },
    })
    const schedule = await prisma.dosageSchedule.create({
      data: {
        userId: user.id,
        prescriptionId: prescription.id,
        frequency: 'daily',
        times: ['08:00'],
        doseAmount: '1',
        startDate: new Date(),
      },
    })
    await prisma.stockLevel.create({ data: { userId: user.id, medicationId: medication.id, currentQuantity: 7 } })

    try {
      const [{ POST: logDose }, { POST: recordStock }] = await Promise.all([
        import('../app/api/medication-logs/route.ts'),
        import('../app/api/stock-transactions/route.ts'),
      ])
      const initialLogResponse = await logDose(json({ scheduleId: schedule.id, doseTaken: 1 }))
      assert.equal(initialLogResponse.status, 201)
      const initialLog = await prisma.medicationLog.findFirstOrThrow({ where: { userId: user.id } })
      const requests = [
        ...Array.from({ length: 6 }, () => logDose(json({ scheduleId: schedule.id, doseTaken: 1 }))),
        ...Array.from({ length: 6 }, () => recordStock(json({ medicationId: medication.id, type: 'consume', quantityChange: -1 }))),
      ]
      const responses = await Promise.all(requests)
      assert.equal(responses.filter(response => response.status === 201 || response.status === 200).length, 6)
      assert.equal(responses.filter(response => response.status === 409).length, 6)
      await assertLedgerMatchesStock(user.id, medication.id, 7)

      const adjustment = await recordStock(json({ medicationId: medication.id, type: 'adjustment', quantityChange: 2 }))
      assert.equal(adjustment.status, 200)
      const { PATCH } = await import('../app/api/medication-logs/[id]/route.ts')
      const corrections = await Promise.all([
        PATCH(json({ doseTaken: 2 }, 'PATCH'), { params: Promise.resolve({ id: initialLog.id }) }),
        PATCH(json({ doseTaken: 2 }, 'PATCH'), { params: Promise.resolve({ id: initialLog.id }) }),
      ])
      assert.ok(corrections.every(response => response.status === 200))
      await assertLedgerMatchesStock(user.id, medication.id, 7)
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('uses a deterministic retry budget for transaction conflicts', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const user = await prisma.user.create({ data: { email: `retry-race-${suffix}@example.test` } })
    const medication = await prisma.medication.create({ data: { userId: user.id, name: 'Retry test medication' } })
    try {
      let attempts = 0
      await assert.rejects(
        () => withMedicationStockTransaction(user.id, medication.id, async () => {
          attempts += 1
          throw Object.assign(new Error('serialization conflict'), { code: 'P2034' })
        }),
        (error: unknown) => error instanceof Error && error.message === 'serialization conflict',
      )
      assert.equal(attempts, 8)
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('warns only the owner about inconsistent historical snapshots and blocks reconciliation', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const owner = await prisma.user.create({ data: { email: `stock-history-owner-${suffix}@example.test` } })
    const otherUser = await prisma.user.create({ data: { email: `stock-history-other-${suffix}@example.test` } })
    const ownerMedication = await prisma.medication.create({ data: { userId: owner.id, name: 'Owner history review medication' } })
    const otherMedication = await prisma.medication.create({ data: { userId: otherUser.id, name: 'Other history review medication' } })
    const ownerStock = await prisma.stockLevel.create({ data: { userId: owner.id, medicationId: ownerMedication.id, currentQuantity: 9 } })
    await prisma.stockLevel.create({ data: { userId: otherUser.id, medicationId: otherMedication.id, currentQuantity: 5 } })
    await prisma.stockTransaction.createMany({
      data: [
        { userId: owner.id, medicationId: ownerMedication.id, type: 'stocktake', quantityChange: 10, balanceAfter: 10, countedQuantity: 10 },
        { userId: owner.id, medicationId: ownerMedication.id, type: 'consume', quantityChange: -1, balanceAfter: 12 },
        { userId: otherUser.id, medicationId: otherMedication.id, type: 'stocktake', quantityChange: 5, balanceAfter: 7, countedQuantity: 5 },
      ],
    })
    session.userId = owner.id

    try {
      const { GET, POST } = await import('../app/api/stock-levels/route.ts')
      const diagnosticResponse = await GET()
      assert.equal(diagnosticResponse.status, 200)
      const diagnostics = await diagnosticResponse.json()
      assert.equal(diagnostics.length, 1)
      assert.equal(diagnostics[0].medicationId, ownerMedication.id)
      assert.equal(diagnostics[0].ledgerQuantity, 9)
      assert.equal(diagnostics[0].historicalBalanceMismatchCount, 1)
      assert.equal(diagnostics[0].hasHistoricalInconsistency, true)
      assert.equal(diagnostics[0].hasMismatch, false)
      const ownerEntries = await prisma.stockTransaction.findMany({
        where: { userId: owner.id, medicationId: ownerMedication.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, date: true },
      })
      assert.deepEqual(diagnostics[0].historicalMismatches, [{
        id: ownerEntries[1].id,
        date: ownerEntries[1].date.toISOString(),
        recordedBalanceAfter: 12,
        ledgerBalance: 9,
      }])

      const reconciliationResponse = await POST(json({
        action: 'reconcile',
        id: ownerStock.id,
        expectedCurrentQuantity: 9,
        expectedLedgerQuantity: 9,
      }))
      assert.equal(reconciliationResponse.status, 409)
      const reconciliation = await reconciliationResponse.json()
      assert.match(reconciliation.error, /history needs review/i)
      assert.equal(reconciliation.diagnostic.hasHistoricalInconsistency, true)
      assert.equal(await prisma.stockTransaction.count({ where: { userId: owner.id, medicationId: ownerMedication.id } }), 2)

      session.userId = otherUser.id
      const otherDiagnostics = await GET()
      assert.equal(otherDiagnostics.status, 200)
      const otherDiagnosticList = await otherDiagnostics.json()
      assert.equal(otherDiagnosticList.length, 1)
      assert.equal(otherDiagnosticList[0].medicationId, otherMedication.id)
      assert.equal(otherDiagnosticList[0].hasHistoricalInconsistency, true)
      assert.equal(otherDiagnosticList[0].historicalMismatches.length, 1)
      assert.notEqual(otherDiagnosticList[0].historicalMismatches[0].id, diagnostics[0].historicalMismatches[0].id)
      assert.notEqual(otherDiagnosticList[0].medicationId, ownerMedication.id)
    } finally {
      session.userId = ''
      await prisma.user.delete({ where: { id: owner.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
    }
  })

  it('diagnoses only the owner’s mismatch and records an audited reconciliation adjustment', async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const owner = await prisma.user.create({ data: { email: `stock-reconcile-owner-${suffix}@example.test` } })
    const otherUser = await prisma.user.create({ data: { email: `stock-reconcile-other-${suffix}@example.test` } })
    const ownerMedication = await prisma.medication.create({ data: { userId: owner.id, name: 'Owner reconciliation medication' } })
    const otherMedication = await prisma.medication.create({ data: { userId: otherUser.id, name: 'Other reconciliation medication' } })
    const ownerStock = await prisma.stockLevel.create({ data: { userId: owner.id, medicationId: ownerMedication.id, currentQuantity: 8 } })
    await prisma.stockLevel.create({ data: { userId: otherUser.id, medicationId: otherMedication.id, currentQuantity: 5 } })
    await prisma.stockTransaction.createMany({
      data: [
        { userId: owner.id, medicationId: ownerMedication.id, type: 'stocktake', quantityChange: 10, balanceAfter: 10, countedQuantity: 10 },
        { userId: owner.id, medicationId: ownerMedication.id, type: 'consume', quantityChange: -1, balanceAfter: 9 },
        { userId: otherUser.id, medicationId: otherMedication.id, type: 'stocktake', quantityChange: 5, balanceAfter: 5, countedQuantity: 5 },
      ],
    })
    session.userId = owner.id

    try {
      const { GET, POST } = await import('../app/api/stock-levels/route.ts')
      const diagnosticResponse = await GET()
      assert.equal(diagnosticResponse.status, 200)
      const diagnostics = await diagnosticResponse.json()
      assert.equal(diagnostics.length, 1)
      assert.equal(diagnostics[0].medicationId, ownerMedication.id)
      assert.equal(diagnostics[0].ledgerQuantity, 9)
      assert.equal(diagnostics[0].mismatchQuantity, 1)
      assert.equal(diagnostics[0].hasMismatch, true)
      assert.equal(diagnostics[0].transactionCount, 2)

      const reconciliationResponse = await POST(json({
        action: 'reconcile',
        id: ownerStock.id,
        expectedCurrentQuantity: 8,
        expectedLedgerQuantity: 9,
      }))
      assert.equal(reconciliationResponse.status, 200)
      const reconciliation = await reconciliationResponse.json()
      assert.equal(reconciliation.diagnostic.currentQuantity, 9)
      assert.equal(reconciliation.diagnostic.ledgerQuantity, 9)
      assert.equal(reconciliation.diagnostic.transactionCount, 3)
      assert.equal(reconciliation.diagnostic.hasMismatch, false)
      assert.equal(reconciliation.stock.currentQuantity, 9)
      assert.equal(reconciliation.transaction.type, 'adjustment')
      assert.equal(reconciliation.transaction.quantityChange, 1)
      assert.equal(reconciliation.transaction.balanceAfter, 9)
      assert.match(reconciliation.transaction.notes, /Historical stock reconciliation/)

      const settledDiagnosticResponse = await GET()
      assert.equal(settledDiagnosticResponse.status, 200)
      const settledDiagnostics = await settledDiagnosticResponse.json()
      assert.equal(settledDiagnostics[0].currentQuantity, 9)
      assert.equal(settledDiagnostics[0].ledgerQuantity, 9)
      assert.equal(settledDiagnostics[0].mismatchQuantity, 0)
      assert.equal(settledDiagnostics[0].hasMismatch, false)
      assert.equal(settledDiagnostics[0].lastLedgerBalance, 9)
      await assertLedgerMatchesStock(owner.id, ownerMedication.id, 0)

      const entries = await prisma.stockTransaction.findMany({
        where: { userId: owner.id, medicationId: ownerMedication.id },
        orderBy: { createdAt: 'asc' },
      })
      assert.equal(entries.length, 3)
      assert.equal(entries.at(-1)?.type, 'adjustment')
      assert.equal(entries.at(-1)?.quantityChange, 1)

      session.userId = otherUser.id
      const forbiddenResponse = await POST(json({
        action: 'reconcile',
        id: ownerStock.id,
        expectedCurrentQuantity: 8,
        expectedLedgerQuantity: 9,
      }))
      assert.equal(forbiddenResponse.status, 404)
      assert.equal(await prisma.stockTransaction.count({ where: { userId: owner.id, medicationId: ownerMedication.id } }), 3)

      session.userId = owner.id
      const staleResponse = await POST(json({
        action: 'reconcile',
        id: ownerStock.id,
        expectedCurrentQuantity: 8,
        expectedLedgerQuantity: 9,
      }))
      assert.equal(staleResponse.status, 409)
      assert.equal(await prisma.stockTransaction.count({ where: { userId: owner.id, medicationId: ownerMedication.id } }), 3)
    } finally {
      session.userId = ''
      await prisma.user.delete({ where: { id: owner.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
    }
  })
})