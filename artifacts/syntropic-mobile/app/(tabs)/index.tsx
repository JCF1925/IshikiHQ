import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { Button, Card, Field, Pill, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { RestoreUnavailableError, useApp } from '@/providers/AppProvider';

export default function HomeScreen() {
  const c = useColors();
  const { email, queue, remoteChanges, restoreCapture, updateMedicationDose, deleteMedicationDose } = useApp();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [restoreUnavailableIds, setRestoreUnavailableIds] = useState<Set<string>>(() => new Set());
  const [editingDoseId, setEditingDoseId] = useState<string | null>(null);
  const [editDose, setEditDose] = useState('');
  const [editStatus, setEditStatus] = useState<'taken' | 'skipped'>('taken');
  const [editNote, setEditNote] = useState('');
  const [doseMessage, setDoseMessage] = useState<string | null>(null);
  const pending = queue.filter((item) => item.state === 'pending').length;
  const latestChanges = new Map<string, typeof remoteChanges[number]>();
  remoteChanges.forEach((change) => latestChanges.set(change.entityId, change));
  const deletedChanges = [...latestChanges.values()].filter((change) => change.operation === 'delete');
  const prnChanges = [...latestChanges.values()].filter((change) => {
    if (change.entityType !== 'medicationDose' || change.operation !== 'upsert') return false;
    return typeof change.payload.medicationId === 'string'
      && typeof change.payload.takenAt === 'string'
      && !change.payload.scheduleId;
  });
  const startDoseEdit = (change: typeof prnChanges[number]) => {
    setEditingDoseId(change.entityId);
    setEditDose(typeof change.payload.dose === 'string' ? change.payload.dose : '');
    setEditStatus(change.payload.status === 'skipped' ? 'skipped' : 'taken');
    setEditNote(typeof change.payload.reason === 'string' ? change.payload.reason : '');
    setDoseMessage(null);
  };
  const saveDoseEdit = async (change: typeof prnChanges[number]) => {
    const medicationId = typeof change.payload.medicationId === 'string' ? change.payload.medicationId : '';
    const takenAt = typeof change.payload.takenAt === 'string' ? change.payload.takenAt : '';
    if (!medicationId || !takenAt) return;
    try {
      await updateMedicationDose({
        entityId: change.entityId,
        serverVersion: (change.baseVersion ?? 0) + 1,
        title: 'Unscheduled medication dose',
        medicationId,
        takenAt,
        dose: editDose,
        status: editStatus,
        detail: editNote,
      });
      setEditingDoseId(null);
      setDoseMessage('Dose correction queued. Stock will be reversed and reapplied atomically when it syncs.');
    } catch (error) {
      setDoseMessage(error instanceof Error ? error.message : 'The dose correction could not be queued.');
    }
  };
  const confirmDoseDelete = (change: typeof prnChanges[number]) => {
    Alert.alert(
      'Remove this PRN dose?',
      'When it syncs, the original stock consumption will be reversed in the same transaction as the deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove dose',
          style: 'destructive',
          onPress: () => void deleteMedicationDose({
            entityId: change.entityId,
            serverVersion: (change.baseVersion ?? 0) + 1,
          }).then(
            () => setDoseMessage('Dose removal queued. Stock will be restored when it syncs.'),
            (error) => setDoseMessage(error instanceof Error ? error.message : 'The dose could not be removed.'),
          ),
        },
      ],
    );
  };
  const restore = async (entityId: string, expectedVersion: number) => {
    setRestoringId(entityId);
    setRestoreMessage(null);
    try {
      await restoreCapture(entityId, expectedVersion);
      setRestoreMessage({ tone: 'good', text: 'Capture restored. Its canonical record and any medication stock effect are back in sync.' });
    } catch (error) {
      if (error instanceof RestoreUnavailableError) {
        setRestoreUnavailableIds((current) => new Set(current).add(entityId));
        setRestoreMessage({
          tone: 'bad',
          text: 'This older deleted capture cannot be restored. The server no longer has its private details, so it cannot recreate what was deleted. Do not silently create a new capture as a replacement; check your records first to avoid adding a duplicate or changing your history.',
        });
      } else {
        setRestoreMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'The capture could not be restored. Review the server version and try again.' });
      }
    } finally {
      setRestoringId(null);
    }
  };
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={[styles.container, { paddingTop: Platform.OS === 'web' ? 87 : 20, paddingBottom: Platform.OS === 'web' ? 118 : 110 }]}>
      <View style={styles.heading}><View><Text style={[type.eyebrow, { color: c.primary }]}>Today</Text><Text style={[type.title, { color: c.foreground }]}>Good to see you.</Text></View><View style={[styles.avatar, { backgroundColor: c.accent }]}><Text style={[type.section, { color: c.accentForeground }]}>{email?.slice(0, 1).toUpperCase()}</Text></View></View>
      <Card style={{ backgroundColor: c.foreground }}><View style={styles.row}><Text style={[type.eyebrow, { color: c.primary }]}>Daily signal</Text><Feather name="activity" color={c.primary} size={19} /></View><Text style={[styles.big, { color: c.background }]}>Steady</Text><Text style={[type.body, { color: c.mutedForeground }]}>No items need immediate review. This summary is informational, not a diagnosis.</Text></Card>
       <View style={styles.row}><Text style={[type.section, { color: c.foreground }]}>Next actions</Text><Pill text={`${pending} pending`} tone={pending ? 'neutral' : 'good'} /></View>
       {remoteChanges.length > 0 ? <Card><Text style={[type.section, { color: c.foreground }]}>Synced context</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{remoteChanges.length} server changes are available on this device and included in the latest sync cursor.</Text></Card> : null}
      {deletedChanges.length > 0 ? <Card>
        <Text style={[type.section, { color: c.foreground }]}>Recently deleted captures</Text>
        <Text style={[type.meta, { color: c.mutedForeground }]}>The capture details stay hidden until you explicitly restore it. Review the server version before continuing.</Text>
        {deletedChanges.map((change) => {
          const expectedVersion = (change.baseVersion ?? 0) + 1;
          return <View key={change.entityId} style={[styles.deleted, { borderTopColor: c.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.foreground }]}>{change.entityType} capture</Text>
                <Text style={[type.meta, { color: c.mutedForeground }]}>Server version {expectedVersion} · deleted {new Date(change.changedAt).toLocaleString()}</Text>
              </View>
              <Pill text="deleted" tone="bad" />
            </View>
            {restoreUnavailableIds.has(change.entityId) ? <View accessible accessibilityRole="alert" style={[styles.unavailable, { backgroundColor: c.muted }]}>
              <Text style={[type.body, { color: c.foreground }]}>Restore unavailable</Text>
              <Text style={[type.meta, { color: c.mutedForeground }]}>The server cannot recreate the deleted details for this older capture. Check your records before creating anything new so you do not silently add a replacement.</Text>
            </View> : <Button
              secondary
              label={restoringId === change.entityId ? 'Restoring…' : 'Restore capture'}
              icon="rotate-ccw"
              disabled={restoringId !== null}
              onPress={() => void restore(change.entityId, expectedVersion)}
            />}
          </View>;
        })}
        {restoreMessage ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: restoreMessage.tone === 'bad' ? c.destructive : c.mutedForeground }]}>{restoreMessage.text}</Text> : null}
      </Card> : null}
      {prnChanges.length > 0 ? <Card>
        <Text style={[type.section, { color: c.foreground }]}>Recent PRN captures</Text>
        <Text style={[type.meta, { color: c.mutedForeground }]}>Correct or remove an unscheduled dose. Any stock change is applied together with the edit or removal.</Text>
        {prnChanges.map((change) => {
          const medicationId = typeof change.payload.medicationId === 'string' ? change.payload.medicationId : 'unknown';
          const dose = typeof change.payload.dose === 'string' ? change.payload.dose : '—';
          const takenAt = typeof change.payload.takenAt === 'string' ? change.payload.takenAt : change.changedAt;
          const mutationPending = queue.some((item) => item.entityId === change.entityId && item.state !== 'error');
          return <View key={change.entityId} style={[styles.deleted, { borderTopColor: c.border }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.foreground }]}>Unscheduled dose · {medicationId}</Text>
                <Text style={[type.meta, { color: c.mutedForeground }]}>{dose} · {new Date(takenAt).toLocaleString()}</Text>
              </View>
              <Pill text={change.payload.status === 'skipped' ? 'skipped' : 'taken'} tone={change.payload.status === 'skipped' ? 'neutral' : 'good'} />
            </View>
            {editingDoseId === change.entityId ? <View style={styles.editForm}>
              <Field label="Correct dose" value={editDose} onChangeText={setEditDose} keyboardType="decimal-pad" />
              <Text style={[type.meta, { color: c.foreground }]}>Status</Text>
              <View style={styles.statusRow}>
                {(['taken', 'skipped'] as const).map((status) => <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: editStatus === status }} onPress={() => setEditStatus(status)} style={[styles.status, { backgroundColor: editStatus === status ? c.primary : c.card, borderColor: editStatus === status ? c.primary : c.border, borderRadius: c.radius }]}><Text style={[styles.statusText, { color: editStatus === status ? c.primaryForeground : c.foreground }]}>{status === 'taken' ? 'Taken' : 'Skipped'}</Text></Pressable>)}
              </View>
              <Field label="Note (optional)" value={editNote} onChangeText={setEditNote} />
              <View style={styles.actionRow}>
                <Button secondary label="Cancel" onPress={() => setEditingDoseId(null)} />
                <Button label="Save correction" onPress={() => void saveDoseEdit(change)} disabled={mutationPending} />
              </View>
            </View> : <View style={styles.actionRow}>
              <Button secondary label="Edit dose" icon="edit-2" onPress={() => startDoseEdit(change)} disabled={mutationPending} />
              <Button secondary label="Remove dose" icon="trash-2" onPress={() => confirmDoseDelete(change)} disabled={mutationPending} />
            </View>}
          </View>;
        })}
        {doseMessage ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: c.mutedForeground }]}>{doseMessage}</Text> : null}
      </Card> : null}
      <Card><Text style={[type.section, { color: c.foreground }]}>Quick capture</Text><Text style={[type.body, { color: c.mutedForeground }]}>Transaction, task, event, health note, or medication dose.</Text><Text accessibilityRole="link" onPress={() => router.push('/capture')} style={[styles.link, { color: c.primary }]}>Capture something <Feather name="arrow-up-right" size={15} /></Text></Card>
      <Text style={[type.section, { color: c.foreground }]}>Offline queue</Text>
      {queue.length === 0 ? <Card><Feather name="check-circle" size={24} color={c.primary} /><Text style={[type.body, { color: c.foreground }]}>Everything is up to date.</Text><Text style={[type.meta, { color: c.mutedForeground }]}>New records are encrypted on this device before they sync.</Text></Card> : queue.slice(0, 4).map((item) => <Card key={item.id}><View style={styles.row}><View style={{ flex: 1 }}><Text style={[type.section, { color: c.foreground }]}>{item.title}</Text><Text style={[type.meta, { color: c.mutedForeground }]}>{item.kind} · {new Date(item.occurredAt).toLocaleString()}</Text></View><Pill text={item.state} tone={item.state === 'error' ? 'bad' : 'neutral'} /></View></Card>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20, gap: 16,
  },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  editForm: { gap: 10 },
  statusRow: { flexDirection: 'row', gap: 8 },
  status: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  big: { fontFamily: 'Inter_700Bold', fontSize: 36, letterSpacing: -1 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 15, paddingVertical: 5 },
  deleted: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4 },
  unavailable: { gap: 4, padding: 12, borderRadius: 10 },
});
