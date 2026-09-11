import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { healthStateStorageKey } from '../lib/health-state.ts';
import { importHealthKitAndRecordSuccess, runHealthKitSmokeTest } from '../lib/health-smoke.ts';

function adapterFor(read) {
  return {
    read,
    availability: async () => ({ available: true }),
    authorization: async () => 'authorized',
    request: async () => ({}),
    writeSmokeSample: async () => {},
    removeSmokeSample: async () => {},
  };
}

const previousSyncAt = {
  activity: '2026-09-09T08:00:00.000Z',
  sleep: '2026-09-09T09:00:00.000Z',
};

describe('HealthKit sync status', () => {
  it('does not restore one account’s status for another account', () => {
    const storage = new Map();
    const previousAccount = healthStateStorageKey('previous@example.com');
    const nextAccount = healthStateStorageKey('next@example.com');
    storage.set(previousAccount, JSON.stringify({
      selected: ['activity'],
      lastSuccessfulSyncAt: { activity: '2026-09-10T10:00:00.000Z' },
    }));

    assert.notEqual(previousAccount, nextAccount);
    assert.equal(storage.get(nextAccount), undefined);
  });

  it('advances only the imported type after an accepted batch', async () => {
    const commits = [];
    const result = await importHealthKitAndRecordSuccess(
      adapterFor(async () => ({ samples: [], deletions: [], anchor: 'activity-next' })),
      'activity',
      'activity-previous',
      previousSyncAt,
      async (commit) => commits.push(commit),
      () => '2026-09-10T10:00:00.000Z',
    );

    assert.equal(result.result.anchor, 'activity-next');
    assert.deepEqual(result.lastSuccessfulSyncAt, {
      activity: '2026-09-10T10:00:00.000Z',
      sleep: previousSyncAt.sleep,
    });
    assert.deepEqual(commits, [{
      previousAnchor: 'activity-previous',
      result: {
        samples: [],
        deletions: [],
        anchor: 'activity-next',
        attempts: 1,
        recovered: false,
      },
    }]);
  });

  it('preserves the previous timestamp when the native read fails', async () => {
    let commitCalls = 0;
    await assert.rejects(
      importHealthKitAndRecordSuccess(
        adapterFor(async () => {
          throw new Error('HealthKit unavailable');
        }),
        'activity',
        'activity-previous',
        previousSyncAt,
        async () => {
          commitCalls += 1;
        },
      ),
      /HealthKit unavailable/,
    );

    assert.equal(commitCalls, 0);
    assert.deepEqual(previousSyncAt, {
      activity: '2026-09-09T08:00:00.000Z',
      sleep: '2026-09-09T09:00:00.000Z',
    });
  });

  it('preserves the previous timestamp when HealthKit omits the next anchor', async () => {
    let readCalls = 0;
    await assert.rejects(
      importHealthKitAndRecordSuccess(
        adapterFor(async () => {
          readCalls += 1;
          return { samples: [], deletions: [] };
        }),
        'activity',
        'activity-previous',
        previousSyncAt,
        async () => {},
      ),
      /returned no next anchor/,
    );

    assert.equal(readCalls, 2);
    assert.deepEqual(previousSyncAt.activity, '2026-09-09T08:00:00.000Z');
  });

  it('preserves the previous timestamp when the upload is rejected', async () => {
    await assert.rejects(
      importHealthKitAndRecordSuccess(
        adapterFor(async () => ({ samples: [], deletions: [], anchor: 'activity-next' })),
        'activity',
        'activity-previous',
        previousSyncAt,
        async () => {
          throw new Error('upload rejected');
        },
      ),
      /upload rejected/,
    );

    assert.deepEqual(previousSyncAt.activity, '2026-09-09T08:00:00.000Z');
    assert.deepEqual(previousSyncAt.sleep, '2026-09-09T09:00:00.000Z');
  });
});

describe('HealthKit smoke evidence', () => {
  it('keeps the Activity delta privacy-safe without retaining native anchors', async () => {
    let readCalls = 0;
    const result = (await runHealthKitSmokeTest({
      availability: async () => ({ available: true }),
      authorization: async () => 'authorized',
      request: async () => ({ activity: 'authorized' }),
      read: async () => {
        readCalls += 1;
        return {
          samples: readCalls === 1
            ? []
            : [{
              id: 'native-sample-id',
              type: 'activity',
              value: 1,
              unit: 'count',
              startDate: '2026-09-10T10:00:00.000Z',
              endDate: '2026-09-10T10:00:01.000Z',
              source: 'test',
              sourceRevision: '1',
            }],
          deletions: [],
          anchor: readCalls === 1 ? 'native-anchor-1' : 'native-anchor-2',
        };
      },
      writeSmokeSample: async () => {},
      removeSmokeSample: async () => {},
    }, ['activity']))[0];

    assert.equal(result.authorization, 'authorized');
    assert.equal(result.expectedSampleDelta, 1);
    assert.equal(result.observedSampleDelta, 1);
    assert.equal(result.sampleDeltaPassed, true);
    assert.equal(Object.hasOwn(result, 'firstAnchor'), false);
    assert.equal(Object.hasOwn(result, 'secondAnchor'), false);
  });
});