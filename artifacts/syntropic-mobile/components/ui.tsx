import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius }, style]}>{children}</View>;
}
export function Button({ label, icon, onPress, secondary, disabled, testID }: { label: string; icon?: React.ComponentProps<typeof Feather>['name']; onPress(): void; secondary?: boolean; disabled?: boolean; testID?: string }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? c.secondary : c.primary, opacity: disabled ? .45 : pressed ? .72 : 1, borderRadius: c.radius }]}>
    {icon ? <Feather name={icon} size={17} color={secondary ? c.secondaryForeground : c.primaryForeground} /> : null}
    <Text style={[styles.buttonText, { color: secondary ? c.secondaryForeground : c.primaryForeground }]}>{label}</Text>
  </Pressable>;
}
export function Field(props: TextInputProps & { label: string }) {
  const c = useColors();
  return <View style={{ gap: 6 }}><Text style={[styles.label, { color: c.foreground }]}>{props.label}</Text><TextInput {...props} placeholderTextColor={c.mutedForeground} style={[styles.input, { color: c.foreground, borderColor: c.input, backgroundColor: c.card, borderRadius: c.radius }, props.style]} /></View>;
}
export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'bad' }) {
  const c = useColors();
  const bg = tone === 'good' ? c.accent : tone === 'bad' ? c.destructive : c.muted;
  const fg = tone === 'bad' ? c.destructiveForeground : tone === 'good' ? c.accentForeground : c.mutedForeground;
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color: fg }]}>{text}</Text></View>;
}
export const type = StyleSheet.create({
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7 },
  section: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
});
const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, gap: 10 },
  button: { minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  input: { borderWidth: 1, minHeight: 50, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 16 },
  pill: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: .5 },
});