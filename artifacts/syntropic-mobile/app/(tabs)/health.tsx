import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  deleteAppleHealthImportedCopies,
  getAppleHealthAnchor,
  importAppleHealthBatch,
  updateAppleHealthControls,
  updateAppleHealthImportedCopyControls,
  useListMobileAnomalies,
  useReviewMobileAnomaly,
} from '@workspace/api-client-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Button, Card, Field, Pill, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import {
  getHealthAdapter,
  type HealthAuthorization,
  type HealthType,
} from '@/lib/health';
import {
  healthKitSmokeTypes,
  importHealthKitWithRecovery,
  runHealthKitSmokeTest,
  type HealthKitSmokeResult,
} from '@/lib/health-smoke';

const STATE_KEY = 'syntropic.apple-health-state.v1';
const stateGet = () => Platform.OS === 'web'
  ? AsyncStorage.getItem(STATE_KEY)
  : SecureStore.getItemAsync(STATE_KEY);
const stateSet = (value: string) => Platform.OS === 'web'
  ? AsyncStorage.setItem(STATE_KEY, value)
  : SecureStore.setItemAsync(STATE_KEY, value);
const healthTypes: { type: HealthType; label: string; detail: string }[] = [
  { type: 'cardiovascular', label: 'Cardiovascular', detail: 'Heart rate and rhythm' },
  { type: 'blood_pressure', label: 'Blood pressure', detail: 'Systolic and diastolic' },
  { type: 'sleep', label: 'Sleep', detail: 'Stages and duration' },
  { type: 'activity', label: 'Activity', detail: 'Steps and workouts' },
  { type: 'body_measurements', label: 'Body measurements', detail: 'Weight and composition' },
  { type: 'temperature', label: 'Temperature', detail: 'Body temperature' },
  { type: 'oxygen', label: 'Oxygen', detail: 'Blood oxygen saturation' },
  { type: 'respiratory', label: 'Respiratory', detail: 'Respiratory rate' },
];

type HealthState = {
  selected: HealthType[];
  authorizations: Partial<Record<HealthType, HealthAuthorization>>;
  anchors: Partial<Record<HealthType, string>>;
  paused: Partial<Record<HealthType, boolean>>;
  annotations: Partial<Record<HealthType, string>>;
  excluded: Partial<Record<HealthType, boolean>>;
  importedCounts: Partial<Record<HealthType, number>>;
  lastSuccessfulSyncAt: Partial<Record<HealthType, string>>;
};

const initialState: HealthState = {
  selected: [],
  authorizations: {},
  anchors: {},
  paused: {},
  annotations: {},
  excluded: {},
  importedCounts: {},
  lastSuccessfulSyncAt: {},
};

function formatLastSuccessfulSync(timestamp?: string): string {
  if (!timestamp) return 'Not synced yet';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? 'Not synced yet'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function evidenceText(evidence: Record<string, unknown>): string {
  const sourceEvidence = (evidence.source ?? {}) as Record<string, unknown>;
  const trend = (evidence.surroundingTrend ?? {}) as Record<string, unknown>;
  const source = typeof sourceEvidence.sourceBundleId === 'string' ? sourceEvidence.sourceBundleId : 'Apple Health';
  const mean = typeof trend.mean === 'number' ? trend.mean.toFixed(1) : null;
  const observed = typeof evidence.observedValue === 'number' ? evidence.observedValue.toFixed(1) : null;
  const standardDeviation = typeof trend.standardDeviation === 'number' ? trend.standardDeviation : null;
  const deviation = mean && observed && standardDeviation
    ? (Math.abs(Number(observed) - Number(mean)) / standardDeviation).toFixed(1)
    : null;
  return mean && deviation
    ? `Source: ${source}. Observed ${observed}; prior trend mean ${mean}; ${deviation} standard deviations away across ${trend.count ?? 'the available'} records.`
    : `Source: ${source}. Review the source record and surrounding trend.`;
}

export default function HealthScreen() {
  const c = useColors();
  const adapter = useMemo(getHealthAdapter, []);
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string }>({ available: false });
  const [healthState, setHealthState] = useState<HealthState>(initialState);
  const [controlType, setControlType] = useState<HealthType>('cardiovascular');
  const [busy, setBusy] = useState(false);
  const [smokeResults, setSmokeResults] = useState<HealthKitSmokeResult[]>([]);
  const [message, setMessage] = useState('');
  const anomalies = useListMobileAnomalies();
  const review = useReviewMobileAnomaly();

  const saveState = (next: HealthState) => {
    setHealthState(next);
    void stateSet(JSON.stringify(next));
  };

  useEffect(() => {
    void Promise.all([adapter.availability(), stateGet()])
      .then(([nextAvailability, stored]) => {
        setAvailability(nextAvailability);
        if (stored) {
          const restored = JSON.parse(stored) as HealthState;
          setHealthState({ ...initialState, ...restored });
          if (restored.selected[0]) setControlType(restored.selected[0]);
        }
      })
      .catch(() => setMessage('Health controls could not be restored.'));
  }, [adapter]);

  const toggleSelected = (sampleType: HealthType) => {
    const selected = healthState.selected.includes(sampleType)
      ? healthState.selected.filter((value) => value !== sampleType)
      : [...healthState.selected, sampleType];
    saveState({ ...healthState, selected });
    setControlType(sampleType);
  };

  const connect = async () => {
    if (!availability.available || healthState.selected.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const authorization = await adapter.request(healthState.selected);
      const allowed = healthState.selected.filter((sampleType) => authorization[sampleType] === 'authorized');
      await updateAppleHealthControls({
        metrics: healthState.selected.map((sampleType) => ({
          sampleType,
          enabled: authorization[sampleType] === 'authorized',
        })),
      });
      const anchors = { ...healthState.anchors };
      const importedCounts = { ...healthState.importedCounts };
      const lastSuccessfulSyncAt = { ...healthState.lastSuccessfulSyncAt };
      const failures: Array<{ sampleType: HealthType; message: string }> = [];
      for (const sampleType of allowed) {
        if (healthState.paused[sampleType]) continue;
        let previousAnchor = anchors[sampleType];
        if (!previousAnchor) {
          try {
            previousAnchor = (await getAppleHealthAnchor(sampleType)).anchor;
          } catch {
            previousAnchor = undefined;
          }
        }
        try {
          const result = await importHealthKitWithRecovery(
            adapter,
            sampleType,
            previousAnchor,
            async ({ previousAnchor: committedPreviousAnchor, result: recovered }) => {
              await importAppleHealthBatch({
                sampleType,
                previousAnchor: committedPreviousAnchor,
                anchor: recovered.anchor,
                samples: recovered.samples.map((sample) => ({
                  healthKitUuid: sample.id,
                  sampleType,
                  value: sample.value,
                  unit: sample.unit,
                  startAt: sample.startDate,
                  endAt: sample.endDate,
                  sourceBundleId: sample.source,
                  sourceRevision: sample.sourceRevision,
                  metadata: {},
                })),
                deletions: recovered.deletions.map((deletion) => ({ ...deletion, sampleType })),
              }, {
                headers: { 'Idempotency-Key': `health-import:${sampleType}:${recovered.anchor}`.slice(0, 200) },
              });
            },
          );
          anchors[sampleType] = result.anchor;
          importedCounts[sampleType] = (importedCounts[sampleType] ?? 0) + result.samples.length;
          lastSuccessfulSyncAt[sampleType] = new Date().toISOString();
        } catch (error) {
          failures.push({
            sampleType,
            message: error instanceof Error ? error.message : 'HealthKit import failed',
          });
        }
      }
      saveState({
        ...healthState,
        authorizations: authorization,
        anchors,
        importedCounts,
        lastSuccessfulSyncAt,
      });
      const denied = healthState.selected.length - allowed.length;
      setMessage(failures.length
        ? `${failures.map(({ sampleType }) => sampleType.replaceAll('_', ' ')).join(', ')} could not be imported after retry; the previous server anchor was kept.`
        : denied
          ? `Imported authorized types. ${denied} denied type${denied === 1 ? '' : 's'} stayed disconnected.`
          : 'Authorized health types are up to date.');
      await anomalies.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Health import could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const runDevelopmentSmokeTest = async () => {
    if (Platform.OS !== 'ios') return;
    setBusy(true);
    setMessage('Running native HealthKit smoke test…');
    try {
      const results = await runHealthKitSmokeTest(adapter, healthKitSmokeTypes);
      setSmokeResults(results);
      setMessage('Native HealthKit permission and anchored-read results are ready below.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Native HealthKit smoke test failed.');
    } finally {
      setBusy(false);
    }
  };

  const persistControls = async (patch: Partial<{
    annotation: string;
    excludeFromTrends: boolean;
    paused: boolean;
    disconnected: boolean;
  }>) => {
    const control = {
      sampleType: controlType,
      annotation: healthState.annotations[controlType] ?? null,
      excludeFromTrends: healthState.excluded[controlType] ?? false,
      paused: healthState.paused[controlType] ?? false,
      disconnected: false,
      ...patch,
    };
    await updateAppleHealthImportedCopyControls({ controls: [control] });
    const selected = control.disconnected
      ? healthState.selected.filter((value) => value !== controlType)
      : healthState.selected;
    const next: HealthState = {
      ...healthState,
      selected,
      paused: { ...healthState.paused, [controlType]: control.paused },
      annotations: { ...healthState.annotations, [controlType]: control.annotation ?? '' },
      excluded: { ...healthState.excluded, [controlType]: control.excludeFromTrends },
    };
    if (control.disconnected) {
      await updateAppleHealthControls({ metrics: [{ sampleType: controlType, enabled: false }] });
      delete next.anchors[controlType];
      next.authorizations[controlType] = 'denied';
    }
    saveState(next);
  };

  const deleteCopies = () => Alert.alert(
    'Delete imported copies?',
    `This removes Ishiki's ${controlType.replaceAll('_', ' ')} copies only. Apple Health is never changed.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete copies',
        style: 'destructive',
        onPress: () => void deleteAppleHealthImportedCopies({
          sampleType: controlType,
          reason: 'Deleted by the user from mobile controls',
        }).then(() => {
          saveState({
            ...healthState,
            importedCounts: { ...healthState.importedCounts, [controlType]: 0 },
            paused: { ...healthState.paused, [controlType]: true },
          });
          setMessage('Imported copies deleted. Apple Health was not changed.');
        }).catch((error: unknown) => {
          setMessage(error instanceof Error ? error.message : 'Imported copies could not be deleted.');
        }),
      },
    ],
  );

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.page, {
        paddingTop: Platform.OS === 'web' ? 87 : 20,
        paddingBottom: Platform.OS === 'web' ? 118 : 110,
      }]}
    >
      <View>
        <Text style={[type.eyebrow, { color: c.primary }]}>Read-only connection</Text>
        <Text style={[type.title, { color: c.foreground }]}>Health context</Text>
        <Text style={[type.body, { color: c.mutedForeground }]}>
          Choose each type explicitly. Ishiki only writes a temporary synthetic sample during the development smoke test.
        </Text>
      </View>
      {!availability.available ? (
        <Card style={{ backgroundColor: c.accent }}>
          <View style={styles.row}>
            <Feather name="info" color={c.accentForeground} size={21} />
            <Pill text="Unavailable here" />
          </View>
          <Text style={[type.body, { color: c.accentForeground }]}>{availability.reason}</Text>
        </Card>
      ) : null}
      <Card>
        <Text style={[type.section, { color: c.foreground }]}>Data permissions</Text>
        {healthTypes.map((item) => {
          const enabled = healthState.selected.includes(item.type);
          const status = healthState.authorizations[item.type];
          return (
            <Pressable
              key={item.type}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: enabled }}
              onPress={() => toggleSelected(item.type)}
              style={[styles.permission, { borderBottomColor: c.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: c.foreground }]}>{item.label}</Text>
                <Text style={[type.meta, { color: c.mutedForeground }]}>
                  {status ? `${item.detail} · ${status}` : item.detail}
                </Text>
              </View>
              <Feather name={enabled ? 'check-square' : 'square'} size={22} color={enabled ? c.primary : c.mutedForeground} />
            </Pressable>
          );
        })}
        <Button
          label={busy ? 'Importing…' : availability.available ? 'Request selected access' : 'Requires development build'}
          icon="shield"
          disabled={busy || !availability.available || healthState.selected.length === 0}
          onPress={() => void connect()}
        />
        {message ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: c.mutedForeground }]}>{message}</Text> : null}
      </Card>
      {__DEV__ && Platform.OS === 'ios' ? (
        <Card>
          <Text style={[type.section, { color: c.foreground }]}>Development HealthKit smoke test</Text>
          <Text style={[type.body, { color: c.mutedForeground }]}>
            Checks each supported type separately. For authorized Activity, it inserts one temporary synthetic sample between anchored reads and expects exactly one new sample, without showing values or identifiers.
          </Text>
          <Button
            label={busy ? 'Testing…' : 'Run native smoke test'}
            icon="activity"
            disabled={busy}
            onPress={() => void runDevelopmentSmokeTest()}
          />
          {smokeResults.map((result) => (
            <View key={result.type} style={styles.smokeRow}>
              <Text style={[type.meta, { color: c.foreground, flex: 1 }]}>
                {result.type}: {result.authorization}
              </Text>
              <Text style={[type.meta, {
                color: result.error
                  || (result.authorization === 'authorized' && (!result.anchoredRead || (result.smokeSampleInserted && !result.sampleDeltaPassed)))
                  ? c.destructive
                  : c.mutedForeground,
              }]}>
                {result.error ?? (result.authorization === 'authorized'
                  ? (result.anchoredRead
                    ? (result.smokeSampleInserted
                      ? (result.sampleDeltaPassed
                        ? `sample delta passed (${result.observedSampleDelta}/${result.expectedSampleDelta})`
                        : `sample delta failed (${result.observedSampleDelta}/${result.expectedSampleDelta})`)
                      : (result.recovered ? 'anchored read recovered after retry' : 'anchored read passed'))
                    : 'anchor missing')
                  : 'read skipped')}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <Text style={[type.section, { color: c.foreground }]}>Imported-copy controls</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {healthTypes.map((item) => (
            <Pressable
              key={item.type}
              onPress={() => setControlType(item.type)}
              style={[styles.chip, {
                backgroundColor: controlType === item.type ? c.primary : c.muted,
                borderRadius: c.radius,
              }]}
            >
              <Text style={[type.meta, { color: controlType === item.type ? c.primaryForeground : c.foreground }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={[type.body, { color: c.mutedForeground }]}>
          {healthState.importedCounts[controlType] ?? 0} copied records. Originals remain in Apple Health.
        </Text>
        <Text style={[type.meta, { color: c.mutedForeground }]}>
          Last successful sync: {formatLastSuccessfulSync(healthState.lastSuccessfulSyncAt[controlType])}
        </Text>
        <View style={[styles.anchor, { backgroundColor: c.muted, borderRadius: c.radius }]}>
          <Feather name="bookmark" size={17} color={c.primary} />
          <Text numberOfLines={1} style={[type.meta, { color: c.foreground, flex: 1 }]}>
            Anchor: {healthState.anchors[controlType] ?? 'Not established'}
          </Text>
        </View>
        <Field
          label="Private annotation"
          value={healthState.annotations[controlType] ?? ''}
          onChangeText={(annotation) => saveState({
            ...healthState,
            annotations: { ...healthState.annotations, [controlType]: annotation },
          })}
          onEndEditing={() => void persistControls({ annotation: healthState.annotations[controlType] ?? '' })}
          placeholder="Add context to future reviews"
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: c.foreground }]}>Exclude from trends</Text>
            <Text style={[type.meta, { color: c.mutedForeground }]}>Keep records, omit from analysis</Text>
          </View>
          <Switch
            value={healthState.excluded[controlType] ?? false}
            onValueChange={(value) => void persistControls({ excludeFromTrends: value }).catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : 'Control could not be saved.');
            })}
            trackColor={{ true: c.primary }}
          />
        </View>
        <Button
          secondary
          label={healthState.paused[controlType] ? 'Resume imports' : 'Pause imports'}
          icon={healthState.paused[controlType] ? 'play' : 'pause'}
          onPress={() => void persistControls({ paused: !(healthState.paused[controlType] ?? false) }).catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : 'Control could not be saved.');
          })}
        />
        <Button secondary label="Disconnect this type" icon="link-2" onPress={() => void persistControls({ disconnected: true, paused: true })} />
        <Button secondary label="Delete imported copies" icon="trash-2" onPress={deleteCopies} />
      </Card>
      <Card>
        <Text style={[type.section, { color: c.foreground }]}>Review signals</Text>
        {anomalies.isLoading ? (
          <Text style={[type.meta, { color: c.mutedForeground }]}>Loading your server-backed reviews…</Text>
        ) : anomalies.data?.length ? anomalies.data.map((item) => (
          <View key={item.id} style={styles.review}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: c.foreground }]}>{item.sampleType.replaceAll('_', ' ')}</Text>
              <Pill text={item.status} />
            </View>
            <Text style={[type.body, { color: c.foreground }]}>{item.summary}</Text>
            <Text style={[type.meta, { color: c.mutedForeground }]}>
              {evidenceText(item.evidence as Record<string, unknown>)}
            </Text>
            <Text style={[type.meta, { color: c.mutedForeground }]}>{item.disclaimer}</Text>
            {item.status === 'pending' ? (
              <View style={styles.reviewActions}>
                <Button secondary label="Acknowledge" icon="check" onPress={() => review.mutate({
                  anomalyId: item.id,
                  data: { decision: 'acknowledged', note: healthState.annotations[item.sampleType as HealthType] || undefined },
                }, { onSuccess: () => void anomalies.refetch() })} />
                <Button secondary label="Dismiss" icon="x" onPress={() => review.mutate({
                  anomalyId: item.id,
                  data: { decision: 'dismissed', note: healthState.annotations[item.sampleType as HealthType] || undefined },
                }, { onSuccess: () => void anomalies.refetch() })} />
              </View>
            ) : null}
          </View>
        )) : <Text style={[type.meta, { color: c.mutedForeground }]}>No observations need review.</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  permission: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  anchor: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  smokeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9 },
  review: { gap: 7, paddingVertical: 10 },
  reviewActions: { gap: 8 },
});
