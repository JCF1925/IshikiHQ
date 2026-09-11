const HEALTH_STATE_STORAGE_KEY = 'syntropic.apple-health-state.v1';

/**
 * HealthKit controls are local UI state, but they must not be shared between
 * accounts that use the same device session.
 */
export function healthStateStorageKey(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('HealthKit state requires an authenticated account.');
  return `${HEALTH_STATE_STORAGE_KEY}.${encodeURIComponent(normalizedEmail)}`;
}