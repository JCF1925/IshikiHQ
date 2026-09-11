import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  formatHistoricalStockMismatchResolutionNote,
  summarizeStockLedger,
  type StockLedgerEntry,
} from '../lib/medication-stock'

const firstDate = new Date('2026-09-01T09:00:00.000Z')
const secondDate = new Date('2026-09-02T09:00:00.000Z')
const resolutionDate = new Date('2026-09-03T09:00:00.000Z')

test('marks one historical mismatch resolved without rewriting the original ledger entry', () => {
  const originalEntries: StockLedgerEntry[] = [
    {
      id: 'cmismatchsource0001',
      date: firstDate,
      quantityChange: 10,
      balanceAfter: 10,
      notes: 'Initial stocktake',
      auditKind: null,
    },
    {
      id: 'cmismatchsource0002',
      date: secondDate,
      quantityChange: -1,
      balanceAfter: 12,
      notes: 'Dose logged',
      auditKind: null,
    },
  ]
  const originalSnapshot = structuredClone(originalEntries)
  const unresolved = summarizeStockLedger(9, originalEntries)

  assert.equal(unresolved.historicalBalanceMismatchCount, 1)
  assert.equal(unresolved.hasHistoricalInconsistency, true)
  assert.equal(unresolved.historicalMismatches[0].id, 'cmismatchsource0002')

  const resolved = summarizeStockLedger(9, [
    ...originalEntries,
    {
      id: 'cmismatchreview0001',
      date: resolutionDate,
      quantityChange: 0,
      balanceAfter: 9,
        auditKind: 'mismatch_resolution',
      notes: formatHistoricalStockMismatchResolutionNote({
        mismatchId: 'cmismatchsource0002',
        beforeRecordedBalance: 12,
        afterLedgerBalance: 9,
        reason: 'Reviewed against the dispensing record.',
      }),
    },
  ])

  assert.deepEqual(originalEntries, originalSnapshot)
  assert.equal(resolved.ledgerQuantity, 9)
  assert.equal(resolved.currentQuantity, 9)
  assert.equal(resolved.historicalBalanceMismatchCount, 0)
  assert.equal(resolved.hasHistoricalInconsistency, false)
  assert.equal(resolved.historicalMismatches.length, 1)
  assert.deepEqual(resolved.historicalMismatches[0].resolution, {
    id: 'cmismatchreview0001',
    date: resolutionDate,
    beforeRecordedBalance: 12,
    afterLedgerBalance: 9,
    reason: 'Reviewed against the dispensing record.',
  })
})


test('uses the persisted audit kind instead of mutable note wording', () => {
  const diagnostic = summarizeStockLedger(13, [
    {
      id: 'cmarker-operational0001',
      date: firstDate,
      quantityChange: 10,
      balanceAfter: 10,
      notes: 'Initial stocktake',
      auditKind: null,
    },
    {
      id: 'cmarker-reconciliation0001',
      date: secondDate,
      quantityChange: 99,
      balanceAfter: 109,
      notes: 'User-edited reconciliation note',
      auditKind: 'reconciliation',
    },
    {
      id: 'cmarker-lookalike0001',
      date: secondDate,
      quantityChange: 3,
      balanceAfter: 13,
      notes: 'Historical stock reconciliation: ordinary adjustment',
      auditKind: null,
    },
  ])

  assert.equal(diagnostic.ledgerQuantity, 13)
  assert.equal(diagnostic.lastLedgerBalance, 13)
  assert.equal(diagnostic.transactionCount, 3)
  assert.equal(diagnostic.hasMismatch, false)
})

test('migration backfills existing stock audit rows before note wording becomes non-authoritative', () => {
  const migration = readFileSync(
    new URL('../prisma/migrations/20261017000000_stock_transaction_audit_marker/migration.sql', import.meta.url),
    'utf8',
  )

  assert.match(migration, /CREATE TYPE "StockTransactionAuditKind" AS ENUM \('reconciliation', 'mismatch_resolution'\)/)
  assert.match(
    migration,
    /SET "auditKind" = 'reconciliation'[\s\S]*WHERE "notes" LIKE 'Historical stock reconciliation:%'/,
  )
  assert.match(
    migration,
    /SET "auditKind" = 'mismatch_resolution'[\s\S]*WHERE "notes" LIKE 'Historical stock mismatch resolution:%'/,
  )
})