export interface MedicationReminderChoice {
  scheduleId: string;
  medicationId: string;
  medicationLabel: string;
  times: string[];
  doseAmount: string;
  enabled: boolean;
  revealName: boolean;
}

export interface MedicationReminderOptions {
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  enabled: boolean;
  reminders: MedicationReminderChoice[];
}

export interface MedicationCaptureQueueInput {
  kind: 'medication';
  title: string;
  detail?: string;
  occurredAt: string;
  medicationId: string;
  scheduleId: string;
  dose?: string;
  medicationStatus: 'taken' | 'skipped';
  attachmentUri?: string;
}

export interface MedicationSelection {
  medicationId: string;
  scheduleId: string;
}

export function getMedicationChoices(
  reminders: readonly MedicationReminderChoice[],
): MedicationReminderChoice[] {
  return Array.from(new Map(reminders.map((reminder) => [reminder.medicationId, reminder])).values());
}

export function getMedicationSchedules(
  reminders: readonly MedicationReminderChoice[],
  medicationId: string,
): MedicationReminderChoice[] {
  return reminders.filter((reminder) => reminder.medicationId === medicationId);
}

export function reconcileMedicationSelection(
  reminders: readonly MedicationReminderChoice[],
  selection: MedicationSelection,
): MedicationSelection {
  const medicationExists = reminders.some((reminder) => reminder.medicationId === selection.medicationId);
  if (!medicationExists) return { medicationId: '', scheduleId: '' };

  const scheduleExists = reminders.some((reminder) =>
    reminder.medicationId === selection.medicationId && reminder.scheduleId === selection.scheduleId);
  return {
    medicationId: selection.medicationId,
    scheduleId: scheduleExists ? selection.scheduleId : '',
  };
}

export function buildMedicationCaptureQueueInput(input: {
  reminders: readonly MedicationReminderChoice[];
  medicationId: string;
  scheduleId: string;
  dose: string;
  medicationStatus: 'taken' | 'skipped';
  detail: string;
  occurredAt: string;
  attachmentUri?: string;
}): MedicationCaptureQueueInput | null {
  const medication = input.reminders.find((reminder) => reminder.medicationId === input.medicationId);
  const schedule = input.reminders.find((reminder) =>
    reminder.medicationId === input.medicationId && reminder.scheduleId === input.scheduleId);
  if (!medication || !schedule) return null;

  return {
    kind: 'medication',
    title: medication.medicationLabel,
    detail: input.detail.trim() || undefined,
    occurredAt: input.occurredAt,
    medicationId: medication.medicationId,
    scheduleId: schedule.scheduleId,
    dose: input.dose.trim() || undefined,
    medicationStatus: input.medicationStatus,
    attachmentUri: input.attachmentUri,
  };
}

export function getCachedMedicationOptions<T>(
  cached: { email: string; options: T } | null | undefined,
  accountEmail: string | null | undefined,
): T | null {
  return cached && accountEmail && cached.email === accountEmail ? cached.options : null;
}