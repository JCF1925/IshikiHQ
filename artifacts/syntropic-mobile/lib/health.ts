import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type HealthType = 'cardiovascular' | 'blood_pressure' | 'sleep' | 'activity' | 'body_measurements' | 'temperature' | 'oxygen' | 'respiratory';
export type HealthAuthorization = 'unavailable' | 'notDetermined' | 'denied' | 'authorized';

export interface HealthSample {
  id: string;
  type: HealthType;
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  source: string;
  sourceRevision: string;
  metadata?: Record<string, unknown>;
}

export interface HealthDeletion {
  healthKitUuid: string;
  sampleType: string;
  deletedAt: string;
}

export interface HealthReadResult {
  samples: HealthSample[];
  deletions: HealthDeletion[];
  anchor?: string;
}

export interface HealthAdapter {
  availability(): Promise<{ available: boolean; reason?: string }>;
  authorization(type: HealthType): Promise<HealthAuthorization>;
  request(types: HealthType[]): Promise<Record<HealthType, HealthAuthorization>>;
  read(type: HealthType, anchor?: string): Promise<HealthReadResult>;
  /**
   * Development-only fixture hooks. The native implementation must write one
   * synthetic activity sample, never expose its value or identifier, and
   * remove it after the anchored-read assertion completes.
   */
  writeSmokeSample(type: HealthType): Promise<void>;
  removeSmokeSample(): Promise<void>;
}

const unavailable: HealthAdapter = {
  async availability() {
    return {
      available: false,
      reason: Platform.OS === 'ios'
        ? 'Apple Health requires an Ishiki development build. It is not available in Expo Go.'
        : 'Apple Health is available on iPhone development builds only.',
    };
  },
  async authorization() { return 'unavailable'; },
  async request(types) {
    return Object.fromEntries(types.map((type) => [type, 'unavailable'])) as Record<HealthType, HealthAuthorization>;
  },
  async read() { return { samples: [], deletions: [] }; },
  async writeSmokeSample() {},
  async removeSmokeSample() {},
};

export function getHealthAdapter(): HealthAdapter {
  if (Platform.OS !== 'ios') return unavailable;
  const module = requireOptionalNativeModule<HealthAdapter>('SyntropicHealthKit');
  return module ?? unavailable;
}