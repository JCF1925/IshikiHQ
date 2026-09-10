/**
 * Keep enough recent responses to deduplicate normal cold-start/live-delivery
 * overlap without retaining notification identifiers for the whole app session.
 */
export const MAX_HANDLED_NOTIFICATION_IDS = 128;

export function claimNotificationResponse(
  handledNotificationIds: Set<string>,
  notificationId: string,
  maxRetainedIds = MAX_HANDLED_NOTIFICATION_IDS,
): boolean {
  if (handledNotificationIds.has(notificationId)) return false;
  handledNotificationIds.add(notificationId);
  while (handledNotificationIds.size > maxRetainedIds) {
    const oldestNotificationId = handledNotificationIds.values().next().value;
    if (oldestNotificationId === undefined) break;
    handledNotificationIds.delete(oldestNotificationId);
  }
  return true;
}

export function medicationDoseRequestIdentity(doseKey: string) {
  return {
    clientId: `medication-dose:${doseKey}`,
    idempotencyKey: `medication-reminder:${doseKey}`,
  };
}

export async function runMedicationDoseOnce(
  activeDoseKeys: Set<string>,
  doseKey: string,
  submit: () => Promise<void>,
): Promise<boolean> {
  if (activeDoseKeys.has(doseKey)) return false;
  activeDoseKeys.add(doseKey);
  try {
    await submit();
    return true;
  } finally {
    activeDoseKeys.delete(doseKey);
  }
}