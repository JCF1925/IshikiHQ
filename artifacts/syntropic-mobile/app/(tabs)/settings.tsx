import { Feather } from '@expo/vector-icons';
import {
  useListMobileStockLevels,
  useReconcileMobileStockLevel,
  type MobileStockLevel,
} from '@workspace/api-client-react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Field, Pill, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/providers/AppProvider';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const syncHistoryTypeLabels: Record<string, string> = {
  transaction: 'Transaction',
  task: 'Task',
  vital: 'Health reading',
  medicationDose: 'Medication dose',
  event: 'Event',
};
const queueStateLabel = (state: string, errorCode?: string) => {
  if (errorCode === 'medication_not_available') return 'medication unavailable';
  if (errorCode === 'insufficient_stock') return 'stock unavailable';
  return state;
};

function QuietHoursEditor({
  initialStart,
  initialEnd,
  timezone,
  onSave,
}: {
  initialStart: string | null;
  initialEnd: string | null;
  timezone: string;
  onSave(start: string | null, end: string | null): Promise<void>;
}) {
  const c = useColors();
  const [start, setStart] = useState(initialStart ?? '');
  const [end, setEnd] = useState(initialEnd ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const save = async (nextStart: string | null, nextEnd: string | null) => {
    if ((nextStart === null) !== (nextEnd === null)) {
      Alert.alert('Complete quiet hours', 'Enter both a start and end time, or clear quiet hours.');
      return;
    }
    if (nextStart !== null && (!timePattern.test(nextStart) || !timePattern.test(nextEnd ?? ''))) {
      Alert.alert('Check the times', 'Use 24-hour time in HH:MM format, such as 22:00 and 07:00.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await onSave(nextStart, nextEnd);
      setStart(nextStart ?? '');
      setEnd(nextEnd ?? '');
      setMessage(nextStart === null ? 'Quiet hours cleared.' : 'Quiet hours saved.');
    } catch (error) {
      Alert.alert('Unable to save quiet hours', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.quietHours, { borderTopColor: c.border }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.foreground }]}>Quiet hours</Text>
          <Text style={[type.meta, { color: c.mutedForeground }]}>Device timezone: {timezone}</Text>
        </View>
        <Feather name="moon" size={20} color={c.primary} />
      </View>
      <View style={styles.timeFields}>
        <View style={{ flex: 1 }}>
          <Field label="Start" value={start} onChangeText={setStart} placeholder="22:00" keyboardType="numbers-and-punctuation" maxLength={5} testID="quiet-hours-start" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="End" value={end} onChangeText={setEnd} placeholder="07:00" keyboardType="numbers-and-punctuation" maxLength={5} testID="quiet-hours-end" />
        </View>
      </View>
      <Text style={[type.meta, { color: c.mutedForeground }]}>Medication times in this window are not scheduled. Task and event reminders stay unchanged.</Text>
      <View style={styles.quietHoursActions}>
        <View style={{ flex: 1 }}><Button secondary label="Clear" icon="x" disabled={saving} testID="quiet-hours-clear" onPress={() => void save(null, null)} /></View>
        <View style={{ flex: 1 }}><Button label={saving ? 'Saving…' : 'Save'} icon="check" disabled={saving} testID="quiet-hours-save" onPress={() => void save(start || null, end || null)} /></View>
      </View>
      {message ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: c.mutedForeground }]}>{message}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const c = useColors(); const app = useApp();
  const stock = useListMobileStockLevels();
  const reconcileStock = useReconcileMobileStockLevel();
  const [stockMessage, setStockMessage] = useState('');
  const reminders = async () => {
    const permission = await app.enableReminders();
    if (permission === 'denied') {
      Alert.alert('Reminders are off', Platform.OS === 'web' ? 'Local push reminders are unavailable in this web preview.' : 'Notification access was not granted. You can enable it in device settings.', Platform.OS === 'web' ? undefined : [{ text: 'Not now', style: 'cancel' }, { text: 'Settings', onPress: () => void Linking.openSettings() }]);
      return;
    }
    if (!app.medicationReminders?.reminders.some((item) => item.enabled)) {
      Alert.alert('Choose a schedule', 'Enable at least one medication schedule below to receive reminders.');
    } else {
      Alert.alert('Reminders enabled', 'Enabled schedules will follow their saved times and your device timezone.');
    }
  };
  const reviewStock = (level: MobileStockLevel) => {
    Alert.alert(
      'Correct historical stock?',
      `${level.medicationLabel} shows ${level.currentQuantity} in cached stock, but its signed history totals ${level.ledgerQuantity}. The correction will set visible stock to ${level.ledgerQuantity} and append an adjustment record without rewriting history.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Correct stock',
          onPress: () => void reconcileStock.mutateAsync({
            data: {
              action: 'reconcile',
              id: level.id,
              expectedCurrentQuantity: level.currentQuantity,
              expectedLedgerQuantity: level.ledgerQuantity,
            },
          }).then(async (result) => {
            await stock.refetch();
            setStockMessage(`${level.medicationLabel} corrected to ${result.stock.currentQuantity}.`);
          }).catch(async () => {
            await stock.refetch();
            setStockMessage('Stock changed while it was being reviewed. The latest diagnostic is shown below.');
          }),
        },
      ],
    );
  };
  return <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.page, { paddingTop: Platform.OS === 'web' ? 87 : 20, paddingBottom: Platform.OS === 'web' ? 118 : 110 }]}>
    <View><Text style={[type.eyebrow, { color: c.primary }]}>Privacy & sync</Text><Text style={[type.title, { color: c.foreground }]}>Controls</Text></View>
    <Card><View style={styles.row}><View style={[styles.icon, { backgroundColor: c.accent }]}><Feather name="user" size={21} color={c.accentForeground} /></View><View style={{ flex: 1 }}><Text style={[type.section, { color: c.foreground }]}>Secure vault</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{app.email}</Text></View></View><View style={styles.row}><View style={{ flex: 1 }}><Text style={[styles.label, { color: c.foreground }]}>Biometric unlock</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{app.biometricAvailable ? 'Face or fingerprint verification' : 'Not available or not enrolled'}</Text></View><Switch disabled={!app.biometricAvailable} value={app.biometricEnabled} onValueChange={(value) => void app.setBiometric(value).catch((e: Error) => Alert.alert('Unable to enable', e.message))} trackColor={{ true: c.primary }} /></View></Card>
    <Card>
      <Text style={[type.section, { color: c.foreground }]}>Medication reminders</Text>
      <Text style={[type.body, { color: c.mutedForeground }]}>Choose schedules per device. Notifications stay generic on the lock screen unless you explicitly reveal medication names.</Text>
      {app.medicationReminders ? (
        <QuietHoursEditor
          key={`${app.medicationReminders.quietHoursStart}-${app.medicationReminders.quietHoursEnd}-${app.medicationReminders.timezone}`}
          initialStart={app.medicationReminders.quietHoursStart}
          initialEnd={app.medicationReminders.quietHoursEnd}
          timezone={app.medicationReminders.timezone}
          onSave={app.setMedicationQuietHours}
        />
      ) : null}
      <Button label="Enable medication reminders" icon="bell" onPress={reminders} />
      {app.medicationReminders?.reminders.map((reminder) => (
        <View key={reminder.scheduleId} style={[styles.reminder, { borderTopColor: c.border }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.label, { color: c.foreground }]}>{reminder.medicationLabel}</Text>
            <Text style={[type.meta, { color: c.mutedForeground }]}>{reminder.times.join(' · ')} · dose {reminder.doseAmount}</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: reminder.revealName }}
              onPress={() => void app.setMedicationReminder(reminder.scheduleId, reminder.enabled, !reminder.revealName)}
            >
              <Text style={[type.meta, { color: c.primary }]}>
                {reminder.revealName ? 'Name shown on lock screen' : 'Keep name hidden on lock screen'}
              </Text>
            </Pressable>
          </View>
          <Switch
            value={reminder.enabled}
            onValueChange={(enabled) => void app.setMedicationReminder(reminder.scheduleId, enabled, reminder.revealName)}
            trackColor={{ true: c.primary }}
          />
        </View>
      ))}
      {app.medicationReminders && app.medicationReminders.reminders.length === 0 ? (
        <Text style={[type.meta, { color: c.mutedForeground }]}>No active medication schedules are available.</Text>
      ) : null}
    </Card>
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[type.section, { color: c.foreground }]}>Medication stock</Text>
          <Text style={[type.body, { color: c.mutedForeground }]}>Review the cached stock number against the signed medication history.</Text>
        </View>
        <Feather name="package" size={21} color={c.primary} />
      </View>
      {stock.isLoading ? <Text style={[type.meta, { color: c.mutedForeground }]}>Loading stock history…</Text> : null}
      {!stock.isLoading && stock.data?.length === 0 ? <Text style={[type.meta, { color: c.mutedForeground }]}>No medication stock is available.</Text> : null}
      {stock.data?.map((level) => (
        <View key={level.id} style={[styles.stock, { borderTopColor: c.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: c.foreground }]}>{level.medicationLabel}</Text>
              <Text testID={`mobile-stock-visible-${level.id}`} style={[type.meta, { color: c.mutedForeground }]}>
                Visible stock: {level.currentQuantity}
              </Text>
            </View>
            <Pill text={level.hasMismatch ? 'Review' : 'Aligned'} tone={level.hasMismatch ? 'bad' : 'good'} />
          </View>
          {level.hasMismatch ? (
            <View style={[styles.warning, { backgroundColor: c.accent, borderRadius: c.radius }]}>
              <View style={styles.row}>
                <Feather name="alert-triangle" size={18} color={c.accentForeground} />
                <Text style={[styles.label, { color: c.accentForeground, flex: 1 }]}>Historical stock mismatch</Text>
              </View>
              <Text style={[type.meta, { color: c.accentForeground }]}>
                Signed history totals {level.ledgerQuantity}; cached stock says {level.currentQuantity}. Review before relying on this number.
              </Text>
              <Button
                label={reconcileStock.isPending ? 'Correcting…' : 'Review correction'}
                icon="shield"
                disabled={reconcileStock.isPending}
                testID={`mobile-stock-review-${level.id}`}
                onPress={() => reviewStock(level)}
              />
            </View>
          ) : (
            <Text style={[type.meta, { color: c.mutedForeground }]}>
              {level.transactionCount} ledger {level.transactionCount === 1 ? 'entry' : 'entries'} support this stock number.
            </Text>
          )}
        </View>
      ))}
      {stockMessage ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: c.mutedForeground }]}>{stockMessage}</Text> : null}
    </Card>
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[type.section, { color: c.foreground }]}>Sync history</Text>
          <Text style={[type.body, { color: c.mutedForeground }]}>A private record of changes that reached your account. Deleted records show only their type, time, and status.</Text>
        </View>
        <Feather name="clock" size={21} color={c.primary} />
      </View>
      {app.syncStatus === 'offline' ? (
        <Text accessibilityRole="alert" style={[type.meta, { color: c.destructive }]}>Offline. Showing saved history; new outcomes will appear when connected.</Text>
      ) : null}
      {app.syncHistoryLoading && app.syncHistory.length === 0 ? (
        <Text style={[type.meta, { color: c.mutedForeground }]}>Loading sync history…</Text>
      ) : app.syncHistory.length === 0 ? (
        <Text style={[type.meta, { color: c.mutedForeground }]}>No sync outcomes yet.</Text>
      ) : app.syncHistory.map((entry) => (
        <View key={`${entry.changeId}-${entry.status}`} style={[styles.historyEntry, { borderTopColor: c.border }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.label, { color: c.foreground }]}>{syncHistoryTypeLabels[entry.entityType] ?? 'Record'}</Text>
            <Text style={[type.meta, { color: c.mutedForeground }]}>{formatSyncHistoryTime(entry.changedAt)}</Text>
          </View>
          <Pill
            text={entry.status}
            tone={entry.status === 'conflicted' || entry.status === 'rejected' ? 'bad' : entry.status === 'applied' ? 'good' : 'neutral'}
          />
        </View>
      ))}
    </Card>
    <View style={styles.row}><Text style={[type.section, { color: c.foreground }]}>Encrypted offline queue</Text><Pill text={`${app.queue.length} items`} /></View>
    <Button secondary label="Sync now" icon="refresh-cw" onPress={() => void app.syncNow()} />
    {app.queue.length === 0 ? <Card><Text style={[type.body, { color: c.mutedForeground }]}>No captures are waiting to sync.</Text></Card> : app.queue.map((item) => <Card key={item.id}><View style={styles.row}><View style={{ flex: 1 }}><Text style={[styles.label, { color: c.foreground }]}>{item.title}</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{item.idempotencyKey.slice(-10)} · {item.kind}</Text></View><Pill text={queueStateLabel(item.state, item.errorCode)} tone={item.state === 'error' ? 'bad' : 'neutral'} /></View>{item.error ? <Text accessibilityRole="alert" style={[type.meta, { color: c.destructive }]}>{item.error}</Text> : null}<View style={styles.actions}>{(item.state === 'error' || item.state === 'conflict') ? <Button secondary label="Retry saved capture" icon="refresh-cw" onPress={() => void app.retry(item.id)} /> : null}<Button secondary label="Discard capture" icon="trash-2" onPress={() => void app.remove(item.id)} /></View></Card>)}
    <Card><Text style={[type.section, { color: c.foreground }]}>Sync semantics</Text><Text style={[type.meta, { color: c.mutedForeground }]}>Pending items stay encrypted on-device. Conflicts stop for review instead of overwriting server data. Failed items preserve a safe explanation and can be retried without losing the saved capture.</Text></Card>
    <Button secondary label="Lock Ishiki" icon="lock" onPress={() => void app.logout().then(() => router.replace('/login'))} />
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 14 },
  quietHours: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4 },
  timeFields: { flexDirection: 'row', gap: 10 },
  quietHoursActions: { flexDirection: 'row', gap: 10 },
  stock: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 14 },
  historyEntry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  warning: { gap: 9, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  actions: { gap: 8 },
});

const formatSyncHistoryTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
};
