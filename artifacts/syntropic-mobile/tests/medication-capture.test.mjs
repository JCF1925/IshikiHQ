import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMedicationCaptureQueueInput,
  getCachedMedicationOptions,
  getMedicationChoices,
  getMedicationSchedules,
} from '../lib/medication-capture.ts';

const reminders = [
  {
    medicationId: 'med-stable-1',
    medicationLabel: 'Morning medication',
    scheduleId: 'schedule-morning',
    times: ['08:00'],
    doseAmount: '1 tablet',
    enabled: true,
    revealName: false,
  },
  {
    medicationId: 'med-stable-1',
    medicationLabel: 'Morning medication',
    scheduleId: 'schedule-evening',
    times: ['20:00'],
    doseAmount: '1 tablet',
    enabled: true,
    revealName: false,
  },
  {
    medicationId: 'med-stable-2',
    medicationLabel: 'Evening medication',
    scheduleId: 'schedule-other',
    times: ['21:00'],
    doseAmount: '2 tablets',
    enabled: true,
    revealName: false,
  },
];

describe('medication capture picker', () => {
  it('keeps one readable medication choice while retaining its stable schedules', () => {
    assert.deepEqual(
      getMedicationChoices(reminders).map(({ medicationId, medicationLabel }) => ({ medicationId, medicationLabel })),
      [
        { medicationId: 'med-stable-1', medicationLabel: 'Morning medication' },
        { medicationId: 'med-stable-2', medicationLabel: 'Evening medication' },
      ],
    );
    assert.deepEqual(
      getMedicationSchedules(reminders, 'med-stable-1').map(({ scheduleId }) => scheduleId),
      ['schedule-morning', 'schedule-evening'],
    );
  });

  it('queues the selected medication and active schedule with taken status and no optional dose', () => {
    const input = buildMedicationCaptureQueueInput({
      reminders,
      medicationId: 'med-stable-1',
      scheduleId: 'schedule-evening',
      dose: '   ',
      medicationStatus: 'taken',
      detail: 'After dinner',
      occurredAt: '2026-09-10T10:00:00.000Z',
    });

    assert.deepEqual(input, {
      kind: 'medication',
      title: 'Morning medication',
      detail: 'After dinner',
      occurredAt: '2026-09-10T10:00:00.000Z',
      medicationId: 'med-stable-1',
      scheduleId: 'schedule-evening',
      dose: undefined,
      medicationStatus: 'taken',
      attachmentUri: undefined,
    });
  });

  it('preserves the same stable IDs when the user changes status to skipped', () => {
    const input = buildMedicationCaptureQueueInput({
      reminders,
      medicationId: 'med-stable-1',
      scheduleId: 'schedule-evening',
      dose: '0.5 tablet',
      medicationStatus: 'skipped',
      detail: '',
      occurredAt: '2026-09-10T10:01:00.000Z',
    });

    assert.equal(input?.medicationId, 'med-stable-1');
    assert.equal(input?.scheduleId, 'schedule-evening');
    assert.equal(input?.medicationStatus, 'skipped');
    assert.equal(input?.dose, '0.5 tablet');
  });

  it('keeps the selected IDs in a pending offline queue payload', () => {
    const queued = buildMedicationCaptureQueueInput({
      reminders,
      medicationId: 'med-stable-2',
      scheduleId: 'schedule-other',
      dose: '',
      medicationStatus: 'taken',
      detail: '',
      occurredAt: '2026-09-10T10:02:00.000Z',
    });

    assert.equal(queued?.medicationId, 'med-stable-2');
    assert.equal(queued?.scheduleId, 'schedule-other');
    assert.equal(queued?.dose, undefined);
  });
});

describe('account-owned medication cache', () => {
  const cached = {
    email: 'one@example.com',
    options: { timezone: 'Australia/Melbourne', reminders },
  };

  it('returns cached choices for the owning account', () => {
    assert.deepEqual(getCachedMedicationOptions(cached, 'one@example.com'), cached.options);
  });

  it('does not reuse cached choices after switching accounts', () => {
    assert.equal(getCachedMedicationOptions(cached, 'two@example.com'), null);
    assert.equal(getCachedMedicationOptions(cached, null), null);
  });
});