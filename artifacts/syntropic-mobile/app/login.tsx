import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, Card, Field, type } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/providers/AppProvider';

export default function Login() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [email, setEmail] = useState(app.email ?? '');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (app.biometricEnabled && app.biometricAvailable) void app.unlock().then((ok) => { if (ok) router.replace('/(tabs)'); });
  }, [app.biometricAvailable, app.biometricEnabled, app.unlock]);
  const submit = async () => {
    setBusy(true); setError('');
    try { await app.login(email, passcode); router.replace('/(tabs)'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to unlock.'); }
    finally { setBusy(false); }
  };
  return <KeyboardAwareScrollViewCompat style={{ backgroundColor: c.background }} contentContainerStyle={[styles.page, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 28), paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24) }]}>
    <View style={[styles.mark, { backgroundColor: c.primary }]}><Feather name="activity" size={26} color={c.primaryForeground} /></View>
     <View style={{ gap: 8 }}><Text style={[type.eyebrow, { color: c.primary }]}>Private by design</Text><Text style={[type.title, { color: c.foreground }]}>Your life, in one secure place.</Text><Text style={[type.body, { color: c.mutedForeground }]}>Sign in once to create a secure device session. Your captures remain available offline.</Text></View>
    <Card>{app.sessionNotice ? <Text testID="session-invalidated-message" accessibilityRole="alert" style={[type.meta, { color: c.destructive }]}>{app.sessionNotice}</Text> : null}<Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><Field label="Password" value={passcode} onChangeText={setPasscode} secureTextEntry autoComplete="password" onSubmitEditing={submit} />{error ? <Text accessibilityRole="alert" style={[type.meta, { color: c.destructive }]}>{error}</Text> : null}<Button label={busy ? 'Signing in…' : 'Sign in securely'} icon="lock" onPress={submit} disabled={busy} testID="login-submit" />
      {app.biometricAvailable && app.biometricEnabled ? <Button label="Use biometrics" icon="shield" secondary onPress={() => void app.unlock().then((ok) => ok ? router.replace('/(tabs)') : Alert.alert('Not unlocked', 'Biometric verification was cancelled or unsuccessful.'))} /> : null}
    </Card>
     <Text style={[type.meta, { color: c.mutedForeground, textAlign: 'center' }]}>Only the device session token is stored in the Keychain or Keystore. Your password is never stored.</Text>
  </KeyboardAwareScrollViewCompat>;
}
const styles = StyleSheet.create({ page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, gap: 24 }, mark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' } });