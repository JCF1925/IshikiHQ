export interface AppStateSubscriptionSource {
  addEventListener(
    event: 'change',
    listener: (state: string) => void,
  ): { remove(): void };
}

export function subscribeMedicationReminderForegroundRefresh(
  appState: AppStateSubscriptionSource,
  enabled: boolean,
  refresh: () => Promise<void>,
) {
  if (!enabled) return () => undefined;

  const subscription = appState.addEventListener('change', (state) => {
    if (state === 'active') void refresh().catch(() => undefined);
  });
  return () => subscription.remove();
}