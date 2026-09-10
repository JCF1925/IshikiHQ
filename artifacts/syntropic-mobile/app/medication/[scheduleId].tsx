import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { medicationDoseRequestIdentity, runMedicationDoseOnce } from '@/lib/reminder-action-guards';
import { useApp } from '@/providers/AppProvider';
import { recordMobileMedicationDose } from '@workspace/api-client-react';

const activeDoseKeys = new Set<string>();

export default function MedicationDoseScreen() {
  const c = useColors();
  const app = useApp();
  const { scheduleId, time } = useLocalSearchParams<{ scheduleId: string; time?: string }>();
  const [busy, setBusy] = useState(false);
  const busyDoseKey = useRef<string | null>(null);
  const reminder = useMemo(
    () => app.medicationReminders?.reminders.find((item) => item.scheduleId === scheduleId),
    [app.medicationReminders, scheduleId],
  );
  useEffect(() => {
    if (!reminder && app.session) void app.refreshMedicationReminders().catch(() => undefined);
  }, [app.session, app.refreshMedicationReminders, reminder]);
  const record = async (status: 'taken' | 'skipped') => {
    if (!reminder) return;
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: deviceTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const doseKey = `${reminder.scheduleId}:${date}:${time ?? 'manual'}`;
    if (activeDoseKeys.has(doseKey) || busyDoseKey.current === doseKey) return;
    busyDoseKey.current = doseKey;
    setBusy(true);
    try {
      const identity = medicationDoseRequestIdentity(doseKey);
      const submitted = await runMedicationDoseOnce(activeDoseKeys, doseKey, async () => {
        await recordMobileMedicationDose({
          clientId: identity.clientId,
          medicationId: reminder.medicationId,
          scheduleId: reminder.scheduleId,
          takenAt: new Date().toISOString(),
          status,
          dose: status === 'taken' ? reminder.doseAmount : undefined,
        }, { headers: { 'Idempotency-Key': identity.idempotencyKey } });
      });
      if (submitted) {
        Alert.alert(status === 'taken' ? 'Dose recorded' : 'Dose skipped', 'This reminder will not create another dose if the request is retried.');
        router.back();
      }
    } catch (error) {
      Alert.alert('Could not record dose', error instanceof Error ? error.message : 'Try again when you are online.');
    } finally {
      busyDoseKey.current = null;
      setBusy(false);
    }
  };
  return (
    <View style={[styles.page, { backgroundColor: c.background, paddingTop: Platform.OS === 'web' ? 80 : 24 }]}>
      <Text style={[type.eyebrow, { color: c.primary }]}>Medication reminder</Text>
      <Text style={[type.title, { color: c.foreground }]}>{reminder?.medicationLabel ?? 'Dose action'}</Text>
      {reminder ? <Card>
        <Text style={[type.body, { color: c.mutedForeground }]}>Scheduled dose: {reminder.doseAmount}</Text>
        <View style={styles.actions}>
          <Button label={busy ? 'Saving…' : 'Mark taken'} icon="check" onPress={() => void record('taken')} disabled={busy} />
          <Button secondary label="Skip dose" icon="x" onPress={() => void record('skipped')} disabled={busy} />
        </View>
      </Card> : <Card><Text style={[type.body, { color: c.mutedForeground }]}>This schedule is no longer active. No dose was recorded.</Text></Card>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, gap: 18 },
  actions: { gap: 10, marginTop: 18 },
});