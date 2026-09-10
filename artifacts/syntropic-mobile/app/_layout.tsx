import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider, useApp } from '@/providers/AppProvider';
import { claimNotificationResponse } from '@/lib/reminder-action-guards';
import { QueryClient, QueryClientProvider, setBaseUrl } from '@workspace/api-client-react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/_workspace-api` : null);

const queryClient = new QueryClient();

function RootLayoutNav() {
  const app = useApp();
  const pendingRoute = useRef<string | null>(null);
  const handledNotificationIds = useRef(new Set<string>());
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const notificationId = response.notification.request.identifier;
      if (!claimNotificationResponse(handledNotificationIds.current, notificationId)) return;
      const data = response.notification.request.content.data as {
        type?: string;
        scheduleId?: string;
        time?: string;
      } | undefined;
      if (data?.type !== 'medication-reminder' || !data.scheduleId) return;
      const time = typeof data.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.time)
        ? `?time=${encodeURIComponent(data.time)}`
        : '';
      const route = `/medication/${encodeURIComponent(data.scheduleId)}${time}`;
      if (app.session) router.push(route as never);
      else pendingRoute.current = route;
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then(openResponse);
    return () => subscription.remove();
  }, [app.session]);
  useEffect(() => {
    if (app.session && pendingRoute.current) {
      const route = pendingRoute.current;
      pendingRoute.current = null;
      router.push(route as never);
    }
  }, [app.session]);
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="medication/[scheduleId]" options={{ title: 'Medication dose' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
