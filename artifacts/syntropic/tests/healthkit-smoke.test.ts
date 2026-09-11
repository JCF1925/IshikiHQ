import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  importHealthKitWithRecovery,
  importHealthKitTypesWithRecovery,
  type HealthKitBatchImportCommit,
  type HealthKitImportCommit,
  runHealthKitSmokeTest,
} from '../../syntropic-mobile/lib/health-smoke'
import type { HealthAdapter, HealthType } from '../../syntropic-mobile/lib/health'

const types: HealthType[] = ['activity', 'sleep', 'oxygen']

describe('HealthKit development-build smoke contract', () => {
  it('keeps per-type permission outcomes and uses the returned anchor for the next read', async () => {
    const reads: Array<{ type: HealthType; anchor?: string }> = []
    const adapter: HealthAdapter = {
      availability: async () => ({ available: true }),
      authorization: async () => 'notDetermined',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'denied',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'authorized',
        respiratory: 'denied',
      }),
      read: async (type, anchor) => {
        reads.push({ type, anchor })
        return {
          samples: anchor ? [{
            id: 'synthetic-sample',
            type,
            value: 1,
            unit: 'count',
            startDate: '2026-09-09T00:00:00.000Z',
            endDate: '2026-09-09T00:01:00.000Z',
            source: 'com.apple.Health',
            sourceRevision: 'smoke',
          }] : [],
          deletions: [],
          anchor: anchor ? `${anchor}-next` : `${type}-anchor-1`,
        }
      },
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => {},
    }

    const results = await runHealthKitSmokeTest(adapter, types)
    assert.deepEqual(results.map((result) => [result.type, result.authorization]), [
      ['activity', 'authorized'],
      ['sleep', 'denied'],
      ['oxygen', 'authorized'],
    ])
    assert.equal(results.find((result) => result.type === 'activity')?.anchoredRead, true)
    assert.equal(results.find((result) => result.type === 'activity')?.sampleDeltaPassed, true)
    assert.equal(results.find((result) => result.type === 'activity')?.observedSampleDelta, 1)
    assert.equal(results.find((result) => result.type === 'sleep')?.anchoredRead, false)
    assert.equal(results.find((result) => result.type === 'activity')?.recovered, false)
    assert.deepEqual(reads.sort((left, right) => `${left.type}:${left.anchor ?? ''}`.localeCompare(`${right.type}:${right.anchor ?? ''}`)), [
      { type: 'activity', anchor: undefined },
      { type: 'activity', anchor: 'activity-anchor-1' },
      { type: 'oxygen', anchor: undefined },
      { type: 'oxygen', anchor: 'oxygen-anchor-1' },
    ])
  })

  it('reports native read failures without losing the permission outcome', async () => {
    const adapter: HealthAdapter = {
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'denied',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'denied',
        respiratory: 'denied',
      }),
      read: async () => { throw new Error('anchored query unavailable') },
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => {},
    }
    const [result] = await runHealthKitSmokeTest(adapter, ['activity'])
    assert.equal(result.authorization, 'authorized')
    assert.equal(result.anchoredRead, false)
    assert.equal(result.error, 'HealthKit anchored read failed after 2 attempts: anchored query unavailable')
  })

  it('retries an incomplete anchored read without acknowledging its partial changes', async () => {
    const reads: Array<{ type: HealthType; anchor?: string }> = []
    let attempts = 0
    const adapter: HealthAdapter = {
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'denied',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'denied',
        respiratory: 'denied',
      }),
      read: async (type, anchor) => {
        reads.push({ type, anchor })
        attempts += 1
        if (attempts === 1) {
          return {
            samples: [{
              id: 'interrupted-sample',
              type,
              value: 1,
              unit: 'count',
              startDate: '2026-09-08T00:00:00.000Z',
              endDate: '2026-09-08T00:01:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'acceptance',
            }],
            deletions: [],
          }
        }
        return {
          samples: [],
          deletions: [],
          anchor: anchor ? `${anchor}-next` : 'activity-anchor-1',
        }
      },
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => {},
    }

    const [result] = await runHealthKitSmokeTest(adapter, ['activity'])
    assert.equal(result.anchoredRead, true)
    assert.equal(result.recovered, true)
    assert.equal(result.firstReadAttempts, 2)
    assert.equal(result.secondReadAttempts, 1)
    assert.deepEqual(reads, [
      { type: 'activity', anchor: undefined },
      { type: 'activity', anchor: undefined },
      { type: 'activity', anchor: 'activity-anchor-1' },
    ])
  })

  it('fails an unexpected sample delta while still removing the synthetic sample', async () => {
    let removed = false
    let reads = 0
    const adapter: HealthAdapter = {
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'denied',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'denied',
        respiratory: 'denied',
      }),
      read: async (type, anchor) => {
        reads += 1
        return {
          samples: anchor && reads === 2
            ? [{
              id: 'unexpected-sample',
              type,
              value: 1,
              unit: 'count',
              startDate: '2026-09-09T00:00:00.000Z',
              endDate: '2026-09-09T00:01:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'smoke',
            }, {
              id: 'second-unexpected-sample',
              type,
              value: 1,
              unit: 'count',
              startDate: '2026-09-09T00:02:00.000Z',
              endDate: '2026-09-09T00:03:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'smoke',
            }]
            : [],
          deletions: [],
          anchor: anchor ? 'activity-anchor-2' : 'activity-anchor-1',
        }
      },
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => { removed = true },
    }

    const [result] = await runHealthKitSmokeTest(adapter, ['activity'])
    assert.equal(result.sampleDeltaPassed, false)
    assert.equal(result.observedSampleDelta, 2)
    assert.equal(removed, true)
  })

  it('warns when cleanup fails without changing the anchored-read result', async () => {
    const cleanupFailure = 'cleanup failed for private sample identifier'
    const adapter: HealthAdapter = {
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'denied',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'denied',
        respiratory: 'denied',
      }),
      read: async (type, anchor) => ({
        samples: anchor ? [{
          id: 'synthetic-sample',
          type,
          value: 1,
          unit: 'count',
          startDate: '2026-09-09T00:00:00.000Z',
          endDate: '2026-09-09T00:01:00.000Z',
          source: 'com.apple.Health',
          sourceRevision: 'smoke',
        }] : [],
        deletions: [],
        anchor: anchor ? `${anchor}-next` : `${type}-anchor-1`,
      }),
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => { throw new Error(cleanupFailure) },
    }

    const [result] = await runHealthKitSmokeTest(adapter, ['activity'])

    assert.equal(result.authorization, 'authorized')
    assert.equal(result.anchoredRead, true)
    assert.equal(result.sampleDeltaPassed, true)
    assert.equal(result.cleanupWarning, 'Temporary HealthKit sample could not be removed. It may remain on this device. Anchored-read results are still shown.')
    assert.doesNotMatch(result.cleanupWarning ?? '', new RegExp(cleanupFailure))
    assert.equal(result.error, undefined)
  })

  it('keeps the last server anchor across an interrupted read and recreated importer', async () => {
    const reads: Array<{ type: HealthType; anchor?: string }> = []
    const batches: Array<{
      previousAnchor: string | null;
      anchor: string;
      sampleIds: string[];
      deletionIds: string[];
    }> = []
    let mode: 'interrupted' | 'recovered' = 'interrupted'
    let persistedAnchor: string | undefined = 'server-anchor-1'

    const createAdapter = (): HealthAdapter => ({
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'denied',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'denied',
        respiratory: 'denied',
      }),
      read: async (type, anchor) => {
        reads.push({ type, anchor })
        if (mode === 'interrupted') {
          return {
            samples: [{
              id: 'not-safe-to-acknowledge',
              type,
              value: 7,
              unit: 'count',
              startDate: '2026-09-08T00:00:00.000Z',
              endDate: '2026-09-08T00:01:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'acceptance',
            }],
            deletions: [{
              healthKitUuid: 'not-safe-to-delete',
              sampleType: type,
              deletedAt: '2026-09-08T00:02:00.000Z',
            }],
          }
        }
        return {
          samples: [{
            id: 'recovered-sample',
            type,
            value: 8,
            unit: 'count',
            startDate: '2026-09-08T01:00:00.000Z',
            endDate: '2026-09-08T01:01:00.000Z',
            source: 'com.apple.Health',
            sourceRevision: 'acceptance',
          }],
          deletions: [{
            healthKitUuid: 'recovered-deletion',
            sampleType: type,
            deletedAt: '2026-09-08T01:02:00.000Z',
          }],
          anchor: 'server-anchor-2',
        }
      },
    })

    const commit: HealthKitImportCommit = async ({ previousAnchor, result }) => {
      batches.push({
        previousAnchor,
        anchor: result.anchor,
        sampleIds: result.samples.map((sample) => sample.id),
        deletionIds: result.deletions.map((deletion) => deletion.healthKitUuid),
      })
      persistedAnchor = result.anchor
    }

    await assert.rejects(
      importHealthKitWithRecovery(createAdapter(), 'activity', persistedAnchor, commit),
      /HealthKit anchored read failed after 2 attempts/,
    )
    assert.equal(persistedAnchor, 'server-anchor-1')
    assert.deepEqual(batches, [])

    mode = 'recovered'
    const recreatedStateAnchor = persistedAnchor
    const recovered = await importHealthKitWithRecovery(createAdapter(), 'activity', recreatedStateAnchor, commit)

    assert.equal(recovered.anchor, 'server-anchor-2')
    assert.equal(persistedAnchor, 'server-anchor-2')
    assert.deepEqual(batches, [{
      previousAnchor: 'server-anchor-1',
      anchor: 'server-anchor-2',
      sampleIds: ['recovered-sample'],
      deletionIds: ['recovered-deletion'],
    }])
    assert.deepEqual(reads, [
      { type: 'activity', anchor: 'server-anchor-1' },
      { type: 'activity', anchor: 'server-anchor-1' },
      { type: 'activity', anchor: 'server-anchor-1' },
    ])
  })

  it('continues a recreated multi-type import when one type stays interrupted', async () => {
    const reads: Array<{ type: HealthType; anchor?: string }> = []
    const batches: Array<{
      type: HealthType;
      previousAnchor: string | null;
      anchor: string;
      sampleIds: string[];
    }> = []
    const persistedAnchors: Partial<Record<HealthType, string>> = {
      activity: 'activity-server-anchor-1',
      sleep: 'sleep-server-anchor-1',
    }
    let mode: 'interrupted' | 'recovered' = 'interrupted'

    const createAdapter = (): HealthAdapter => ({
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({
        cardiovascular: 'denied',
        blood_pressure: 'denied',
        sleep: 'authorized',
        activity: 'authorized',
        body_measurements: 'denied',
        temperature: 'denied',
        oxygen: 'denied',
        respiratory: 'denied',
      }),
      read: async (type, anchor) => {
        reads.push({ type, anchor })
        if (type === 'activity' && mode === 'interrupted') {
          return {
            samples: [{
              id: 'activity-partial-sample',
              type,
              value: 7,
              unit: 'count',
              startDate: '2026-09-08T00:00:00.000Z',
              endDate: '2026-09-08T00:01:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'acceptance',
            }],
            deletions: [],
          }
        }
        return {
          samples: type === 'sleep'
            ? [{
              id: mode === 'interrupted' ? 'sleep-imported-sample' : 'sleep-second-sample',
              type,
              value: 8,
              unit: 'hours',
              startDate: '2026-09-08T01:00:00.000Z',
              endDate: '2026-09-08T09:00:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'acceptance',
            }]
            : [{
              id: 'activity-recovered-sample',
              type,
              value: 9,
              unit: 'count',
              startDate: '2026-09-08T02:00:00.000Z',
              endDate: '2026-09-08T02:01:00.000Z',
              source: 'com.apple.Health',
              sourceRevision: 'acceptance',
            }],
          deletions: [],
          anchor: type === 'activity' ? 'activity-server-anchor-2' : (
            mode === 'interrupted' ? 'sleep-server-anchor-2' : 'sleep-server-anchor-3'
          ),
        }
      },
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => {},
    })

    const commit: HealthKitBatchImportCommit = async ({ type, previousAnchor, result }) => {
      batches.push({
        type,
        previousAnchor,
        anchor: result.anchor,
        sampleIds: result.samples.map((sample) => sample.id),
      })
      persistedAnchors[type] = result.anchor
    }

    const interruptedRun = await importHealthKitTypesWithRecovery(
      createAdapter(),
      ['activity', 'sleep'],
      persistedAnchors,
      commit,
    )

    assert.deepEqual(interruptedRun.completed.map(({ type }) => type), ['sleep'])
    assert.deepEqual(interruptedRun.failures.map(({ type }) => type), ['activity'])
    assert.equal(persistedAnchors.activity, 'activity-server-anchor-1')
    assert.equal(persistedAnchors.sleep, 'sleep-server-anchor-2')
    assert.deepEqual(batches, [{
      type: 'sleep',
      previousAnchor: 'sleep-server-anchor-1',
      anchor: 'sleep-server-anchor-2',
      sampleIds: ['sleep-imported-sample'],
    }])

    mode = 'recovered'
    const recreatedRun = await importHealthKitTypesWithRecovery(
      createAdapter(),
      ['activity'],
      persistedAnchors,
      commit,
    )

    assert.deepEqual(recreatedRun.failures, [])
    assert.equal(recreatedRun.completed[0]?.result.anchor, 'activity-server-anchor-2')
    assert.equal(persistedAnchors.activity, 'activity-server-anchor-2')
    assert.deepEqual(batches, [
      {
        type: 'sleep',
        previousAnchor: 'sleep-server-anchor-1',
        anchor: 'sleep-server-anchor-2',
        sampleIds: ['sleep-imported-sample'],
      },
      {
        type: 'activity',
        previousAnchor: 'activity-server-anchor-1',
        anchor: 'activity-server-anchor-2',
        sampleIds: ['activity-recovered-sample'],
      },
    ])
    assert.deepEqual(reads, [
      { type: 'activity', anchor: 'activity-server-anchor-1' },
      { type: 'activity', anchor: 'activity-server-anchor-1' },
      { type: 'sleep', anchor: 'sleep-server-anchor-1' },
      { type: 'activity', anchor: 'activity-server-anchor-1' },
    ])
  })
})