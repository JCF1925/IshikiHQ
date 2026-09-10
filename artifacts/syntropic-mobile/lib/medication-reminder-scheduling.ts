export type ReminderPreferences = {
  medications: boolean;
  tasks: boolean;
  events: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
};

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function isMedicationTimeInQuietHours(
  time: string,
  quietHoursStart: string | null | undefined,
  quietHoursEnd: string | null | undefined,
): boolean {
  if (!quietHoursStart || !quietHoursEnd || quietHoursStart === quietHoursEnd) return false;
  const medicationMinutes = timeToMinutes(time);
  const startMinutes = timeToMinutes(quietHoursStart);
  const endMinutes = timeToMinutes(quietHoursEnd);
  return startMinutes < endMinutes
    ? medicationMinutes >= startMinutes && medicationMinutes < endMinutes
    : medicationMinutes >= startMinutes || medicationMinutes < endMinutes;
}

export function reconcileReminderTimezone(
  settings: ReminderPreferences,
  deviceTimezone: string,
): ReminderPreferences | null {
  if (settings.timezone === deviceTimezone) return null;
  return { ...settings, timezone: deviceTimezone };
}

export function medicationDailyTrigger(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
}

export function dedupeMedicationReminderSchedules<T extends { scheduleId: string; time: string }>(
  schedules: readonly T[],
): T[] {
  const seen = new Set<string>();
  return schedules.filter((schedule) => {
    const key = `${schedule.scheduleId}\u0000${schedule.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isMedicationReminderNotification(data: unknown): boolean {
  return typeof data === 'object'
    && data !== null
    && 'type' in data
    && data.type === 'medication-reminder';
}