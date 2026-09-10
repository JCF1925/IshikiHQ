import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isHealthClaimOwnershipViolation,
  reportHealthClaimOwnershipViolation,
} from '../lib/health-claim-alerting.ts'

type StoredGrouping = {
  windowStartedAt: Date
  count: number
  updatedAt: Date
}

function createSharedDatabase() {
  let stored: StoredGrouping | undefined
  const database = {
    async $transaction<T>(
      callback: (tx: {
        $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>
        $queryRaw: <R>(query: TemplateStringsArray, ...values: unknown[]) => Promise<R>
      }) => Promise<T>,
    ) {
      const tx = {
        async $executeRaw(query: TemplateStringsArray, ...values: unknown[]) {
          const sql = query.join('?')
          if (sql.includes('INSERT INTO')) {
            const [, windowStartedAt, count, updatedAt] = values
            if (stored?.windowStartedAt.getTime() !== (windowStartedAt as Date).getTime()) {
              stored = {
                windowStartedAt: windowStartedAt as Date,
                count: count as number,
                updatedAt: updatedAt as Date,
              }
            } else {
              stored = { ...stored, count: count as number, updatedAt: updatedAt as Date }
            }
          } else if (sql.includes('UPDATE "OperationsAlertGroup"')) {
            const [count, updatedAt] = values
            stored = { ...stored!, count: count as number, updatedAt: updatedAt as Date }
          }
          return 1
        },
        async $queryRaw<R>() {
          return (stored ? [{ ...stored }] : []) as R
        },
      }
      return callback(tx)
    },
  }
  return database
}

describe('health-claim ownership alert grouping', () => {
  it('recognizes only database ownership-boundary errors', () => {
    assert.equal(
      isHealthClaimOwnershipViolation(new Error('health claim import audit user must match import owner')),
      true,
    )
    assert.equal(
      isHealthClaimOwnershipViolation(new Error('health claim import audit actor must match import owner')),
      true,
    )
    assert.equal(isHealthClaimOwnershipViolation(new Error('unrelated database error')), false)
  })

  it('groups violations from separate reporters through shared aggregate state', async () => {
    const originalFetch = globalThis.fetch
    const previousWebhook = process.env.OPS_ALERT_WEBHOOK_URL
    const previousOwner = process.env.OPS_ALERT_OWNER
    const alertBodies: Array<Record<string, any>> = []
    process.env.OPS_ALERT_WEBHOOK_URL = 'https://alerts.example.test/receiver'
    process.env.OPS_ALERT_OWNER = 'health-claims-test-owner'
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      alertBodies.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 204 })
    }

    try {
      const sharedDatabase = createSharedDatabase()
      await reportHealthClaimOwnershipViolation(sharedDatabase as never)
      await reportHealthClaimOwnershipViolation(sharedDatabase as never)

      assert.equal(alertBodies.length, 1)
      assert.equal(alertBodies[0].details.groupedCount, 1)
      assert.equal(alertBodies[0].details.groupingWindowSeconds, 60)
      assert.doesNotMatch(JSON.stringify(alertBodies[0]), /request|credential|record|user/i)
    } finally {
      globalThis.fetch = originalFetch
      if (previousWebhook === undefined) delete process.env.OPS_ALERT_WEBHOOK_URL
      else process.env.OPS_ALERT_WEBHOOK_URL = previousWebhook
      if (previousOwner === undefined) delete process.env.OPS_ALERT_OWNER
      else process.env.OPS_ALERT_OWNER = previousOwner
    }
  })

  it('does not throw when shared grouping is unavailable', async () => {
    const result = await reportHealthClaimOwnershipViolation({
      $transaction: async () => {
        throw new Error('grouping table unavailable')
      },
    } as never)
    assert.equal(result, false)
  })
})