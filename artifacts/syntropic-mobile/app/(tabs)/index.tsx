import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Pill, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/providers/AppProvider';

export default function HomeScreen() {
  const c = useColors();
  const { email, queue, remoteChanges, restoreCapture } = useApp();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const pending = queue.filter((item) => item.state === 'pending').length;
  const latestChanges = new Map<string, typeof remoteChanges[number]>();
  remoteChanges.forEach((change) => latestChanges.set(change.entityId, change));
  const deletedChanges = [...latestChanges.values()].filter((change) => change.operation === 'delete');
  const restore = async (entityId: string, expectedVersion: number) => {
    setRestoringId(entityId);
    setRestoreMessage(null);
    try {
      await restoreCapture(entityId, expectedVersion);
      setRestoreMessage('Capture restored. Its canonical record and any medication stock effect are back in sync.');
    } catch (error) {
      setRestoreMessage(error instanceof Error ? error.message : 'The capture could not be restored. Review the server version and try again.');
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
            <Button
              secondary
              label={restoringId === change.entityId ? 'Restoring…' : 'Restore capture'}
              icon="rotate-ccw"
              disabled={restoringId !== null}
              onPress={() => void restore(change.entityId, expectedVersion)}
            />
          </View>;
        })}
        {restoreMessage ? <Text accessibilityLiveRegion="polite" style={[type.meta, { color: c.mutedForeground }]}>{restoreMessage}</Text> : null}
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
  big: { fontFamily: 'Inter_700Bold', fontSize: 36, letterSpacing: -1 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 15, paddingVertical: 5 },
  deleted: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4 },
});
