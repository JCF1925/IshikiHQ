import type {
  HealthAdapter,
  HealthAuthorization,
  HealthReadResult,
  HealthSample,
  HealthType,
} from './health';

export const healthKitSmokeTypes: HealthType[] = [
  'cardiovascular',
  'blood_pressure',
  'sleep',
  'activity',
  'body_measurements',
  'temperature',
  'oxygen',
  'respiratory',
];

export type HealthKitSmokeResult = {
  type: HealthType;
  authorization: HealthAuthorization;
  firstAnchor?: string;
  secondAnchor?: string;
  firstSampleCount: number;
  firstDeletionCount: number;
  secondSampleCount: number;
  secondDeletionCount: number;
  anchoredRead: boolean;
  firstReadAttempts: number;
  secondReadAttempts: number;
  recovered: boolean;
  smokeSampleInserted: boolean;
  expectedSampleDelta: number;
  observedSampleDelta: number;
  sampleDeltaPassed: boolean;
  error?: string;
};

export type HealthKitReadRecovery = Omit<HealthReadResult, 'anchor'> & {
  anchor: string;
  attempts: number;
  recovered: boolean;
};

export type HealthKitImportCommit = (input: {
  previousAnchor: string | null;
  result: HealthKitReadRecovery;
}) => Promise<void>;
const MAX_READ_ATTEMPTS = 2;

/**
 * HealthKit can interrupt an anchored read or return its changes without a
 * next anchor. Neither result is safe to acknowledge to the API, so retry
 * from the same server anchor and only return a complete read.
 */
export async function readHealthKitWithRecovery(
  adapter: HealthAdapter,
  type: HealthType,
  anchor?: string,
): Promise<HealthKitReadRecovery> {
  let lastFailure = 'HealthKit anchored read returned no next anchor';

  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt += 1) {
    try {
      const result = await adapter.read(type, anchor);
      if (result.anchor) {
        return {
          ...result,
          anchor: result.anchor,
          attempts: attempt,
          recovered: attempt > 1,
        };
      }
      lastFailure = 'HealthKit anchored read returned no next anchor';
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : 'HealthKit read failed';
    }
  }

  throw new Error(`HealthKit anchored read failed after ${MAX_READ_ATTEMPTS} attempts: ${lastFailure}`);
}

/**
 * Keep the HealthKit read and server acknowledgement ordered. A partial
 * result cannot reach the importer because the commit callback is invoked
 * only after a read returns a valid next anchor.
 */
export async function importHealthKitWithRecovery(
  adapter: HealthAdapter,
  type: HealthType,
  previousAnchor: string | undefined,
  commit: HealthKitImportCommit,
): Promise<HealthKitReadRecovery> {
  const result = await readHealthKitWithRecovery(adapter, type, previousAnchor);
  await commit({
    previousAnchor: previousAnchor ?? null,
    result,
  });
  return result;
}
const summarize = (
  type: HealthType,
  authorization: HealthAuthorization,
  first: HealthKitReadRecovery,
  second: HealthKitReadRecovery,
  smokeSampleInserted: boolean,
): HealthKitSmokeResult => ({
  type,
  authorization,
  firstAnchor: first.anchor,
  secondAnchor: second.anchor,
  firstSampleCount: first.samples.length,
  firstDeletionCount: first.deletions.length,
  secondSampleCount: second.samples.length,
  secondDeletionCount: second.deletions.length,
  anchoredRead: Boolean(first.anchor && second.anchor),
  firstReadAttempts: first.attempts,
  secondReadAttempts: second.attempts,
  recovered: first.recovered || second.recovered,
  smokeSampleInserted,
  expectedSampleDelta: smokeSampleInserted ? 1 : 0,
  observedSampleDelta: second.samples.length,
  sampleDeltaPassed: smokeSampleInserted && second.samples.length === 1,
});

/**
 * Runs the development-build-only HealthKit contract without hiding a
 * per-type denial behind a single aggregate permission result.
 */
export async function runHealthKitSmokeTest(
  adapter: HealthAdapter,
  types: HealthType[] = healthKitSmokeTypes,
): Promise<HealthKitSmokeResult[]> {
  const authorization = await adapter.request(types);
  const smokeSampleType: HealthType = 'activity';
  const results: HealthKitSmokeResult[] = [];

  for (const type of types) {
    const outcome = authorization[type] ?? 'unavailable';
    if (outcome !== 'authorized') {
      results.push({
        type,
        authorization: outcome,
        firstSampleCount: 0,
        firstDeletionCount: 0,
        secondSampleCount: 0,
        secondDeletionCount: 0,
        anchoredRead: false,
        firstReadAttempts: 0,
        secondReadAttempts: 0,
        recovered: false,
        smokeSampleInserted: false,
        expectedSampleDelta: 0,
        observedSampleDelta: 0,
        sampleDeltaPassed: false,
      });
      continue;
    }

    let smokeSampleInserted = false;
    let result: HealthKitSmokeResult;
    try {
      const first = await readHealthKitWithRecovery(adapter, type);
      if (type === smokeSampleType) {
        await adapter.writeSmokeSample(type);
        smokeSampleInserted = true;
      }
      const second = await readHealthKitWithRecovery(adapter, type, first.anchor);
      result = summarize(type, outcome, first, second, smokeSampleInserted);
    } catch (error) {
      result = {
        type,
        authorization: outcome,
        firstSampleCount: 0,
        firstDeletionCount: 0,
        secondSampleCount: 0,
        secondDeletionCount: 0,
        anchoredRead: false,
        firstReadAttempts: 0,
        secondReadAttempts: 0,
        recovered: false,
        smokeSampleInserted,
        expectedSampleDelta: smokeSampleInserted ? 1 : 0,
        observedSampleDelta: 0,
        sampleDeltaPassed: false,
        error: error instanceof Error ? error.message : 'HealthKit read failed',
      };
    } finally {
      if (smokeSampleInserted) {
        try {
          await adapter.removeSmokeSample();
        } catch {
          // Preserve the anchored-read result; cleanup is best effort.
        }
      }
    }
    results.push(result);
  }

  return results;
}
