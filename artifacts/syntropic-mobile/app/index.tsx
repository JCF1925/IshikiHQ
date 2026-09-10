import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '@/providers/AppProvider';
import { useColors } from '@/hooks/useColors';

export default function Entry() {
  const app = useApp();
  const colors = useColors();
  if (!app.ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  return <Redirect href={app.session ? '/(tabs)' : '/login'} />;
}