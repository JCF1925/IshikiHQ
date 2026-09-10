/* API integration coverage. Run only against an isolated migrated database:
 * MOBILE_API_DATABASE_TESTS=1 pnpm exec tsx --test tests/mobile-api.integration.test.ts */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it, mock } from 'node:test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db.ts'

const enabled = process.env.MOBILE_API_DATABASE_TESTS === '1'
const accountDeletionSession = { userId: '', authTime: Math.floor(Date.now() / 1000) }

mock.module('@/auth', {
  namedExports: {
    auth: async () => accountDeletionSession.userId
      ? { user: { id: accountDeletionSession.userId }, authTime: accountDeletionSession.authTime }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })
mock.module('@/lib/s3', {
  namedExports: {
    deleteFile: async () => undefined,
  },
})

describe('mobile API offline recovery and Apple Health acceptance', { skip: !enabled }, () => {
  let app: typeof import('../../api-server/src/app.ts').default
  let database: typeof import('../../../lib/db/src/index.ts')
  let server: http.Server
  let baseUrl = ''
  let accessToken = ''
  let userId = ''

  let realApiProcess: ChildProcess | undefined
  const request = async (path: string, init: RequestInit = {}) => {
    return requestAs(accessToken, path, init)
  }

  const requestTo = async (targetBaseUrl: string, token: string, path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (init.body && !headers.has('content-type') && !(init.body instanceof Uint8Array)) {
      headers.set('content-type', 'application/json')
    }
    return fetch(`${targetBaseUrl}${path}`, { ...init, headers })
  }
  const requestAs = async (token: string, path: string, init: RequestInit = {}) => {
    return requestTo(baseUrl, token, path, init)
  }

  const json = async <T>(response: Response): Promise<T> => {
    const body = await response.json() as T
    return body
  }

  const push = async (idempotencyKey: string, changes: unknown[]) => request('/api/mobile/sync/push', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ changes }),
  })

  const availablePort = async () => {
    const probe = net.createServer()
    await new Promise<void>((resolve, reject) => probe.listen(0, '127.0.0.1', () => resolve()))
    const address = probe.address()
    assert.ok(address && typeof address !== 'string')
    const port = address.port
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
    return port
  }
  const login = async (email: string, password: string, installId: string, deviceName: string) => {
    const response = await requestAs('', '/api/mobile/auth/device-sessions', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        installId,
        platform: 'ios',
        deviceName,
        appVersion: 'acceptance',
      }),
    })
    assert.equal(response.status, 201)
    const session = await json<{ accessToken: string; deviceId: string }>(response)
    assert.ok(session.accessToken)
    assert.ok(session.deviceId)
    return session
  }

  before(async () => {
    const [appModule, dbModule] = await Promise.all([
      import('../../api-server/src/app.ts'),
      import('../../../lib/db/src/index.ts'),
    ])
    app = appModule.default
    database = dbModule
    userId = `mobile-api-${randomUUID()}`
    await database.db.insert(database.usersTable).values({
      id: userId,
      email: `${userId}@example.test`,
      passwordHash: await bcrypt.hash('offline-recovery-password', 4),
      updatedAt: new Date(),
    })

    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    if (realApiProcess) await stopProcess(realApiProcess)
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await database.pool.end()
  })

  it('requires a device session and authenticates the device session owner', async () => {
    const unauthenticated = await request('/api/mobile/dashboard')
    assert.equal(unauthenticated.status, 401)
    assert.equal((await json<{ error: { code: string } }>(unauthenticated)).error.code, 'authentication_required')

    const session = await login(
      `${userId}@example.test`,
      'offline-recovery-password',
      `ios-install-${randomUUID()}`,
      'Acceptance iPhone',
    )
    accessToken = session.accessToken

    const dashboard = await request('/api/mobile/dashboard')
    assert.equal(dashboard.status, 200)
    assert.equal((await json<{ syncCursor: string }>(dashboard)).syncCursor, '0')
  })

  it('shows the owner stock diagnostic and refreshes visible stock after reconciliation', async () => {
    const medicationId = `mobile-sync-medication-${randomUUID()}`
    const stockLevelId = `mobile-sync-stock-${randomUUID()}`
    const initialTransactionId = `mobile-stock-transaction-${randomUUID()}`
    const consumeTransactionId = `mobile-stock-transaction-${randomUUID()}`
    const suffix = randomUUID()
    const otherUserId = `mobile-offline-other-${suffix}`
    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isSchedule8", "isOtc", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Mobile stock acceptance medication', 'tablet', 'scheduled', false, true, true, NOW(), NOW())`,
      [medicationId, userId],
    )
    await database.pool.query(
      `INSERT INTO "StockLevel" ("id", "userId", "medicationId", "currentQuantity", "reorderThreshold", "updatedAt")
       VALUES ($1, $2, $3, 8, 5, NOW())`,
      [stockLevelId, userId, medicationId],
    )
    await database.pool.query(
      `INSERT INTO "StockTransaction" ("id", "userId", "medicationId", "date", "type", "quantityChange", "balanceAfter", "createdAt")
       VALUES ($1, $2, $3, '2026-09-08T00:00:00.000Z', 'stocktake', 10, 10, '2026-09-08T00:00:00.000Z'),
              ($4, $2, $3, '2026-09-08T00:00:01.000Z', 'consume', -1, 9, '2026-09-08T00:00:01.000Z')`,
      [initialTransactionId, userId, medicationId, consumeTransactionId],
    )
    await database.pool.query(
      `INSERT INTO "User" ("id", "email", "updatedAt") VALUES ($1, $2, NOW())`,
      [otherUserId, `${otherUserId}@example.test`],
    )

    try {
      const before = await request('/api/mobile/stock-levels')
      assert.equal(before.status, 200)
      const beforeLevels = await json<Array<{
        id: string;
        medicationId: string;
        currentQuantity: number;
        ledgerQuantity: number;
        hasMismatch: boolean;
      }>>(before)
      assert.deepEqual(beforeLevels, [{
        id: stockLevelId,
        medicationId,
        medicationLabel: 'Mobile stock acceptance medication',
        currentQuantity: 8,
        reorderThreshold: 5,
        monthlyLimit: null,
        ledgerQuantity: 9,
        lastLedgerBalance: 9,
        transactionCount: 2,
        mismatchQuantity: 1,
        hasMismatch: true,
      }])

      const reconciled = await request('/api/mobile/stock-levels', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reconcile',
          id: stockLevelId,
          expectedCurrentQuantity: 8,
          expectedLedgerQuantity: 9,
        }),
      })
      assert.equal(reconciled.status, 200)
      const result = await json<{
        kind: string;
        diagnostic: {
          currentQuantity: number;
          ledgerQuantity: number;
          mismatchQuantity: number;
          hasMismatch: boolean;
        };
        stock: { id: string; currentQuantity: number };
        transaction: { type: string; quantityChange: number; balanceAfter: number };
      }>(reconciled)
      assert.equal(result.kind, 'reconciled')
      assert.deepEqual(
        {
          currentQuantity: result.diagnostic.currentQuantity,
          ledgerQuantity: result.diagnostic.ledgerQuantity,
          mismatchQuantity: result.diagnostic.mismatchQuantity,
          hasMismatch: result.diagnostic.hasMismatch,
        },
        {
          currentQuantity: 9,
          ledgerQuantity: 9,
          mismatchQuantity: 0,
          hasMismatch: false,
        },
      )

      const settledResponse = await request('/api/mobile/stock-levels')
      const settledLevels = await json<Array<{
        currentQuantity: number;
        ledgerQuantity: number;
        mismatchQuantity: number;
        hasMismatch: boolean;
      }>>(settledResponse)
      assert.deepEqual(
        {
          currentQuantity: settledLevels[0]?.currentQuantity,
          ledgerQuantity: settledLevels[0]?.ledgerQuantity,
          mismatchQuantity: settledLevels[0]?.mismatchQuantity,
          hasMismatch: settledLevels[0]?.hasMismatch,
        },
        {
          currentQuantity: 9,
          ledgerQuantity: 9,
          mismatchQuantity: 0,
          hasMismatch: false,
        },
      )
      const staleReview = await request('/api/mobile/stock-levels', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reconcile',
          id: stockLevelId,
          expectedCurrentQuantity: 8,
          expectedLedgerQuantity: 9,
        }),
      })
      assert.equal(staleReview.status, 409)
      assert.equal((await json<{ error: { code: string } }>(staleReview)).error.code, 'stock_changed')

      const after = await request('/api/mobile/stock-levels')
      assert.equal(after.status, 200)
      const afterLevels = await json<Array<{ id: string; currentQuantity: number }>>(after)
      assert.equal(afterLevels.length, 1)
      assert.equal(afterLevels[0]?.id, stockLevelId)
      assert.equal(afterLevels[0]?.currentQuantity, 9)

      const forbidden = await database.pool.query(
        `SELECT COUNT(*)::int AS "count" FROM "StockTransaction" WHERE "userId" = $1`,
        [otherUserId],
      )
      assert.equal(forbidden.rows[0]?.count, 0)
    } finally {
      await database.pool.query(`DELETE FROM "StockTransaction" WHERE "medicationId" = $1`, [medicationId])
      await database.pool.query(`DELETE FROM "StockLevel" WHERE "id" = $1`, [stockLevelId])
      await database.pool.query(`DELETE FROM "Medication" WHERE "id" = $1`, [medicationId])
      await database.pool.query(`DELETE FROM "User" WHERE "id" = $1`, [otherUserId])
    }
  })

  it('keeps stock diagnostics and corrections private between authenticated owners', async () => {
    const suffix = randomUUID()
    const otherUserId = `mobile-offline-other-${suffix}`
    const otherEmail = `${otherUserId}@example.test`
    const otherPassword = 'other-stock-acceptance-password'
    const ownerMedicationId = `mobile-stock-owner-medication-${suffix}`
    const ownerStockLevelId = `mobile-stock-owner-level-${suffix}`
    const ownerTransactionId = `mobile-stock-owner-transaction-${suffix}`
    const otherMedicationId = `mobile-offline-other-medication-${suffix}`
    const otherStockLevelId = `mobile-stock-other-level-${suffix}`
    const otherTransactionId = `mobile-stock-other-transaction-${suffix}`

    await database.pool.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt") VALUES ($1, $2, $3, NOW())`,
      [otherUserId, otherEmail, await bcrypt.hash(otherPassword, 4)],
    )
    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isSchedule8", "isOtc", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Owner one private medication', 'tablet', 'scheduled', false, true, true, NOW(), NOW()),
              ($3, $4, 'Owner two private medication', 'capsule', 'scheduled', false, true, true, NOW(), NOW())`,
      [ownerMedicationId, userId, otherMedicationId, otherUserId],
    )
    await database.pool.query(
      `INSERT INTO "StockLevel" ("id", "userId", "medicationId", "currentQuantity", "reorderThreshold", "updatedAt")
       VALUES ($1, $2, $3, 8, 5, NOW()),
              ($4, $5, $6, 3, 2, NOW())`,
      [ownerStockLevelId, userId, ownerMedicationId, otherStockLevelId, otherUserId, otherMedicationId],
    )
    await database.pool.query(
      `INSERT INTO "StockTransaction" ("id", "userId", "medicationId", "date", "type", "quantityChange", "balanceAfter", "createdAt")
       VALUES ($1, $2, $3, '2026-09-08T00:00:00.000Z', 'stocktake', 9, 9, '2026-09-08T00:00:00.000Z'),
              ($4, $5, $6, '2026-09-08T00:00:01.000Z', 'stocktake', 4, 4, '2026-09-08T00:00:01.000Z')`,
      [ownerTransactionId, userId, ownerMedicationId, otherTransactionId, otherUserId, otherMedicationId],
    )

    try {
      const ownerSession = await login(
        `${userId}@example.test`,
        'offline-recovery-password',
        `ios-stock-owner-${suffix}`,
        'Stock owner one',
      )
      const otherSession = await login(
        otherEmail,
        otherPassword,
        `ios-stock-other-${suffix}`,
        'Stock owner two',
      )

      const ownerDiagnostic = await requestAs(ownerSession.accessToken, '/api/mobile/stock-levels')
      assert.equal(ownerDiagnostic.status, 200)
      assert.deepEqual(await json<Array<Record<string, unknown>>>(ownerDiagnostic), [{
        id: ownerStockLevelId,
        medicationId: ownerMedicationId,
        medicationLabel: 'Owner one private medication',
        currentQuantity: 8,
        reorderThreshold: 5,
        monthlyLimit: null,
        ledgerQuantity: 9,
        lastLedgerBalance: 9,
        transactionCount: 1,
        mismatchQuantity: 1,
        hasMismatch: true,
      }])

      const otherDiagnostic = await requestAs(otherSession.accessToken, '/api/mobile/stock-levels')
      assert.equal(otherDiagnostic.status, 200)
      assert.deepEqual(await json<Array<Record<string, unknown>>>(otherDiagnostic), [{
        id: otherStockLevelId,
        medicationId: otherMedicationId,
        medicationLabel: 'Owner two private medication',
        currentQuantity: 3,
        reorderThreshold: 2,
        monthlyLimit: null,
        ledgerQuantity: 4,
        lastLedgerBalance: 4,
        transactionCount: 1,
        mismatchQuantity: 1,
        hasMismatch: true,
      }])

      const otherCorrectsOwner = await requestAs(otherSession.accessToken, '/api/mobile/stock-levels', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reconcile',
          id: ownerStockLevelId,
          expectedCurrentQuantity: 8,
          expectedLedgerQuantity: 9,
        }),
      })
      assert.equal(otherCorrectsOwner.status, 404)
      assert.equal((await json<{ error: { code: string } }>(otherCorrectsOwner)).error.code, 'not_found')

      const ownerCorrectsOther = await requestAs(ownerSession.accessToken, '/api/mobile/stock-levels', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reconcile',
          id: otherStockLevelId,
          expectedCurrentQuantity: 3,
          expectedLedgerQuantity: 4,
        }),
      })
      assert.equal(ownerCorrectsOther.status, 404)
      assert.equal((await json<{ error: { code: string } }>(ownerCorrectsOther)).error.code, 'not_found')

      const [stockAfter, ledgerAfter] = await Promise.all([
        database.pool.query(
          `SELECT "userId", "id", "currentQuantity" FROM "StockLevel"
           WHERE "id" IN ($1, $2) ORDER BY "id"`,
          [ownerStockLevelId, otherStockLevelId],
        ),
        database.pool.query(
          `SELECT "userId", "medicationId", "quantityChange", "balanceAfter"
           FROM "StockTransaction" WHERE "id" IN ($1, $2) ORDER BY "id"`,
          [ownerTransactionId, otherTransactionId],
        ),
      ])
      assert.deepEqual(stockAfter.rows, [
        { userId: otherUserId, id: otherStockLevelId, currentQuantity: 3 },
        { userId: userId, id: ownerStockLevelId, currentQuantity: 8 },
      ])
      assert.deepEqual(ledgerAfter.rows, [
        { userId: otherUserId, medicationId: otherMedicationId, quantityChange: 4, balanceAfter: 4 },
        { userId, medicationId: ownerMedicationId, quantityChange: 9, balanceAfter: 9 },
      ])

      const ownerAfter = await requestAs(ownerSession.accessToken, '/api/mobile/stock-levels')
      const otherAfter = await requestAs(otherSession.accessToken, '/api/mobile/stock-levels')
      assert.equal(ownerAfter.status, 200)
      assert.equal(otherAfter.status, 200)
      assert.equal((await json<Array<{ id: string }>>(ownerAfter)).map((level) => level.id).join(','), ownerStockLevelId)
      assert.equal((await json<Array<{ id: string }>>(otherAfter)).map((level) => level.id).join(','), otherStockLevelId)
    } finally {
      await database.pool.query(`DELETE FROM "StockTransaction" WHERE "id" IN ($1, $2)`, [
        ownerTransactionId,
        otherTransactionId,
      ])
      await database.pool.query(`DELETE FROM "StockLevel" WHERE "id" IN ($1, $2)`, [
        ownerStockLevelId,
        otherStockLevelId,
      ])
      await database.pool.query(`DELETE FROM "Medication" WHERE "id" IN ($1, $2)`, [
        ownerMedicationId,
        otherMedicationId,
      ])
      await database.pool.query(`DELETE FROM "User" WHERE "id" = $1`, [otherUserId])
    }
  })

  it('rejects upload completion when the bytes do not match the initiated digest', async () => {
    const content = Buffer.from('offline attachment integrity fixture')
    const digest = createHash('sha256').update(content).digest('hex')
    const initiated = await request('/api/mobile/uploads', {
      method: 'POST',
      headers: { 'idempotency-key': `upload-init-${randomUUID()}` },
      body: JSON.stringify({
        fileName: 'offline.txt',
        contentType: 'text/plain',
        byteSize: content.length,
        sha256: digest,
      }),
    })
    assert.equal(initiated.status, 201)
    const upload = await json<{ id: string }>(initiated)

    const mismatch = await request(`/api/mobile/uploads/${upload.id}/complete`, {
      method: 'POST',
      headers: { 'idempotency-key': `upload-complete-${randomUUID()}` },
      body: JSON.stringify({ byteSize: content.length + 1, sha256: 'a'.repeat(64) }),
    })
    assert.equal(mismatch.status, 409)
    assert.equal((await json<{ error: { code: string } }>(mismatch)).error.code, 'upload_integrity_mismatch')

    const stored = await request(`/api/mobile/uploads/${upload.id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: content,
    })
    assert.equal(stored.status, 200)
    assert.equal((await json<{ status: string }>(stored)).status, 'completed')
  })

  it('materialises every mobile capture atomically and keeps retries safe', async () => {
    const suffix = randomUUID()
    const clientIds = {
      transaction: `mobile-capture-transaction-${suffix}`,
      task: `mobile-capture-task-${suffix}`,
      vital: `mobile-capture-vital-${suffix}`,
      medicationDose: `mobile-capture-dose-${suffix}`,
      event: `mobile-capture-event-${suffix}`,
      rejectedOwnership: `mobile-capture-ownership-${suffix}`,
      rejectedStock: `mobile-capture-stock-${suffix}`,
      unscheduledMedicationDose: `mobile-capture-prn-dose-${suffix}`,
      rejectedScheduledWithoutSchedule: `mobile-capture-scheduled-without-schedule-${suffix}`,
      rejectedUnownedUnscheduled: `mobile-capture-unowned-prn-${suffix}`,
    }
    const medicationId = `mobile-sync-medication-${randomUUID()}`
    const prnMedicationId = `mobile-sync-prn-medication-${randomUUID()}`
    const otherMedicationId = `mobile-offline-other-medication-${suffix}`
    const prescriptionId = `mobile-offline-prescription-${suffix}`
    const scheduleId = `mobile-sync-schedule-${randomUUID()}`
    const stockLevelId = `mobile-sync-stock-${randomUUID()}`
    const prnStockLevelId = `mobile-sync-prn-stock-${randomUUID()}`
    const otherUserId = `mobile-offline-other-${suffix}`
    const changedAt = '2026-09-08T03:00:00.000Z'
    const transactionPayload = {
      clientId: entityIds.transaction,
      amount: 18.75,
      currency: 'AUD',
      occurredAt: changedAt,
      merchant: `Offline sync merchant ${suffix}`,
      category: 'groceries',
      notes: 'Replayed after reconnect',
    }
    const taskPayload = {
      clientId: entityIds.task,
      title: `Offline sync task ${suffix}`,
      dueAt: changedAt,
      priority: 'high',
      notes: 'Replayed after reconnect',
    }
    const vitalPayload = {
      clientId: entityIds.vital,
      type: `offline_sync_heart_rate_${suffix}`,
      value: 68,
      unit: 'bpm',
      measuredAt: changedAt,
      notes: 'Replayed after reconnect',
    }
    const medicationPayload = {
      clientId: entityIds.medicationDose,
      medicationId,
      scheduleId,
      takenAt: changedAt,
      status: 'taken',
      dose: '1',
    }
    const eventPayload = {
      clientId: entityIds.event,
      title: `Offline sync event ${suffix}`,
      startsAt: changedAt,
      endsAt: '2026-09-08T04:00:00.000Z',
      allDay: false,
      notes: 'Replayed after reconnect',
    }
    const offlineEntityIds: string[] = []

    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Mobile acceptance medication', 'tablet', 'scheduled', true, NOW(), NOW())`,
      [medicationId, userId],
    )
    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Mobile PRN acceptance medication', 'tablet', 'prn', true, NOW(), NOW())`,
      [prnMedicationId, userId],
    )
    await database.pool.query(
      `INSERT INTO "Prescription" ("id", "userId", "medicationId", "datePrescribed", "quantity", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), 30, NOW(), NOW())`,
      [prescriptionId, userId, medicationId],
    )
    await database.pool.query(
      `INSERT INTO "DosageSchedule" ("id", "userId", "prescriptionId", "frequency", "times", "doseAmount", "startDate", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'daily', ARRAY['08:00'], '1', NOW(), true, NOW(), NOW())`,
      [scheduleId, userId, prescriptionId],
    )
    await database.pool.query(
      `INSERT INTO "StockLevel" ("id", "userId", "medicationId", "currentQuantity", "updatedAt")
       VALUES ($1, $2, $3, 1, NOW()), ($4, $2, $5, 2, NOW())`,
      [stockLevelId, userId, medicationId, prnStockLevelId, prnMedicationId],
    )
    await database.pool.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt")
       VALUES ($1, $2, $3, NOW())`,
      [otherUserId, `${otherUserId}@example.test`, await bcrypt.hash('other-user-password', 4)],
    )
    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Other owner medication', 'tablet', 'scheduled', true, NOW(), NOW())`,
      [otherMedicationId, otherUserId],
    )

    const createdCanonicalIds: string[] = []
    try {
      const capture = async <T extends { id: string }>(
        path: string,
        idempotencyKey: string,
        payload: unknown,
      ): Promise<T> => {
        const response = await request(path, {
          method: 'POST',
          headers: { 'idempotency-key': idempotencyKey },
          body: JSON.stringify(payload),
        })
        assert.equal(response.status, 201)
        const result = await json<T>(response)
        createdCanonicalIds.push(result.id)
        return result
      }

      const transaction = await capture('/api/mobile/capture/transactions', `capture-transaction-${suffix}`, transactionPayload)
      const task = await capture('/api/mobile/capture/tasks', `capture-task-${suffix}`, taskPayload)
      const vital = await capture('/api/mobile/capture/vitals', `capture-vital-${suffix}`, vitalPayload)
      const medicationDose = await capture('/api/mobile/medication-doses', `capture-dose-${suffix}`, medicationPayload)
      const event = await capture('/api/mobile/events', `capture-event-${suffix}`, eventPayload)

      const unscheduledEntityId = randomUUID()
      const scheduledWithoutScheduleEntityId = randomUUID()
      const unownedUnscheduledEntityId = randomUUID()
      offlineEntityIds.push(unscheduledEntityId, scheduledWithoutScheduleEntityId, unownedUnscheduledEntityId)
      const offlinePrn = await push(`capture-prn-sync-${suffix}`, [
        {
          changeId: clientIds.unscheduledMedicationDose,
          entityType: 'medicationDose',
          entityId: unscheduledEntityId,
          operation: 'upsert',
          baseVersion: 0,
          changedAt,
          payload: {
            clientId: clientIds.unscheduledMedicationDose,
            medicationId: prnMedicationId,
            takenAt: changedAt,
            status: 'taken',
            dose: '1',
          },
        },
        {
          changeId: clientIds.rejectedScheduledWithoutSchedule,
          entityType: 'medicationDose',
          entityId: scheduledWithoutScheduleEntityId,
          operation: 'upsert',
          baseVersion: 0,
          changedAt,
          payload: {
            clientId: clientIds.rejectedScheduledWithoutSchedule,
            medicationId,
            takenAt: changedAt,
            status: 'taken',
            dose: '1',
          },
        },
        {
          changeId: clientIds.rejectedUnownedUnscheduled,
          entityType: 'medicationDose',
          entityId: unownedUnscheduledEntityId,
          operation: 'upsert',
          baseVersion: 0,
          changedAt,
          payload: {
            clientId: clientIds.rejectedUnownedUnscheduled,
            medicationId: otherMedicationId,
            takenAt: changedAt,
            status: 'taken',
            dose: '1',
          },
        },
      ])
      assert.equal(offlinePrn.status, 200)
      assert.deepEqual(
        (await json<{ results: Array<{ changeId: string; status: string }> }>(offlinePrn)).results.map((result) => ({
          changeId: result.changeId,
          status: result.status,
        })),
        [
          { changeId: clientIds.unscheduledMedicationDose, status: 'applied' },
          { changeId: clientIds.rejectedScheduledWithoutSchedule, status: 'rejected' },
          { changeId: clientIds.rejectedUnownedUnscheduled, status: 'rejected' },
        ],
      )

      const canonical = await database.pool.query(
        `SELECT "id", "userId", "merchant" AS "businessValue" FROM "Transaction" WHERE "id" = $1
         UNION ALL
         SELECT "id", "userId", "title" FROM "Task" WHERE "id" = $2
         UNION ALL
         SELECT "id", "userId", "notes" FROM "VitalLog" WHERE "id" = $3
         UNION ALL
         SELECT "id", "userId", "medicationId" FROM "MedicationLog" WHERE "id" = $4
         UNION ALL
         SELECT "id", "userId", "title" FROM "Event" WHERE "id" = $5
         ORDER BY "id"`,
        [
          entityIds.transaction,
          entityIds.task,
          entityIds.vital,
          entityIds.medicationDose,
          entityIds.event,
        ],
      )
      assert.equal(canonical.rows.length, 5)
      assert.deepEqual(
        canonical.rows.map((row) => row.userId),
        Array(5).fill(userId),
      )
      assert.deepEqual(
        new Set(canonical.rows.map((row) => row.id)),
        new Set(Object.values(entityIds).slice(0, 5)),
      )
      assert.deepEqual(
        canonical.rows
          .map((row) => ({ id: row.id, businessValue: row.businessValue }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        [
          { id: entityIds.event, businessValue: eventPayload.title },
          { id: entityIds.medicationDose, businessValue: medicationId },
          { id: entityIds.task, businessValue: taskPayload.title },
          { id: entityIds.transaction, businessValue: transactionPayload.merchant },
          { id: entityIds.vital, businessValue: vitalPayload.notes },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      )

      const staging = await database.pool.query(
        `SELECT "id", "clientId", "entityType", "version"
         FROM "MobileRecord"
         WHERE "userId" = $1 AND "id" = ANY($2::text[])
         ORDER BY "id"`,
        [userId, Object.values(entityIds).slice(0, 5)],
      )
      assert.deepEqual(
        staging.rows.map((row) => ({ id: row.id, clientId: row.clientId, entityType: row.entityType, version: row.version })),
        Object.entries(entityIds).slice(0, 5).map(([entityType, id]) => ({
          id,
          clientId: id,
          entityType,
          version: 1,
        })).sort((left, right) => left.id.localeCompare(right.id)),
      )

      const syncChanges = await database.pool.query(
        `SELECT "entityId", "entityType", "operation", "version"
         FROM "MobileSyncChange"
         WHERE "userId" = $1 AND "entityId" = ANY($2::text[])
         ORDER BY "entityId"`,
        [userId, Object.values(entityIds).slice(0, 5)],
      )
      assert.deepEqual(
        syncChanges.rows.map((row) => ({ entityId: row.entityId, entityType: row.entityType, operation: row.operation, version: row.version })),
        [
          { entityId: event.id, entityType: 'event', operation: 'upsert', version: 1 },
          { entityId: medicationDose.id, entityType: 'medicationDose', operation: 'upsert', version: 1 },
          { entityId: task.id, entityType: 'task', operation: 'upsert', version: 1 },
          { entityId: transaction.id, entityType: 'transaction', operation: 'upsert', version: 1 },
          { entityId: vital.id, entityType: 'vital', operation: 'upsert', version: 1 },
        ],
      )

      const retriedDose = await request('/api/mobile/medication-doses', {
        method: 'POST',
        headers: { 'idempotency-key': `capture-dose-${suffix}` },
        body: JSON.stringify(medicationPayload),
      })
      assert.equal(retriedDose.status, 201)
      assert.deepEqual(await json(retriedDose), medicationDose)

      const duplicateClientId = await request('/api/mobile/capture/tasks', {
        method: 'POST',
        headers: { 'idempotency-key': `capture-task-duplicate-${suffix}` },
        body: JSON.stringify({ ...taskPayload, title: 'A duplicate client ID' }),
      })
      assert.equal(duplicateClientId.status, 409)
      assert.equal((await json<{ error: { code: string } }>(duplicateClientId)).error.code, 'version_mismatch')

      const medicationCounts = await database.pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM "MedicationLog" WHERE "userId" = $1 AND "scheduleId" = $2) AS "logs",
           (SELECT COUNT(*)::int FROM "MedicationLog" WHERE "userId" = $1 AND "medicationId" = $4 AND "scheduleId" IS NULL) AS "prnLogs",
           (SELECT COUNT(*)::int FROM "StockTransaction" WHERE "medicationId" = $3 AND "type" = 'consume') AS "consumes",
           (SELECT "currentQuantity" FROM "StockLevel" WHERE "id" = $5) AS "stock",
           (SELECT "currentQuantity" FROM "StockLevel" WHERE "id" = $6) AS "prnStock"`,
        [userId, scheduleId, medicationId, prnMedicationId, stockLevelId, prnStockLevelId],
      )
      assert.deepEqual(medicationCounts.rows[0], { logs: 1, prnLogs: 1, consumes: 1, stock: 0, prnStock: 1 })

      const ownershipFailure = await request('/api/mobile/medication-doses', {
        method: 'POST',
        headers: { 'idempotency-key': `capture-ownership-${suffix}` },
        body: JSON.stringify({
          clientId: clientIds.rejectedOwnership,
          medicationId: otherMedicationId,
          takenAt: changedAt,
          status: 'taken',
          dose: '1',
        }),
      })
      assert.equal(ownershipFailure.status, 404)
      assert.equal((await json<{ error: { code: string } }>(ownershipFailure)).error.code, 'not_found')

      const stockFailure = await request('/api/mobile/medication-doses', {
        method: 'POST',
        headers: { 'idempotency-key': `capture-stock-${suffix}` },
        body: JSON.stringify({
          clientId: clientIds.rejectedStock,
          medicationId,
          scheduleId,
          takenAt: '2026-09-08T02:00:00.000Z',
          status: 'taken',
          dose: '1',
        }),
      })
      assert.equal(stockFailure.status, 409)
      assert.equal((await json<{ error: { code: string } }>(stockFailure)).error.code, 'insufficient_stock')

      const rejectedRows = await database.pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM "MedicationLog" WHERE "id" = ANY($2::text[])) AS "logs",
           (SELECT COUNT(*)::int FROM "MobileRecord" WHERE "id" = ANY($2::text[])) AS "records",
           (SELECT COUNT(*)::int FROM "MobileSyncChange" WHERE "entityId" = ANY($2::text[])) AS "changes",
           (SELECT COUNT(*)::int FROM "StockTransaction" WHERE "userId" = $1 AND "medicationId" = $3 AND "type" = 'consume') AS "consumes",
           (SELECT "currentQuantity" FROM "StockLevel" WHERE "id" = $4) AS "stock"`,
        [userId, [entityIds.rejectedOwnership, entityIds.rejectedStock], medicationId, stockLevelId],
      )
      assert.deepEqual(rejectedRows.rows[0], { logs: 0, records: 0, changes: 0, consumes: 1, stock: 0 })
    } finally {
      await database.pool.query(`DELETE FROM "MobileSyncChange" WHERE "userId" = $1 AND "entityId" = ANY($2::text[])`, [userId, [...createdCanonicalIds, ...offlineEntityIds]])
      await database.pool.query(`DELETE FROM "MobileRecord" WHERE "userId" = $1 AND "clientId" = ANY($2::text[])`, [userId, Object.values(clientIds)])
      await database.pool.query(
        `DELETE FROM "TransactionAuditRecord"
         WHERE "transactionId" IN (
           SELECT "id" FROM "Transaction" WHERE "userId" = $1 AND "merchant" = $2
         )`,
        [userId, transactionPayload.merchant],
      )
      await database.pool.query(`DELETE FROM "VitalLog" WHERE "userId" = $1 AND "notes" = $2`, [userId, vitalPayload.notes])
      await database.pool.query(`DELETE FROM "MedicationLog" WHERE "userId" = $1 AND "scheduleId" = $2`, [userId, scheduleId])
      await database.pool.query(`DELETE FROM "MedicationLog" WHERE "userId" = $1 AND "medicationId" = $2 AND "scheduleId" IS NULL`, [userId, prnMedicationId])
      await database.pool.query(`DELETE FROM "Event" WHERE "userId" = $1 AND "title" = $2`, [userId, eventPayload.title])
      await database.pool.query(`DELETE FROM "Task" WHERE "userId" = $1 AND "title" = $2`, [userId, taskPayload.title])
      await database.pool.query(`DELETE FROM "Transaction" WHERE "userId" = $1 AND "merchant" = $2`, [userId, transactionPayload.merchant])
      await database.pool.query(`DELETE FROM "VitalType" WHERE "userId" = $1 AND "name" = $2`, [userId, vitalPayload.type])
      await database.pool.query(`DELETE FROM "StockTransaction" WHERE "userId" = $1 AND "medicationId" = $2`, [userId, medicationId])
      await database.pool.query(`DELETE FROM "StockTransaction" WHERE "userId" = $1 AND "medicationId" = $2`, [userId, prnMedicationId])
      await database.pool.query(`DELETE FROM "StockLevel" WHERE "id" = $1`, [stockLevelId])
      await database.pool.query(`DELETE FROM "StockLevel" WHERE "id" = $1`, [prnStockLevelId])
      await database.pool.query(`DELETE FROM "DosageSchedule" WHERE "id" = $1`, [scheduleId])
      await database.pool.query(`DELETE FROM "Prescription" WHERE "id" = $1`, [prescriptionId])
      await database.pool.query(`DELETE FROM "Medication" WHERE "id" = $1`, [medicationId])
      await database.pool.query(`DELETE FROM "Medication" WHERE "id" = $1`, [prnMedicationId])
      await database.pool.query(`DELETE FROM "User" WHERE "id" = $1`, [otherUserId])
    }
  })

  it('replays every offline capture type into canonical dashboard rows', async () => {
    const suffix = randomUUID()
    const changedAt = '2026-09-08T03:00:00.000Z'
    const entityIds = {
      transaction: randomUUID(),
      task: randomUUID(),
      vital: randomUUID(),
      medicationDose: randomUUID(),
      event: randomUUID(),
      rejectedOwnership: randomUUID(),
      rejectedStock: randomUUID(),
    }
    const medicationId = `mobile-sync-medication-${randomUUID()}`
    const prescriptionId = `mobile-offline-prescription-${suffix}`
    const scheduleId = `mobile-sync-schedule-${randomUUID()}`
    const stockLevelId = `mobile-sync-stock-${randomUUID()}`
    const otherUserId = `mobile-offline-other-${suffix}`
    const otherMedicationId = `mobile-offline-other-medication-${suffix}`
    const transactionPayload = {
      clientId: entityIds.transaction,
      amount: 18.75,
      currency: 'AUD',
      occurredAt: changedAt,
      merchant: `Offline sync merchant ${suffix}`,
      category: 'groceries',
      notes: 'Replayed after reconnect',
    }
    const taskPayload = {
      clientId: entityIds.task,
      title: `Offline sync task ${suffix}`,
      dueAt: changedAt,
      priority: 'high',
      notes: 'Replayed after reconnect',
    }
    const vitalPayload = {
      clientId: entityIds.vital,
      type: `offline_sync_heart_rate_${suffix}`,
      value: 68,
      unit: 'bpm',
      measuredAt: changedAt,
      notes: 'Replayed after reconnect',
    }
    const medicationPayload = {
      clientId: entityIds.medicationDose,
      medicationId,
      scheduleId,
      takenAt: changedAt,
      status: 'taken',
      dose: '1',
    }
    const eventPayload = {
      clientId: entityIds.event,
      title: `Offline sync event ${suffix}`,
      startsAt: changedAt,
      endsAt: '2026-09-08T04:00:00.000Z',
      allDay: false,
      notes: 'Replayed after reconnect',
    }
    const validChanges = [
      {
        changeId: `offline-transaction-${suffix}`,
        entityType: 'transaction',
        entityId: entityIds.transaction,
        operation: 'upsert',
        baseVersion: 0,
        payload: transactionPayload,
        changedAt,
      },
      {
        changeId: `offline-task-${suffix}`,
        entityType: 'task',
        entityId: entityIds.task,
        operation: 'upsert',
        baseVersion: 0,
        payload: taskPayload,
        changedAt,
      },
      {
        changeId: `offline-vital-${suffix}`,
        entityType: 'vital',
        entityId: entityIds.vital,
        operation: 'upsert',
        baseVersion: 0,
        payload: vitalPayload,
        changedAt,
      },
      {
        changeId: `offline-dose-${suffix}`,
        entityType: 'medicationDose',
        entityId: entityIds.medicationDose,
        operation: 'upsert',
        baseVersion: 0,
        payload: medicationPayload,
        changedAt,
      },
      {
        changeId: `offline-event-${suffix}`,
        entityType: 'event',
        entityId: entityIds.event,
        operation: 'upsert',
        baseVersion: 0,
        payload: eventPayload,
        changedAt,
      },
    ]

    await database.pool.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt")
       VALUES ($1, $2, $3, NOW())`,
      [otherUserId, `${otherUserId}@example.test`, await bcrypt.hash('other-user-password', 4)],
    )
    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Offline sync medication', 'tablet', 'scheduled', true, NOW(), NOW()),
              ($3, $4, 'Offline sync other medication', 'tablet', 'scheduled', true, NOW(), NOW())`,
      [medicationId, userId, otherMedicationId, otherUserId],
    )
    await database.pool.query(
      `INSERT INTO "Prescription" ("id", "userId", "medicationId", "datePrescribed", "quantity", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), 30, NOW(), NOW())`,
      [prescriptionId, userId, medicationId],
    )
    await database.pool.query(
      `INSERT INTO "DosageSchedule" ("id", "userId", "prescriptionId", "frequency", "times", "doseAmount", "startDate", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'daily', ARRAY['08:00'], '1', NOW(), true, NOW(), NOW())`,
      [scheduleId, userId, prescriptionId],
    )
    await database.pool.query(
      `INSERT INTO "StockLevel" ("id", "userId", "medicationId", "currentQuantity", "updatedAt")
       VALUES ($1, $2, $3, 1, NOW())`,
      [stockLevelId, userId, medicationId],
    )

    try {
      const replay = await push(`offline-replay-${suffix}`, validChanges)
      assert.equal(replay.status, 200)
      assert.deepEqual(
        (await json<{ results: Array<{ changeId: string; status: string; version: number }> }>(replay)).results.map((result) => ({
          changeId: result.changeId,
          status: result.status,
          version: result.version,
        })),
        validChanges.map((change) => ({ changeId: change.changeId, status: 'applied', version: 1 })),
      )

      const canonical = await database.pool.query(
        `SELECT "id", "userId", "merchant" AS "businessValue" FROM "Transaction" WHERE "id" = $1
         UNION ALL
         SELECT "id", "userId", "title" FROM "Task" WHERE "id" = $2
         UNION ALL
         SELECT "id", "userId", "notes" FROM "VitalLog" WHERE "id" = $3
         UNION ALL
         SELECT "id", "userId", "medicationId" FROM "MedicationLog" WHERE "id" = $4
         UNION ALL
         SELECT "id", "userId", "title" FROM "Event" WHERE "id" = $5
         ORDER BY "id"`,
        [
          entityIds.transaction,
          entityIds.task,
          entityIds.vital,
          entityIds.medicationDose,
          entityIds.event,
        ],
      )
      assert.equal(canonical.rows.length, 5)
      assert.deepEqual(
        canonical.rows.map((row) => row.userId),
        Array(5).fill(userId),
      )
      assert.deepEqual(
        new Set(canonical.rows.map((row) => row.id)),
        new Set(Object.values(entityIds).slice(0, 5)),
      )
      assert.deepEqual(
        canonical.rows
          .map((row) => ({ id: row.id, businessValue: row.businessValue }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        [
          { id: entityIds.event, businessValue: eventPayload.title },
          { id: entityIds.medicationDose, businessValue: medicationId },
          { id: entityIds.task, businessValue: taskPayload.title },
          { id: entityIds.transaction, businessValue: transactionPayload.merchant },
          { id: entityIds.vital, businessValue: vitalPayload.notes },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      )

      const staging = await database.pool.query(
        `SELECT "id", "clientId", "entityType", "version"
         FROM "MobileRecord"
         WHERE "userId" = $1 AND "id" = ANY($2::text[])
         ORDER BY "id"`,
        [userId, Object.values(entityIds).slice(0, 5)],
      )
      assert.deepEqual(
        staging.rows.map((row) => ({ id: row.id, clientId: row.clientId, entityType: row.entityType, version: row.version })),
        Object.entries(entityIds).slice(0, 5).map(([entityType, id]) => ({
          id,
          clientId: id,
          entityType,
          version: 1,
        })).sort((left, right) => left.id.localeCompare(right.id)),
      )

      const syncChanges = await database.pool.query(
        `SELECT "entityId", "entityType", "operation", "version"
         FROM "MobileSyncChange"
         WHERE "userId" = $1 AND "entityId" = ANY($2::text[])
         ORDER BY "entityId"`,
        [userId, Object.values(entityIds).slice(0, 5)],
      )
      assert.deepEqual(
        syncChanges.rows.map((row) => ({
          entityId: row.entityId,
          entityType: row.entityType,
          operation: row.operation,
          version: row.version,
        })),
        Object.entries(entityIds).slice(0, 5).map(([entityType, entityId]) => ({
          entityId,
          entityType,
          operation: 'upsert',
          version: 1,
        })).sort((left, right) => left.entityId.localeCompare(right.entityId)),
      )

      const retried = await push(`offline-retry-${suffix}`, [validChanges[3]])
      assert.equal(retried.status, 200)
      assert.deepEqual((await json<{ results: Array<{ status: string; version: number }> }>(retried)).results, [{
        changeId: validChanges[3].changeId,
        status: 'duplicate',
        version: 1,
      }])

      const invalidChanges = [
        {
          changeId: `offline-rejected-ownership-${suffix}`,
          entityType: 'medicationDose',
          entityId: entityIds.rejectedOwnership,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            clientId: entityIds.rejectedOwnership,
            medicationId: otherMedicationId,
            takenAt: changedAt,
            status: 'taken',
            dose: '1',
          },
          changedAt,
        },
        {
          changeId: `offline-rejected-stock-${suffix}`,
          entityType: 'medicationDose',
          entityId: entityIds.rejectedStock,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            clientId: entityIds.rejectedStock,
            medicationId,
            scheduleId,
            takenAt: '2026-09-08T05:00:00.000Z',
            status: 'taken',
            dose: '1',
          },
          changedAt,
        },
      ]
      const rejected = await push(`offline-rejected-${suffix}`, invalidChanges)
      assert.equal(rejected.status, 200)
      assert.deepEqual(
        (await json<{ results: Array<{ changeId: string; status: string; error?: { error: { code: string; message: string } } }> }>(rejected)).results
          .map((result) => ({
            changeId: result.changeId,
            status: result.status,
            errorCode: result.error?.error.code,
            errorMessage: result.error?.error.message,
          })),
        [
          {
            changeId: invalidChanges[0].changeId,
            status: 'rejected',
            errorCode: 'medication_not_available',
            errorMessage: 'This medication is not available for this account. Review the saved capture before retrying.',
          },
          {
            changeId: invalidChanges[1].changeId,
            status: 'rejected',
            errorCode: 'insufficient_stock',
            errorMessage: 'There is not enough stock to log this dose. Update the dose or stock, then retry.',
          },
        ],
      )

      const rejectedRows = await database.pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM "MedicationLog" WHERE "id" = ANY($2::text[])) AS "logs",
           (SELECT COUNT(*)::int FROM "MobileRecord" WHERE "id" = ANY($2::text[])) AS "records",
           (SELECT COUNT(*)::int FROM "MobileSyncChange" WHERE "entityId" = ANY($2::text[])) AS "changes",
           (SELECT COUNT(*)::int FROM "StockTransaction" WHERE "userId" = $1 AND "medicationId" = $3 AND "type" = 'consume') AS "consumes",
           (SELECT "currentQuantity" FROM "StockLevel" WHERE "id" = $4) AS "stock"`,
        [userId, [entityIds.rejectedOwnership, entityIds.rejectedStock], medicationId, stockLevelId],
      )
      assert.deepEqual(rejectedRows.rows[0], { logs: 0, records: 0, changes: 0, consumes: 1, stock: 0 })
    } finally {
      await database.pool.query(`DELETE FROM "MobileSyncChange" WHERE "userId" = $1 AND "entityId" = ANY($2::text[])`, [userId, Object.values(entityIds)])
      await database.pool.query(`DELETE FROM "MobileRecord" WHERE "userId" = $1 AND "id" = ANY($2::text[])`, [userId, Object.values(entityIds)])
      await database.pool.query(`DELETE FROM "TransactionAuditRecord" WHERE "transactionId" = $1`, [entityIds.transaction])
      await database.pool.query(`DELETE FROM "VitalLog" WHERE "id" = $1`, [entityIds.vital])
      await database.pool.query(`DELETE FROM "VitalType" WHERE "userId" = $1 AND "name" = $2`, [userId, vitalPayload.type])
      await database.pool.query(`DELETE FROM "MedicationLog" WHERE "id" = $1`, [entityIds.medicationDose])
      await database.pool.query(`DELETE FROM "Event" WHERE "id" = $1`, [entityIds.event])
      await database.pool.query(`DELETE FROM "Task" WHERE "id" = $1`, [entityIds.task])
      await database.pool.query(`DELETE FROM "Transaction" WHERE "id" = $1`, [entityIds.transaction])
      await database.pool.query(`DELETE FROM "StockTransaction" WHERE "userId" = $1 AND "medicationId" = $2`, [userId, medicationId])
      await database.pool.query(`DELETE FROM "StockLevel" WHERE "id" = $1`, [stockLevelId])
      await database.pool.query(`DELETE FROM "DosageSchedule" WHERE "id" = $1`, [scheduleId])
      await database.pool.query(`DELETE FROM "Prescription" WHERE "id" = $1`, [prescriptionId])
      await database.pool.query(`DELETE FROM "Medication" WHERE "id" IN ($1, $2)`, [medicationId, otherMedicationId])
      await database.pool.query(`DELETE FROM "User" WHERE "id" = $1`, [otherUserId])
    }
  })

  it('reconciles cursors, duplicate change IDs, and version conflicts for offline changes', async () => {
    const entityId = randomUUID()
    const firstChange = {
      changeId: `canonical-create-${randomUUID()}`,
      entityType: 'task',
      entityId,
      operation: 'upsert',
      baseVersion: 0,
      payload: { clientId: entityId, title: 'Canonical first title', priority: 'medium' },
      changedAt: '2026-09-08T01:00:00.000Z',
    }
    const first = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-first-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: null,
        anchor: 'anchor-1',
        samples: [sample],
        deletions: [],
      }),
    })
    assert.equal(first.status, 202)
    const firstBody = await json<{ accepted: number; duplicates: number; deletions: number; anchor: string }>(first)
    assert.equal(firstBody.results[0]?.status, 'applied')
    assert.equal(firstBody.results[0]?.version, 1)
    assert.notEqual(firstBody.cursor, '0')
    const duplicate = await push(`canonical-retry-${randomUUID()}`, [deletedChange])
    assert.equal(duplicate.status, 200)
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(duplicate)).results[0]?.status, 'duplicate')

    const pull = await request('/api/mobile/sync/pull?cursor=0&limit=10')
    assert.equal(pull.status, 200)
    const pulled = await json<{ cursor: string; hasMore: boolean; changes: Array<{ changeId: string; entityId: string; baseVersion: number }> }>(pull)
    assert.equal(pulled.changes.length, 1)
    assert.equal(pulled.changes[0]?.changeId, firstChange.changeId)
    assert.equal(pulled.changes[0]?.entityId, entityId)
    assert.equal(pulled.changes[0]?.baseVersion, 0)
    assert.equal(pulled.hasMore, false)

    const emptyPull = await request(`/api/mobile/sync/pull?cursor=${pulled.cursor}`)
    assert.deepEqual((await json<{ changes: unknown[]; cursor: string }>(emptyPull)).changes, [])
    assert.equal((await json<{ changes: unknown[]; cursor: string }>(await request(`/api/mobile/sync/pull?cursor=${pulled.cursor}`))).cursor, pulled.cursor)

    const staleChange = {
      ...firstChange,
      changeId: `stale-${randomUUID()}`,
      baseVersion: 0,
      payload: { clientId: entityId, title: 'Stale offline title' },
    }
    const conflict = await push(`sync-conflict-${randomUUID()}`, [staleChange])
    assert.equal(conflict.status, 200)
    const conflictBody = await json<{ results: Array<{ status: string; version: number; conflict?: { conflict?: { kind: string; serverVersion: number } } }> }>(conflict)
    assert.equal(conflictBody.results[0]?.status, 'conflict')
    assert.equal(conflictBody.results[0]?.conflict?.conflict?.kind, 'version_mismatch')
    assert.equal(conflictBody.results[0]?.conflict?.conflict?.serverVersion, 1)

    const recovered = await push(`sync-recovery-${randomUUID()}`, [{
      ...staleChange,
      changeId: `recovery-${randomUUID()}`,
      baseVersion: 1,
      payload: { clientId: entityId, title: 'Recovered offline title' },
    }])
    const recoveredBody = await json<{ cursor: string; results: Array<{ status: string; version: number }> }>(recovered)
    assert.equal(recoveredBody.results[0]?.status, 'applied')
    assert.equal(recoveredBody.results[0]?.version, 2)

      const deletedChange = {
        ...initial,
        changeId: `dose-delete-${randomUUID()}`,
        operation: 'delete',
        baseVersion: 2,
        payload: {},
        changedAt: '2026-09-08T01:02:00.000Z',
      }
    const deleted = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-delete-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: 'anchor-1',
        anchor: 'anchor-2',
        samples: [sample],
        deletions: [{ healthKitUuid: sample.healthKitUuid, sampleType: 'activity', deletedAt: '2026-09-08T00:00:00.000Z' }],
      }),
    })
    assert.equal(deleted.status, 200)
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(deleted)).results[0]?.status, 'applied')
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(deleted)).results[0]?.version, 3)
    assert.equal((await json<{ tasksDue: number }>(await request('/api/mobile/dashboard'))).tasksDue, 0)

    const tombstonePull = await request(`/api/mobile/sync/pull?cursor=${recoveredBody.cursor}`)
    const tombstoneChange = await json<{ changes: Array<{ operation: string; entityId: string }> }>(tombstonePull)
    assert.deepEqual(tombstoneChange.changes.map(({ operation, entityId: pulledEntityId }) => ({ operation, entityId: pulledEntityId })), [
      { operation: 'delete', entityId },
    ])
    const historyResponse = await request('/api/mobile/sync/history')
    assert.equal(historyResponse.status, 200)
    const history = await json<{ entries: Array<{ changeId: string; entityType: string; entityId: string; status: string; payload?: unknown }> }>(historyResponse)
    assert.ok(history.entries.some((entry) => entry.changeId === firstChange.changeId && entry.status === 'applied'))
    const deletedHistory = history.entries.find((entry) => entry.changeId === deletedChange.changeId)
    assert.equal(deletedHistory?.entityType, 'task')
    assert.equal(deletedHistory?.entityId, entityId)
    assert.equal(deletedHistory?.status, 'deleted')
    assert.equal('payload' in (deletedHistory ?? {}), false)
    await database.pool.query(`DELETE FROM "MobileSyncChange" WHERE "entityId" = $1`, [entityId])
    await database.pool.query(`DELETE FROM "MobileRecord" WHERE "id" = $1`, [entityId])
  })

  it('keeps deleted payloads private and restores them only after version review', async () => {
    const entityId = randomUUID()
    const firstChange = {
      changeId: `canonical-create-${randomUUID()}`,
      entityType: 'task',
      entityId,
      operation: 'upsert',
      baseVersion: 0,
      payload: { clientId: entityId, title: 'Canonical first title', priority: 'medium' },
      changedAt: '2026-09-08T01:00:00.000Z',
    }
    const first = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-first-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: null,
        anchor: 'anchor-1',
        samples: [sample],
        deletions: [],
      }),
    })
    assert.equal(first.status, 200)
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(first)).results[0]?.status, 'applied')
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(first)).results[0]?.version, 1)

    const updated = await push(`canonical-update-${randomUUID()}`, [{
      ...firstChange,
      changeId: `canonical-update-${randomUUID()}`,
      baseVersion: 1,
      payload: { clientId: entityId, title: 'Canonical updated title', priority: 'high' },
      changedAt: '2026-09-08T01:01:00.000Z',
    }])

    const updatedBody = await json<{ cursor: string; results: Array<{ status: string; version: number }> }>(updated)
    const canonicalTask = await database.pool.query(
      `SELECT "title", "priority" FROM "Task" WHERE "id" = $1 AND "userId" = $2`,
      [entityId, userId],
    )
    assert.deepEqual(canonicalTask.rows[0], { title: 'Canonical updated title', priority: 'high' })

      const deletedChange = {
        ...initial,
        changeId: `dose-delete-${randomUUID()}`,
        operation: 'delete',
        baseVersion: 2,
        payload: {},
        changedAt: '2026-09-08T01:02:00.000Z',
      }
    const deleted = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-delete-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: 'anchor-1',
        anchor: 'anchor-2',
        samples: [sample],
        deletions: [{ healthKitUuid: sample.healthKitUuid, sampleType: 'activity', deletedAt: '2026-09-08T00:00:00.000Z' }],
      }),
    })
    assert.equal(deleted.status, 200)
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(deleted)).results[0]?.status, 'applied')
    assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(deleted)).results[0]?.version, 3)
    const [remainingTask, tombstone] = await Promise.all([
      database.pool.query(`SELECT COUNT(*)::int AS "count" FROM "Task" WHERE "id" = $1 AND "userId" = $2`, [entityId, userId]),
      database.pool.query(
        `SELECT "payload", "deletedAt" FROM "MobileRecord" WHERE "id" = $1 AND "userId" = $2`,
        [entityId, userId],
      ),
    ])
    assert.equal(remainingTask.rows[0]?.count, 0)
    assert.deepEqual(tombstone.rows[0]?.payload, {
      clientId: entityId,
      title: 'Canonical updated title',
      priority: 'high',
    })
    assert.ok(tombstone.rows[0]?.deletedAt)

    const hiddenPull = await request(`/api/mobile/sync/pull?cursor=${updatedBody.cursor}`)
    const hiddenPullBody = await json<{ changes: Array<{ operation: string; payload?: unknown }> }>(hiddenPull)
    assert.deepEqual(hiddenPullBody.changes, [{
      operation: 'delete',
      payload: {},
    }])
    const duplicate = await push(`canonical-retry-${randomUUID()}`, [deletedChange])
    assert.equal(duplicate.status, 200)
    assert.equal((await json<{ results: Array<{ status: string }> }>(duplicate)).results[0]?.status, 'duplicate')
    await database.pool.query(`DELETE FROM "MobileSyncChange" WHERE "entityId" = $1`, [entityId])
    await database.pool.query(`DELETE FROM "MobileRecord" WHERE "id" = $1`, [entityId])
  })

  it('reverses and reapplies medication stock exactly once across edits and deletes', async () => {
    const medicationId = `mobile-sync-medication-${randomUUID()}`
    const scheduleId = `mobile-sync-schedule-${randomUUID()}`
    const stockLevelId = `mobile-sync-stock-${randomUUID()}`
    const entityId = randomUUID()
    await database.pool.query(
      `INSERT INTO "Medication" ("id", "userId", "name", "form", "medType", "isSchedule8", "isOtc", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Offline sync medication', 'tablet', 'scheduled', false, true, true, NOW(), NOW())`,
      [medicationId, userId],
    )
    await database.pool.query(
      `INSERT INTO "DosageSchedule" ("id", "userId", "medicationId", "frequency", "times", "doseAmount", "startDate", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'daily', ARRAY['08:00'], '1', '2026-09-01T00:00:00.000Z', true, NOW(), NOW())`,
      [scheduleId, userId, medicationId],
    )
    await database.pool.query(
      `INSERT INTO "StockLevel" ("id", "userId", "medicationId", "currentQuantity", "reorderThreshold", "updatedAt")
       VALUES ($1, $2, $3, 5, 1, NOW())`,
      [stockLevelId, userId, medicationId],
    )
    try {
      const initial = {
        changeId: `dose-create-${randomUUID()}`,
        entityType: 'medicationDose',
        entityId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          clientId: entityId,
          medicationId,
          scheduleId,
          takenAt: '2026-09-08T01:00:00.000Z',
          status: 'taken',
          dose: '1',
        },
        changedAt: '2026-09-08T01:00:00.000Z',
      }
      const created = await push(`dose-create-${randomUUID()}`, [initial])
      assert.equal(created.status, 200)
      assert.equal((await json<{ results: Array<{ version: number }> }>(created)).results[0]?.version, 1)

      const edited = await push(`dose-edit-${randomUUID()}`, [{
        ...initial,
        changeId: `dose-edit-${randomUUID()}`,
        baseVersion: 1,
        payload: { ...initial.payload, dose: '2', takenAt: '2026-09-08T01:01:00.000Z' },
        changedAt: '2026-09-08T01:01:00.000Z',
      }])
      assert.equal(edited.status, 200)
      assert.equal((await json<{ results: Array<{ version: number }> }>(edited)).results[0]?.version, 2)

      const deletedChange = {
        ...initial,
        changeId: `dose-delete-${randomUUID()}`,
        operation: 'delete',
        baseVersion: 2,
        payload: {},
        changedAt: '2026-09-08T01:02:00.000Z',
      }
    const deleted = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-delete-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: 'anchor-1',
        anchor: 'anchor-2',
        samples: [sample],
        deletions: [{ healthKitUuid: sample.healthKitUuid, sampleType: 'activity', deletedAt: '2026-09-08T00:00:00.000Z' }],
      }),
    })
      assert.equal(deleted.status, 200)
      assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(deleted)).results[0]?.status, 'applied')
      assert.equal((await json<{ results: Array<{ status: string; version: number }> }>(deleted)).results[0]?.version, 3)
      const stock = await database.pool.query(
        `SELECT "currentQuantity" FROM "StockLevel" WHERE "id" = $1 AND "userId" = $2`,
        [stockLevelId, userId],
      )
      const ledger = await database.pool.query(
        `SELECT COUNT(*)::int AS "count", COALESCE(SUM("quantityChange"), 0)::float AS "quantity"
         FROM "StockTransaction" WHERE "medicationId" = $1 AND "userId" = $2`,
        [medicationId, userId],
      )
      assert.equal(Number(stock.rows[0]?.currentQuantity), 5)
      assert.equal(ledger.rows[0]?.count, 4)
      assert.equal(Number(ledger.rows[0]?.quantity), 0)
    } finally {
      await database.pool.query(`DELETE FROM "MedicationLog" WHERE "id" = $1`, [entityId])
      await database.pool.query(`DELETE FROM "MobileSyncChange" WHERE "entityId" = $1`, [entityId])
      await database.pool.query(`DELETE FROM "MobileRecord" WHERE "id" = $1`, [entityId])
      await database.pool.query(`DELETE FROM "StockTransaction" WHERE "medicationId" = $1`, [medicationId])
      await database.pool.query(`DELETE FROM "StockLevel" WHERE "id" = $1`, [stockLevelId])
      await database.pool.query(`DELETE FROM "DosageSchedule" WHERE "id" = $1`, [scheduleId])
      await database.pool.query(`DELETE FROM "Medication" WHERE "id" = $1`, [medicationId])
    }
  })

  it('imports anchored Apple Health changes, records deletions, and filters tombstoned copies', async () => {
    const enable = await request('/api/mobile/apple-health/controls', {
      method: 'PUT',
      body: JSON.stringify({ metrics: [{ sampleType: 'activity', enabled: true }] }),
    })
    assert.equal(enable.status, 200)

    const sample = {
      healthKitUuid: `health-${randomUUID()}`,
      sampleType: 'activity',
      value: 4200,
      unit: 'count',
      startAt: '2026-09-07T00:00:00.000Z',
      endAt: '2026-09-07T01:00:00.000Z',
      sourceBundleId: 'com.apple.Health',
      sourceRevision: 'acceptance',
      metadata: {},
    }
    const first = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-first-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: null,
        anchor: 'anchor-1',
        samples: [sample],
        deletions: [],
      }),
    })
    assert.equal(first.status, 202)
    const firstBody = await json<{ accepted: number; duplicates: number; deletions: number; anchor: string }>(first)
    assert.deepEqual(firstBody, { accepted: 1, duplicates: 0, deletions: 0, anchor: 'anchor-1' })

    const deleted = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-delete-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: 'anchor-1',
        anchor: 'anchor-2',
        samples: [sample],
        deletions: [{ healthKitUuid: sample.healthKitUuid, sampleType: 'activity', deletedAt: '2026-09-08T00:00:00.000Z' }],
      }),
    })
    assert.equal(deleted.status, 202)
    const deletedBody = await json<{ accepted: number; duplicates: number; deletions: number; anchor: string }>(deleted)
    assert.deepEqual(deletedBody, { accepted: 0, duplicates: 1, deletions: 1, anchor: 'anchor-2' })

    const replacement = await request('/api/mobile/apple-health/import-batches', {
      method: 'POST',
      headers: { 'idempotency-key': `health-replacement-${randomUUID()}` },
      body: JSON.stringify({
        sampleType: 'activity',
        previousAnchor: 'anchor-2',
        anchor: 'anchor-3',
        samples: [sample],
        deletions: [],
      }),
    })
    assert.equal(replacement.status, 202)
    assert.equal((await json<{ accepted: number; duplicates: number }>(replacement)).accepted, 0)

    const anchor = await request('/api/mobile/apple-health/anchors/activity')
    assert.equal(anchor.status, 200)
    assert.equal((await json<{ anchor: string; sampleType: string }>(anchor)).anchor, 'anchor-3')

    const tombstone = await database.db
      .select()
      .from(database.appleHealthImportedCopyTombstonesTable)

    const realApi = await startRealApiProcess()
    const pushToken = `acceptance-push-${randomUUID()}`
    const registered = await requestTo(realApi.targetBaseUrl, realSession.accessToken, '/api/mobile/push/devices', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'apns',
        token: pushToken,
        environment: 'sandbox',
      }),
    })
    assert.equal(registered.status, 200)

    accountDeletionSession.userId = userId
    const { DELETE } = await import('../app/api/account/delete/route.ts')
    const deletion = await DELETE(new Request('http://account-delete.test/api/account/delete', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
    }))
    assert.equal(deletion.status, 200)
    assert.equal((await json<{ deleted: boolean }>(deletion)).deleted, true)

    const oldDashboard = await requestTo(realApi.targetBaseUrl, realSession.accessToken, '/api/mobile/dashboard')
    assert.equal(oldDashboard.status, 401)
    assert.equal((await json<{ error: { code: string } }>(oldDashboard)).error.code, 'invalid_session')

    const oldMutation = await requestTo(realApi.targetBaseUrl, realSession.accessToken, '/api/mobile/sync/push', {
      method: 'POST',
      headers: { 'idempotency-key': `deleted-account-${randomUUID()}` },
      body: JSON.stringify({
        changes: [{
          changeId: `deleted-account-${randomUUID()}`,
          entityType: 'task',
          entityId: `deleted-account-${randomUUID()}`,
          operation: 'upsert',
          baseVersion: 0,
          payload: { title: 'Must not be recreated' },
          changedAt: new Date().toISOString(),
        }],
      }),
    })
    assert.equal(oldMutation.status, 401)
    assert.equal((await json<{ error: { code: string } }>(oldMutation)).error.code, 'invalid_session')

    const oldPushCredential = await requestTo(realApi.targetBaseUrl, realSession.accessToken, '/api/mobile/push/devices', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'apns',
        token: pushToken,
        environment: 'sandbox',
      }),
    })
    assert.equal(oldPushCredential.status, 401)
    assert.equal((await json<{ error: { code: string } }>(oldPushCredential)).error.code, 'invalid_session')

    const residual = await database.pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "User" WHERE "id" = $1) AS "users",
         (SELECT COUNT(*)::int FROM "MobileDevice" WHERE "userId" = $1) AS "devices",
         (SELECT COUNT(*)::int FROM "MobileDeviceSession" WHERE "userId" = $1) AS "sessions",
         (SELECT COUNT(*)::int FROM "MobilePushDevice" WHERE "userId" = $1 OR "token" = $2) AS "pushCredentials",
         (SELECT COUNT(*)::int FROM "MobileRecord" WHERE "userId" = $1) AS "records",
         (SELECT COUNT(*)::int FROM "MobileSyncChange" WHERE "userId" = $1) AS "syncChanges",
         (SELECT COUNT(*)::int FROM "MobileIdempotencyKey" WHERE "userId" = $1) AS "idempotencyKeys"`,
      [userId, pushToken],
    )
    assert.deepEqual(residual.rows[0], {
      users: 0,
      devices: 0,
      sessions: 0,
      pushCredentials: 0,
      records: 0,
    })
  })
})

    const realSessionResponse = await requestTo(realApi.targetBaseUrl, '', '/api/mobile/auth/device-sessions', {
      method: 'POST',
      body: JSON.stringify({
        email: `${userId}@example.test`,
        password: 'offline-recovery-password',
        installId: `ios-deleted-account-${randomUUID()}`,
        platform: 'ios',
        deviceName: 'Acceptance iPhone',
        appVersion: 'acceptance',
      }),
    })

    const realSession = await json<{ accessToken: string; deviceId: string }>(realSessionResponse)

  const startRealApiProcess = async () => {
    const port = await availablePort()
    const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const child = spawn('pnpm', ['--filter', '@workspace/api-server', 'run', 'dev'], {
      cwd: workspaceRoot,
      env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
      stdio: 'ignore',
    })
    const targetBaseUrl = `http://127.0.0.1:${port}`
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
          const health = await fetch(`${targetBaseUrl}/api/healthz`)
          if (health.ok) return { child, targetBaseUrl }
        } catch {
          // The API build and server startup can take a few seconds in CI.
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error('real mobile API process did not become healthy')
    } catch (error) {
      await stopProcess(child)
      throw error
    }
  }

  const stopProcess = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }
