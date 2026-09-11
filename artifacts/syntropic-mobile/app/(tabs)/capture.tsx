import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { buildMedicationCaptureQueueInput, getMedicationChoices, getMedicationSchedules, reconcileMedicationSelection } from '@/lib/medication-capture';
import { CaptureKind, useApp } from '@/providers/AppProvider';
import { useCallback, useEffect, useState } from 'react';

const kinds: { key: CaptureKind; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { key: 'transaction', label: 'Money', icon: 'credit-card' }, { key: 'task', label: 'Task', icon: 'check-square' },
  { key: 'health', label: 'Health', icon: 'activity' }, { key: 'medication', label: 'Dose', icon: 'plus-circle' }, { key: 'event', label: 'Event', icon: 'calendar' },
];
type MedicationChoice = {
  medicationId: string;
  medicationLabel: string;
  medType: 'scheduled' | 'prn' | 'scheduled_prn' | 'adhoc';
  supportsUnscheduled: boolean;
};
export default function CaptureScreen() {
  const c = useColors(); const { enqueue, medicationRefreshState, medicationReminders, refreshMedicationReminders, session } = useApp();
  const [kind, setKind] = useState<CaptureKind>('transaction');
  const [title, setTitle] = useState(''); const [detail, setDetail] = useState(''); const [attachmentUri, setAttachment] = useState<string>();
  const [amount, setAmount] = useState(''); const [vitalType, setVitalType] = useState('weight');
  const [vitalValue, setVitalValue] = useState(''); const [vitalUnit, setVitalUnit] = useState('kg');
  const [medicationId, setMedicationId] = useState(''); const [scheduleId, setScheduleId] = useState('');
  const [medicationMode, setMedicationMode] = useState<'scheduled' | 'unscheduled'>('scheduled');
  const [dose, setDose] = useState(''); const [medicationStatus, setMedicationStatus] = useState<'taken' | 'skipped'>('taken');
  const [message, setMessage] = useState(''); const [cameraBlocked, setCameraBlocked] = useState(false);
  const medicationSchedules = medicationReminders?.reminders ?? [];
  const medicationChoices = medicationReminders as (NonNullable<typeof medicationReminders> & { medications?: MedicationChoice[] }) | null;
  const medications: MedicationChoice[] = medicationChoices?.medications?.length
    ? medicationChoices.medications
    : getMedicationChoices(medicationSchedules).map((item) => ({
      medicationId: item.medicationId,
      medicationLabel: item.medicationLabel,
      medType: 'scheduled' as const,
      supportsUnscheduled: false,
    }));
  const selectedMedication = medications.find((item) => item.medicationId === medicationId);
  const schedules = getMedicationSchedules(medicationSchedules, medicationId);
  const selectedSchedule = schedules.find((item) => item.scheduleId === scheduleId);
  const supportsUnscheduled = selectedMedication?.supportsUnscheduled === true;
  const medicationRefreshInProgress = medicationRefreshState === 'loading';
  const medicationChoicesUnavailable = medicationReminders === null && medicationRefreshState === 'error';

  const retryMedicationRefresh = useCallback(async () => {
    setMessage('');
    try {
      await refreshMedicationReminders();
    } catch {
      setMessage('Medication choices are unavailable offline. Connect and try again.');
    }
  }, [refreshMedicationReminders]);

  useEffect(() => {
    if (kind === 'medication' && session && !medicationReminders && medicationRefreshState === 'idle') {
      void retryMedicationRefresh();
    }
  }, [kind, session, medicationRefreshState, medicationReminders, retryMedicationRefresh]);

  useEffect(() => {
    if (!medicationReminders) return;
    const nextSelection = reconcileMedicationSelection(medicationSchedules, { medicationId, scheduleId });
    if (nextSelection.medicationId !== medicationId) {
      setMedicationId(nextSelection.medicationId);
      setMedicationMode('scheduled');
      setDose('');
    }
    if (nextSelection.scheduleId !== scheduleId) setScheduleId(nextSelection.scheduleId);
  }, [medicationReminders]);

  const chooseMedication = (nextMedicationId: string) => {
    setMedicationId(nextMedicationId);
    setScheduleId('');
    setDose('');
    const nextMedication = medications.find((item) => item.medicationId === nextMedicationId);
    const nextSchedules = getMedicationSchedules(medicationSchedules, nextMedicationId);
    setMedicationMode(nextSchedules.length ? 'scheduled' : nextMedication?.supportsUnscheduled ? 'unscheduled' : 'scheduled');
  };

  const camera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setCameraBlocked(!permission.canAskAgain); setMessage(permission.canAskAgain ? 'Camera access was not granted. You can continue without a photo.' : 'Camera access is blocked. Enable it in device settings to attach a photo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: .72 });
    if (!result.canceled) setAttachment(result.assets[0]?.uri);
  };
  const save = async () => {
    if (kind === 'medication' && !medicationReminders) {
      setMessage('Medication choices are unavailable offline. Retry the refresh before saving.');
      return;
    }
    if (kind === 'medication' && !selectedMedication) {
      setMessage('Choose an active medication first.');
      return;
    }
    const captureTitle = kind === 'medication' ? selectedMedication?.medicationLabel ?? '' : title.trim();
    if (!captureTitle) { setMessage(kind === 'medication' ? 'Choose a medication first.' : 'Add a short description first.'); return; }
    const parsedAmount = Number(amount);
    const parsedVitalValue = Number(vitalValue);
    if (kind === 'transaction' && (!amount.trim() || !Number.isFinite(parsedAmount))) {
      setMessage('Add a valid transaction amount.'); return;
    }
    if (kind === 'health' && (!vitalType.trim() || !vitalUnit.trim() || !vitalValue.trim() || !Number.isFinite(parsedVitalValue))) {
      setMessage('Add a valid vital type, value, and unit.'); return;
    }
    if (kind === 'medication' && medicationMode === 'scheduled' && !scheduleId) {
      setMessage('Choose a scheduled dose, or select Unscheduled / PRN.'); return;
    }
    if (kind === 'medication' && medicationMode === 'unscheduled' && !supportsUnscheduled) {
      setMessage('This medication only supports scheduled doses.'); return;
    }
    if (kind === 'medication' && medicationMode === 'unscheduled' && medicationStatus === 'taken' && !dose.trim()) {
      setMessage('Enter the dose for an unscheduled / PRN capture.'); return;
    }
    const occurredAt = new Date().toISOString();
    const medicationCapture = kind === 'medication' && medicationMode === 'scheduled'
      ? buildMedicationCaptureQueueInput({
        reminders: medicationSchedules,
        medicationId,
        scheduleId,
        dose,
        medicationStatus,
        detail,
        occurredAt,
        attachmentUri,
      })
      : null;
    if (kind === 'medication' && medicationMode === 'scheduled' && !medicationCapture) {
      setMessage('Choose a scheduled dose, or select Unscheduled / PRN.'); return;
    }
    await enqueue({
      kind,
      title: medicationCapture?.title ?? captureTitle,
      detail: medicationCapture?.detail ?? (detail.trim() || undefined),
      occurredAt: medicationCapture?.occurredAt ?? occurredAt,
      amount: kind === 'transaction' ? parsedAmount : undefined,
      currency: kind === 'transaction' ? 'AUD' : undefined,
      vitalType: kind === 'health' ? vitalType.trim() : undefined,
      vitalValue: kind === 'health' ? parsedVitalValue : undefined,
      vitalUnit: kind === 'health' ? vitalUnit.trim() : undefined,
      medicationId: medicationCapture?.medicationId ?? (kind === 'medication' ? medicationId.trim() : undefined),
      scheduleId: medicationCapture?.scheduleId ?? (kind === 'medication' ? scheduleId.trim() || undefined : undefined),
      dose: medicationCapture?.dose ?? (kind === 'medication' ? dose.trim() || undefined : undefined),
      medicationStatus: medicationCapture?.medicationStatus ?? (kind === 'medication' ? medicationStatus : undefined),
      attachmentUri: medicationCapture?.attachmentUri ?? attachmentUri,
    });
    setTitle(''); setDetail(''); setAmount(''); setVitalValue(''); setMedicationId(''); setScheduleId(''); setMedicationMode('scheduled'); setDose(''); setMedicationStatus('taken'); setAttachment(undefined); setMessage('Encrypted and added to the sync queue.');
  };
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: c.background }} contentContainerStyle={[styles.page, { paddingTop: Platform.OS === 'web' ? 87 : 20, paddingBottom: Platform.OS === 'web' ? 118 : 110 }]}>
    <View><Text style={[type.eyebrow, { color: c.primary }]}>One-tap inbox</Text><Text style={[type.title, { color: c.foreground }]}>Capture the moment.</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kinds}>{kinds.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: kind === item.key }} onPress={() => setKind(item.key)} style={[styles.kind, { backgroundColor: kind === item.key ? c.primary : c.card, borderColor: kind === item.key ? c.primary : c.border, borderRadius: c.radius }]}><Feather name={item.icon} size={18} color={kind === item.key ? c.primaryForeground : c.foreground} /><Text style={[styles.kindText, { color: kind === item.key ? c.primaryForeground : c.foreground }]}>{item.label}</Text></Pressable>)}</ScrollView>
    <Card><Field label={kind === 'medication' ? 'Medication name' : kind === 'transaction' ? 'Merchant or description' : 'What happened?'} value={title} onChangeText={setTitle} placeholder="Short description" />
      {kind === 'transaction' ? <Field label="Amount (AUD)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" /> : null}
      {kind === 'health' ? <><Field label="Vital type" value={vitalType} onChangeText={setVitalType} placeholder="weight, HR, O2_sat" /><Field label="Value" value={vitalValue} onChangeText={setVitalValue} keyboardType="decimal-pad" placeholder="0" /><Field label="Unit" value={vitalUnit} onChangeText={setVitalUnit} placeholder="kg, bpm, %" /></> : null}
      {kind === 'medication' ? <View style={styles.medicationChoices}>
        <Text style={[styles.choiceLabel, { color: c.foreground }]}>Medication</Text>
          {medicationReminders === null
            ? medicationChoicesUnavailable
              ? <View style={styles.choiceRecovery}><Text style={[type.meta, { color: c.destructive }]}>Medication choices are unavailable offline. Connect to the internet and retry to load your active medications. Your capture stays open.</Text><Button secondary label={medicationRefreshInProgress ? 'Refreshing…' : 'Retry medication refresh'} icon="refresh-cw" disabled={medicationRefreshInProgress} onPress={() => void retryMedicationRefresh()} testID="retry-medication-refresh" /></View>
              : <Text style={[type.meta, { color: c.mutedForeground }]}>Loading your active medications…</Text>
            : medications.length === 0
              ? <Text style={[type.meta, { color: c.mutedForeground }]}>No active medications are available.</Text>
              : <View style={styles.choiceList}>{medications.map((item) => <Pressable key={item.medicationId} accessibilityRole="button" accessibilityState={{ selected: medicationId === item.medicationId }} onPress={() => chooseMedication(item.medicationId)} style={[styles.choice, { backgroundColor: medicationId === item.medicationId ? c.accent : c.card, borderColor: medicationId === item.medicationId ? c.primary : c.border, borderRadius: c.radius }]}><View style={{ flex: 1, gap: 3 }}><Text style={[styles.choiceText, { color: c.foreground }]}>{item.medicationLabel}</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{item.medType === 'prn' ? 'PRN / as needed' : item.medType === 'scheduled_prn' ? 'Scheduled + PRN' : item.medType === 'adhoc' ? 'Ad-hoc' : 'Scheduled'}{item.supportsUnscheduled ? ' · Unscheduled available' : ''}</Text></View><Feather name={medicationId === item.medicationId ? 'check-circle' : 'circle'} size={19} color={medicationId === item.medicationId ? c.primary : c.mutedForeground} /></Pressable>)}</View>}
          {medicationId ? <><Text style={[styles.choiceLabel, { color: c.foreground }]}>Dose type</Text><View style={styles.choiceList}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: medicationMode === 'scheduled', disabled: schedules.length === 0 }} disabled={schedules.length === 0} onPress={() => { setMedicationMode('scheduled'); setScheduleId(''); }} style={[styles.choice, { opacity: schedules.length ? 1 : .55, backgroundColor: medicationMode === 'scheduled' ? c.accent : c.card, borderColor: medicationMode === 'scheduled' ? c.primary : c.border, borderRadius: c.radius }]}><View style={{ flex: 1, gap: 3 }}><Text style={[styles.choiceText, { color: c.foreground }]}>Scheduled dose</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{schedules.length ? 'Choose an active schedule below' : 'No active schedule'}</Text></View><Feather name={medicationMode === 'scheduled' ? 'check-circle' : 'circle'} size={19} color={medicationMode === 'scheduled' ? c.primary : c.mutedForeground} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: medicationMode === 'unscheduled', disabled: !supportsUnscheduled }} disabled={!supportsUnscheduled} onPress={() => { setMedicationMode('unscheduled'); setScheduleId(''); }} style={[styles.choice, { opacity: supportsUnscheduled ? 1 : .55, backgroundColor: medicationMode === 'unscheduled' ? c.accent : c.card, borderColor: medicationMode === 'unscheduled' ? c.primary : c.border, borderRadius: c.radius }]}><View style={{ flex: 1, gap: 3 }}><Text style={[styles.choiceText, { color: c.foreground }]}>Unscheduled / PRN</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{supportsUnscheduled ? 'Record a dose without a schedule' : 'Not enabled for this medication'}</Text></View><Feather name={medicationMode === 'unscheduled' ? 'check-circle' : 'circle'} size={19} color={medicationMode === 'unscheduled' ? c.primary : c.mutedForeground} /></Pressable>
          </View></> : null}
          {medicationId && medicationMode === 'scheduled' && schedules.length ? <><Text style={[styles.choiceLabel, { color: c.foreground }]}>Active schedule</Text><View style={styles.choiceList}>{schedules.map((item) => <Pressable key={item.scheduleId} accessibilityRole="button" accessibilityState={{ selected: scheduleId === item.scheduleId }} onPress={() => setScheduleId(item.scheduleId)} style={[styles.choice, { backgroundColor: scheduleId === item.scheduleId ? c.accent : c.card, borderColor: scheduleId === item.scheduleId ? c.primary : c.border, borderRadius: c.radius }]}><View style={{ flex: 1, gap: 3 }}><Text style={[styles.choiceText, { color: c.foreground }]}>{item.times.join(' · ')}</Text><Text style={[type.meta, { color: c.mutedForeground }]}>Scheduled dose: {item.doseAmount}</Text></View><Feather name={scheduleId === item.scheduleId ? 'check-circle' : 'circle'} size={19} color={scheduleId === item.scheduleId ? c.primary : c.mutedForeground} /></Pressable>)}</View></> : null}
        <Text style={[styles.choiceLabel, { color: c.foreground }]}>Status</Text><View style={styles.statusRow}>{(['taken', 'skipped'] as const).map((status) => <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: medicationStatus === status }} onPress={() => setMedicationStatus(status)} style={[styles.status, { backgroundColor: medicationStatus === status ? c.primary : c.card, borderColor: medicationStatus === status ? c.primary : c.border, borderRadius: c.radius }]}><Text style={[styles.statusText, { color: medicationStatus === status ? c.primaryForeground : c.foreground }]}>{status === 'taken' ? 'Taken' : 'Skipped'}</Text></Pressable>)}</View>
         <Field label={medicationMode === 'unscheduled' ? 'Dose' : 'Dose (optional)'} value={dose} onChangeText={setDose} keyboardType="decimal-pad" placeholder={medicationMode === 'unscheduled' ? 'Enter the dose taken' : selectedSchedule ? `Uses scheduled dose (${selectedSchedule.doseAmount}) when blank` : 'Choose a scheduled dose first'} />
      </View> : null}
      <Field label="Optional note" value={detail} onChangeText={setDetail} multiline placeholder="Context, tags, or source" style={{ minHeight: 86, textAlignVertical: 'top', paddingTop: 13 }} />
      <Button secondary label={attachmentUri ? 'Photo attached' : 'Attach camera photo'} icon={attachmentUri ? 'check' : 'camera'} onPress={camera} />
      {cameraBlocked && Platform.OS !== 'web' ? <Button secondary label="Open device settings" icon="settings" onPress={() => void Linking.openSettings()} /> : null}
      <Button label="Save securely" icon="arrow-down-circle" onPress={save} testID="capture-save" />{message ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: message.startsWith('Encrypted') ? c.accentForeground : c.destructive }]}>{message}</Text> : null}
    </Card>
    <Text style={[type.meta, { color: c.mutedForeground }]}>Saved with a unique idempotency key. Retrying a sync cannot create a duplicate.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 20, gap: 18 },
  kinds: { gap: 9 },
  kind: { borderWidth: 1, paddingHorizontal: 13, height: 43, flexDirection: 'row', alignItems: 'center', gap: 7 },
  kindText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  medicationChoices: { gap: 10 },
  choiceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 3 },
  choiceRecovery: { gap: 10 },
  choiceList: { gap: 8 },
  choice: { minHeight: 52, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flexShrink: 1 },
  statusRow: { flexDirection: 'row', gap: 8 },
  status: { flex: 1, minHeight: 46, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
