import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  createMobileDeviceSession,
  getMobileSyncHistory,
  getMobileMedicationReminders,
  getMobilePushReminders,
  initiateMobileUpload,
  pullMobileSync,
  pushMobileSync,
  recordMobileMedicationDose,
  registerMobilePushDevice,
  restoreMobileCapture,
  revokeMobileDeviceSession,
  setAuthFailureHandler,
  setAuthTokenGetter,
  updateMobileMedicationReminder,
  updateMobilePushReminders,
  uploadMobileUploadContent,
  type MobileSyncHistoryEntry,
  type MobileMedicationReminders,
} from '@workspace/api-client-react';
import { subscribeMedicationReminderForegroundRefresh } from '../lib/medication-reminder-lifecycle';
import {
  dedupeMedicationReminderSchedules,
  isMedicationReminderNotification,
  isMedicationTimeInQuietHours,
  medicationDailyTrigger,
  reconcileReminderTimezone,
} from '../lib/medication-reminder-scheduling';
import { getCachedMedicationOptions } from '../lib/medication-capture';

export type CaptureKind = 'transaction' | 'task' | 'health' | 'medication' | 'event';
export type QueueState = 'pending' | 'syncing' | 'conflict' | 'error';
export interface QueueItem {
  id: string;
  idempotencyKey: string;
  kind: CaptureKind;
  title: string;
  detail?: string;
  occurredAt: string;
  amount?: number;
  currency?: string;
  vitalType?: string;
  vitalValue?: number;
  vitalUnit?: string;
  medicationId?: string;
  scheduleId?: string;
  dose?: string;
  medicationStatus?: 'taken' | 'skipped';
  attachmentUri?: string;
  state: QueueState;
  error?: string;
  errorCode?: string;
  retryCount?: number;
  serverVersion?: number;
}
export interface RemoteChange {
  changeId: string;
  entityType: string;
  entityId: string;
  operation: string;
  baseVersion?: number;
  payload: Record<string, unknown>;
  changedAt: string;
}
export type SyncHistoryStatus = 'applied' | 'conflicted' | 'rejected' | 'deleted';
export interface SyncHistoryItem {
  changeId: string;
  entityType: string;
  entityId: string;
  status: SyncHistoryStatus;
  changedAt: string;
  version?: number;
}
interface AppContextValue {
  ready: boolean;
  session: boolean;
  email: string | null;
  sessionNotice: string | null;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  queue: QueueItem[];
  remoteChanges: RemoteChange[];
  syncHistory: SyncHistoryItem[];
  syncHistoryLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'offline';
  login(email: string, passcode: string): Promise<void>;
  unlock(): Promise<boolean>;
  logout(): Promise<void>;
  setBiometric(enabled: boolean): Promise<void>;
  enqueue(input: Omit<QueueItem, 'id' | 'idempotencyKey' | 'state'>): Promise<void>;
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  syncNow(): Promise<void>;
  restoreCapture(entityId: string, expectedVersion: number): Promise<void>;
  enableReminders(): Promise<'granted' | 'denied'>;
  medicationReminders: MobileMedicationReminders | null;
  refreshMedicationReminders(): Promise<void>;
  setMedicationReminder(scheduleId: string, enabled: boolean, revealName: boolean): Promise<void>;
  setMedicationQuietHours(quietHoursStart: string | null, quietHoursEnd: string | null): Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);
const VAULT_KEY = 'syntropic.auth.v1';
const QUEUE_KEY = 'syntropic.encrypted.queue.v1';
const BIOMETRIC_KEY = 'syntropic.biometric.v1';
const INSTALL_KEY = 'syntropic.install-id.v1';
const CURSOR_KEY = 'syntropic.sync-cursor.v1';
const MEDICATION_OPTIONS_KEY = 'syntropic.medication-options.v1';
const SYNC_HISTORY_KEY = 'syntropic.sync-history.v1';
const MEDICATION_NOTIFICATION_CHANNEL = 'medication-reminders';
const REMOTE_CHANGES_KEY = 'syntropic.remote-changes.v1';
const medicationNotificationBody = 'It is time to review a medication dose in Ishiki.';
let medicationNotificationScheduleQueue = Promise.resolve();
const localUuid = () => {
  const hex = (count: number) => Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
};
const shortBatchHash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
};
const syncHistoryStorageKey = (account: string) => `${SYNC_HISTORY_KEY}.${encodeURIComponent(account.trim().toLowerCase())}`;
const isSyncHistoryStatus = (value: unknown): value is SyncHistoryStatus =>
  value === 'applied' || value === 'conflicted' || value === 'rejected' || value === 'deleted';
const isSyncHistoryItem = (value: unknown): value is SyncHistoryItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SyncHistoryItem>;
  return typeof item.changeId === 'string'
    && typeof item.entityType === 'string'
    && typeof item.entityId === 'string'
    && isSyncHistoryStatus(item.status)
    && typeof item.changedAt === 'string';
};
const parseStoredSyncHistory = (value: string | null): SyncHistoryItem[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isSyncHistoryItem).slice(0, 200) : [];
  } catch {
    return [];
  }
};
const mergeSyncHistory = (current: SyncHistoryItem[], incoming: SyncHistoryItem[]): SyncHistoryItem[] => {
  const byChangeId = new Map(current.map((item) => [item.changeId, item]));
  for (const item of incoming) byChangeId.set(item.changeId, item);
  return [...byChangeId.values()]
    .sort((left, right) => Date.parse(right.changedAt) - Date.parse(left.changedAt))
    .slice(0, 200);
};
const entityTypeForQueueItem = (item: QueueItem): string =>
  item.kind === 'health' ? 'vital' : item.kind === 'medication' ? 'medicationDose' : item.kind;

const secureGet = (key: string) => Platform.OS === 'web'
  ? AsyncStorage.getItem(key)
  : SecureStore.getItemAsync(key);
const secureSet = (key: string, value: string, options?: SecureStore.SecureStoreOptions) => Platform.OS === 'web'
  ? AsyncStorage.setItem(key, value)
  : SecureStore.setItemAsync(key, value, options);
const secureDelete = (key: string) => Platform.OS === 'web'
  ? AsyncStorage.removeItem(key)
  : SecureStore.deleteItemAsync(key);

const clearMedicationNotifications = async () => {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((notification) => isMedicationReminderNotification(notification.content.data))
    .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)));
};

async function withMedicationNotificationScheduleLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = medicationNotificationScheduleQueue;
  let release: () => void = () => undefined;
  medicationNotificationScheduleQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

const isInvalidSessionError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  const nested = (data as { error?: unknown }).error;
  return Boolean(
    nested &&
    typeof nested === 'object' &&
    (nested as { code?: unknown }).code === 'invalid_session',
  );
};

setAuthTokenGetter(async () => {
  const vault = await secureGet(VAULT_KEY);
  return vault ? (JSON.parse(vault) as { token?: string }).token ?? null : null;
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [remoteChanges, setRemoteChanges] = useState<RemoteChange[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryItem[]>([]);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'offline'>('idle');
  const syncInFlight = useRef(false);
  const invalidatedRef = useRef(false);
  const activeTokenRef = useRef<string | null>(null);
  const invalidatingRef = useRef(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [medicationReminders, setMedicationReminders] = useState<MobileMedicationReminders | null>(null);

  const persistQueue = useCallback(async (next: QueueItem[]) => {
    setQueue(next);
    // SecureStore is backed by Keychain/Keystore. Keep this queue compact and encrypted at rest.
    await secureSet(QUEUE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    void (async () => {
      const [vault, storedQueue, bio] = await Promise.all([
        secureGet(VAULT_KEY),
        secureGet(QUEUE_KEY),
        AsyncStorage.getItem(BIOMETRIC_KEY),
      ]);
      const storedAccount = vault ? JSON.parse(vault) as { email: string; token?: string } : null;
      activeTokenRef.current = storedAccount?.token ?? null;
      setEmail(storedAccount?.email ?? null);
      setQueue(storedQueue ? JSON.parse(storedQueue) as QueueItem[] : []);
      const storedHistory = storedAccount
        ? await AsyncStorage.getItem(syncHistoryStorageKey(storedAccount.email))
        : null;
      setSyncHistory(parseStoredSyncHistory(storedHistory));
      const storedMedicationOptions = await secureGet(MEDICATION_OPTIONS_KEY);
      const cachedMedicationOptions = storedMedicationOptions
        ? JSON.parse(storedMedicationOptions) as { email: string; options: MobileMedicationReminders }
        : null;
      setMedicationReminders(getCachedMedicationOptions(cachedMedicationOptions, storedAccount?.email));
      const storedRemote = await AsyncStorage.getItem(REMOTE_CHANGES_KEY);
      setRemoteChanges(storedRemote ? JSON.parse(storedRemote) as RemoteChange[] : []);
      setBiometricEnabledState(bio === 'true');
      if (Platform.OS !== 'web') {
        const [hardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        setBiometricAvailable(hardware && enrolled);
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (nextEmail: string, passcode: string) => {
    if (!nextEmail.includes('@')) throw new Error('Enter a valid email address.');
    if (passcode.length < 6) throw new Error('Passcode must be at least 6 characters.');
    if (Platform.OS === 'web') throw new Error('Device session sign-in is unavailable in this web preview.');
    let installId = await AsyncStorage.getItem(INSTALL_KEY);
    if (!installId) {
      installId = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(INSTALL_KEY, installId);
    }
    // Password is used only for this exchange and is never persisted.
    const deviceSession = await createMobileDeviceSession({
      email: nextEmail.trim(),
      password: passcode,
      installId,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      deviceName: Constants.deviceName ?? 'Ishiki mobile',
      appVersion: Constants.expoConfig?.version,
    });
    await secureSet(VAULT_KEY, JSON.stringify({ email: nextEmail.trim(), token: deviceSession.accessToken }), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    invalidatingRef.current = false;
    invalidatedRef.current = false;
    activeTokenRef.current = deviceSession.accessToken;
    setAuthTokenGetter(async () => deviceSession.accessToken);
    setEmail(nextEmail.trim());
    setSyncStatus('idle');
    setSessionNotice(null);
    const storedHistory = await AsyncStorage.getItem(syncHistoryStorageKey(nextEmail));
    setSyncHistory(parseStoredSyncHistory(storedHistory));
    setSyncStatus('idle');
    setSyncHistoryLoading(false);
    setMedicationReminders(null);
    await secureDelete(MEDICATION_OPTIONS_KEY);
    setSession(true);
  }, []);

  const unlock = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled) return false;
    if (invalidatedRef.current || !activeTokenRef.current) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Ishiki',
      cancelLabel: 'Use passcode',
      disableDeviceFallback: true,
    });
    if (result.success) setSession(true);
    return result.success;
  }, [biometricAvailable, biometricEnabled]);

  const invalidateSession = useCallback(async () => {
    if (invalidatingRef.current) return;
    invalidatingRef.current = true;
    activeTokenRef.current = null;
    invalidatedRef.current = true;
    setAuthTokenGetter(null);
    await Promise.allSettled([
      secureDelete(VAULT_KEY),
      secureDelete(QUEUE_KEY),
      secureDelete(MEDICATION_OPTIONS_KEY),
      AsyncStorage.removeItem(CURSOR_KEY),
      AsyncStorage.removeItem(REMOTE_CHANGES_KEY),
      AsyncStorage.removeItem(BIOMETRIC_KEY),
      clearMedicationNotifications(),
    ]);
    setSession(false);
    setEmail(null);
    setQueue([]);
    setRemoteChanges([]);
    setSyncHistory([]);
    setSyncStatus('idle');
    setSyncHistoryLoading(false);
    setMedicationReminders(null);
    setBiometricEnabledState(false);
    setSessionNotice('This device session is no longer valid. Sign in again with an active account. Unsynced captures from the previous session were removed to keep them separate from a new account.');
  }, []);

  useEffect(() => {
    setAuthFailureHandler((error, token) => {
      if (isInvalidSessionError(error) && token && token === activeTokenRef.current) {
        return invalidateSession();
      }
    });
    return () => setAuthFailureHandler(null);
  }, [invalidateSession]);

  const logout = useCallback(async () => {
    try { await revokeMobileDeviceSession(); } catch { /* Preserve local logout even when offline. */ }
    activeTokenRef.current = null;
    setAuthTokenGetter(null);
    await secureDelete(VAULT_KEY);
    await secureDelete(MEDICATION_OPTIONS_KEY);
    setEmail(null);
    setSession(false);
    setSessionNotice(null);
    setSyncHistory([]);
    setSyncStatus('idle');
    setSyncHistoryLoading(false);
    setMedicationReminders(null);
  }, []);

  const setBiometric = useCallback(async (enabled: boolean) => {
    if (enabled && !biometricAvailable) throw new Error('Biometric unlock is not available or enrolled.');
    await AsyncStorage.setItem(BIOMETRIC_KEY, String(enabled));
    setBiometricEnabledState(enabled);
  }, [biometricAvailable]);

  const enqueue = useCallback(async (input: Omit<QueueItem, 'id' | 'idempotencyKey' | 'state'>) => {
    if (invalidatedRef.current) return;
    const id = localUuid();
    const item = { ...input, id, idempotencyKey: id, state: 'pending' as const };
    setQueue((current) => {
      const next = [item, ...current];
      void secureSet(QUEUE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const retry = useCallback(async (id: string) => setQueue((current) => {
    if (invalidatedRef.current) return current;
    const next = current.map((item) => item.id === id ? { ...item, state: 'pending' as const, error: undefined, errorCode: undefined, retryCount: (item.retryCount ?? 0) + 1 } : item);
    void secureSet(QUEUE_KEY, JSON.stringify(next)); return next;
  }), []);
  const remove = useCallback(async (id: string) => setQueue((current) => {
    const next = current.filter((item) => item.id !== id);
    void secureSet(QUEUE_KEY, JSON.stringify(next)); return next;
  }), []);
  const rememberSyncHistory = useCallback((entries: SyncHistoryItem[]) => {
    if (!email || !entries.length) return;
    setSyncHistory((current) => {
      const next = mergeSyncHistory(current, entries);
      void AsyncStorage.setItem(syncHistoryStorageKey(email), JSON.stringify(next));
      return next;
    });
  }, [email]);
  const syncNow = useCallback(async () => {
    if (!session || invalidatedRef.current || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncStatus('syncing');
    setSyncHistoryLoading(true);
    const candidates = queue.filter((item) => item.state === 'pending' || item.state === 'error');
    try {
      if (candidates.length) {
        setQueue((current) => current.map((item) => candidates.some((x) => x.id === item.id) ? { ...item, state: 'syncing' } : item));
        const changes = await Promise.all(candidates.map(async (item) => {
          if (invalidatedRef.current) throw new Error('Session invalidated');
          let attachmentId: string | undefined;
          if (item.attachmentUri) {
            const source = await fetch(item.attachmentUri);
            if (!source.ok) throw new Error('The camera attachment could not be read.');
            const blob = await source.blob();
            const initiated = await initiateMobileUpload({
              fileName: `${item.id}.jpg`,
              contentType: blob.type || 'image/jpeg',
              byteSize: Math.max(1, blob.size),
              sha256: '0'.repeat(64),
            }, { headers: { 'Idempotency-Key': `upload-init:${item.id}` } });
            if (invalidatedRef.current) throw new Error('Session invalidated');
            const stored = await uploadMobileUploadContent(initiated.id, blob);
            attachmentId = stored.id;
          }
          const entityType = entityTypeForQueueItem(item) as 'transaction' | 'task' | 'vital' | 'medicationDose' | 'event';
          const payload = entityType === 'transaction'
            ? {
                clientId: item.id,
                amount: item.amount ?? 0,
                currency: item.currency ?? 'AUD',
                occurredAt: item.occurredAt,
                merchant: item.title,
                notes: item.detail,
              }
            : entityType === 'task'
              ? {
                  clientId: item.id,
                  title: item.title,
                  priority: 'medium' as const,
                  notes: item.detail,
                }
              : entityType === 'vital'
                ? {
                    clientId: item.id,
                    type: item.vitalType ?? item.title,
                    value: item.vitalValue ?? 0,
                    unit: item.vitalUnit ?? 'unknown',
                    measuredAt: item.occurredAt,
                    notes: item.detail,
                  }
                : entityType === 'medicationDose'
                  ? {
                      clientId: item.id,
                      medicationId: item.medicationId ?? '',
                      scheduleId: item.scheduleId,
                      takenAt: item.occurredAt,
                      status: item.medicationStatus ?? 'taken',
                      dose: item.dose,
                      reason: item.detail,
                    }
                  : {
                      clientId: item.id,
                      title: item.title,
                      startsAt: item.occurredAt,
                      allDay: false,
                      notes: item.detail,
                    };
          return {
            changeId: item.id, entityId: item.id, operation: 'upsert' as const, baseVersion: item.serverVersion ?? 0, changedAt: item.occurredAt,
            entityType,
            payload: { ...payload, attachmentId },
          };
        }));
        const response = await pushMobileSync({ changes }, {
          headers: {
            'Idempotency-Key': `sync-batch-${shortBatchHash(candidates.map((item) => `${item.idempotencyKey}:${item.retryCount ?? 0}`).sort().join(':'))}`,
          },
        });
        const outcomes = new Map(response.results.map((result) => [result.changeId, result]));
        rememberSyncHistory(candidates.flatMap((item) => {
          const result = outcomes.get(item.id);
          if (!result) return [];
          const status: SyncHistoryStatus = result.status === 'conflict'
            ? 'conflicted'
            : result.status === 'rejected' ? 'rejected' : 'applied';
          return [{
            changeId: item.id,
            entityType: entityTypeForQueueItem(item),
            entityId: item.id,
            status,
            changedAt: item.occurredAt,
            ...(result.version === undefined ? {} : { version: result.version }),
          }];
        }));
        setQueue((current) => {
          const next = current.filter((item) => { const r = outcomes.get(item.id); return !(r?.status === 'applied' || r?.status === 'duplicate'); }).map((item) => {
            const r = outcomes.get(item.id);
            return r?.status === 'conflict' ? {
              ...item,
              state: 'conflict' as const,
              serverVersion: r.conflict?.conflict?.serverVersion ?? item.serverVersion,
              error: 'Server version conflict. Retry to keep this local copy after reviewing the server version.',
            } : r?.status === 'rejected' ? { ...item, state: 'error' as const, error: r.error?.error?.message ?? 'Server rejected this record.', errorCode: r.error?.error?.code } : item;
          });
          void secureSet(QUEUE_KEY, JSON.stringify(next)); return next;
        });
      }
      const serverHistory = await getMobileSyncHistory();
      rememberSyncHistory(serverHistory.entries.map((entry: MobileSyncHistoryEntry) => ({
        changeId: entry.changeId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        status: entry.status,
        version: entry.version,
        changedAt: entry.changedAt,
      })));
      const cursor = await AsyncStorage.getItem(CURSOR_KEY);
      const pulled = await pullMobileSync({ cursor: cursor ?? undefined });
      const nextRemote = [...remoteChanges, ...pulled.changes].slice(-200) as RemoteChange[];
      setRemoteChanges(nextRemote);
       await AsyncStorage.setItem(REMOTE_CHANGES_KEY, JSON.stringify(nextRemote));
      await AsyncStorage.setItem(CURSOR_KEY, pulled.cursor);
      setSyncStatus('idle');
    } catch (error) {
      if (invalidatedRef.current) return;
      const message = error instanceof Error ? error.message : 'Sync failed. Will retry when connected.';
      setQueue((current) => { const next = current.map((item) => item.state === 'syncing' ? { ...item, state: 'error' as const, error: message } : item); void secureSet(QUEUE_KEY, JSON.stringify(next)); return next; });
      setSyncStatus('offline');
    } finally {
      syncInFlight.current = false;
      setSyncHistoryLoading(false);
    }
  }, [queue, rememberSyncHistory, session, remoteChanges]);
  const restoreCapture = useCallback(async (entityId: string, expectedVersion: number) => {
    if (invalidatedRef.current) return;
    await restoreMobileCapture(
      { entityId, expectedVersion },
      { headers: { 'Idempotency-Key': `restore:${entityId}:${expectedVersion}` } },
    );
    await syncNow();
  }, [syncNow]);
  useEffect(() => {
    if (session) void syncNow();
  }, [session]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [syncNow]);
  useEffect(() => {
    if (!session || !queue.some((item) => item.state === 'pending')) return;
    const timer = setTimeout(() => void syncNow(), 500);
    return () => clearTimeout(timer);
  }, [queue, session, syncNow]);

  const refreshMedicationReminders = useCallback(async () => {
    if (!session || invalidatedRef.current) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const settings = await getMobilePushReminders();
    const reconciledSettings = reconcileReminderTimezone(settings, timezone);
    if (reconciledSettings) await updateMobilePushReminders(reconciledSettings);
    const current = await getMobileMedicationReminders();
    setMedicationReminders(current);
    if (email) await secureSet(MEDICATION_OPTIONS_KEY, JSON.stringify({ email, options: current }));
    if (Platform.OS === 'web') return;
    await withMedicationNotificationScheduleLock(async () => {
      await clearMedicationNotifications();
      if (!current.enabled) return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(MEDICATION_NOTIFICATION_CHANNEL, {
          name: 'Medication reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: null,
        });
      }
      const schedules = dedupeMedicationReminderSchedules(
        current.reminders
          .filter((item) => item.enabled)
          .flatMap((reminder) => reminder.times
            .filter((time) => !isMedicationTimeInQuietHours(time, current.quietHoursStart, current.quietHoursEnd))
            .map((time) => ({ reminder, scheduleId: reminder.scheduleId, time }))),
      );
      for (const { reminder, time } of schedules) {
        const { hour, minute } = medicationDailyTrigger(time);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Medication reminder',
            body: reminder.revealName
              ? `${reminder.medicationLabel} · ${reminder.doseAmount}`
              : medicationNotificationBody,
            ...(Platform.OS === 'android' ? { channelId: MEDICATION_NOTIFICATION_CHANNEL } : {}),
            data: {
              type: 'medication-reminder',
              scheduleId: reminder.scheduleId,
              medicationId: reminder.medicationId,
              time,
              route: `/medication/${reminder.scheduleId}?time=${encodeURIComponent(time)}`,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
          },
        });
      }
    });
  }, [email, session]);

  const enableReminders = useCallback(async () => {
    if (Platform.OS === 'web' || invalidatedRef.current) return 'denied';
    const status = await Notifications.requestPermissionsAsync();
    if (status.granted) {
      try {
        const nativeToken = await Notifications.getDevicePushTokenAsync();
        const provider = Platform.OS === 'ios' ? 'apns' : 'fcm';
        await registerMobilePushDevice({ provider, token: String(nativeToken.data), environment: __DEV__ ? 'sandbox' : 'production' });
      } catch {
        // Local notifications remain available when a native push token is unavailable.
        if (invalidatedRef.current) return 'denied';
      }
      if (invalidatedRef.current) return 'denied';
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const settings = await getMobilePushReminders();
      await updateMobilePushReminders({
        medications: true,
        tasks: settings.tasks,
        events: settings.events,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd,
        timezone,
      });
      await refreshMedicationReminders();
    }
    return status.granted ? 'granted' : 'denied';
  }, [refreshMedicationReminders]);

  const setMedicationReminder = useCallback(async (scheduleId: string, enabled: boolean, revealName: boolean) => {
    if (invalidatedRef.current) return;
    await updateMobileMedicationReminder(scheduleId, { enabled, revealName });
    await refreshMedicationReminders();
  }, [refreshMedicationReminders]);

  const setMedicationQuietHours = useCallback(async (
    quietHoursStart: string | null,
    quietHoursEnd: string | null,
  ) => {
    if (invalidatedRef.current) return;
    const settings = await getMobilePushReminders();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    await updateMobilePushReminders({
      medications: settings.medications,
      tasks: settings.tasks,
      events: settings.events,
      quietHoursStart,
      quietHoursEnd,
      timezone,
    });
    await refreshMedicationReminders();
  }, [refreshMedicationReminders]);

  useEffect(() => {
    return subscribeMedicationReminderForegroundRefresh(
      AppState,
      session,
      refreshMedicationReminders,
    );
  }, [session, refreshMedicationReminders]);

  useEffect(() => {
    if (session) void refreshMedicationReminders().catch(() => undefined);
  }, [session, refreshMedicationReminders]);

  const value = useMemo(() => ({
    ready, session, email, sessionNotice, biometricAvailable, biometricEnabled, queue, remoteChanges, syncHistory, syncHistoryLoading, syncStatus, login, unlock, logout,
    setBiometric, enqueue, retry, remove, syncNow, restoreCapture, enableReminders, medicationReminders, refreshMedicationReminders, setMedicationReminder, setMedicationQuietHours,
  }), [ready, session, email, sessionNotice, biometricAvailable, biometricEnabled, queue, remoteChanges, syncHistory, syncHistoryLoading, syncStatus, login, unlock, logout, setBiometric, enqueue, retry, remove, syncNow, restoreCapture, enableReminders, medicationReminders, refreshMedicationReminders, setMedicationReminder, setMedicationQuietHours]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
