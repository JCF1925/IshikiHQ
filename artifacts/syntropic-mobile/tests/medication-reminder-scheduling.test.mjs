import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dedupeMedicationReminderSchedules,
  isMedicationReminderNotification,
  isMedicationTimeInQuietHours,
  medicationDailyTrigger,
  reconcileReminderTimezone,
} from '../lib/medication-reminder-scheduling.ts';

describe('medication quiet hours', () => {
  it('handles overnight quiet hours with an inclusive start and exclusive end', () => {
    assert.equal(isMedicationTimeInQuietHours('21:59', '22:00', '06:00'), false);
    assert.equal(isMedicationTimeInQuietHours('22:00', '22:00', '06:00'), true);
    assert.equal(isMedicationTimeInQuietHours('23:59', '22:00', '06:00'), true);
    assert.equal(isMedicationTimeInQuietHours('00:00', '22:00', '06:00'), true);
    assert.equal(isMedicationTimeInQuietHours('05:59', '22:00', '06:00'), true);
    assert.equal(isMedicationTimeInQuietHours('06:00', '22:00', '06:00'), false);
  });

  it('uses the same exact-boundary rule for daytime quiet hours', () => {
    assert.equal(isMedicationTimeInQuietHours('12:59', '13:00', '14:00'), false);
    assert.equal(isMedicationTimeInQuietHours('13:00', '13:00', '14:00'), true);
    assert.equal(isMedicationTimeInQuietHours('14:00', '13:00', '14:00'), false);
  });
});

describe('reminder timezone reconciliation', () => {
  it('changes only the timezone and preserves task and event preferences', () => {
    const settings = {
      medications: true,
      tasks: false,
      events: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:00',
      timezone: 'America/Los_Angeles',
    };

    assert.deepEqual(reconcileReminderTimezone(settings, 'America/New_York'), {
      ...settings,
      timezone: 'America/New_York',
    });
    assert.equal(reconcileReminderTimezone(settings, settings.timezone), null);
  });
});

describe('notification reconciliation scope', () => {
  it('selects medication notifications without selecting task or event reminders', () => {
    assert.equal(isMedicationReminderNotification({ type: 'medication-reminder' }), true);
    assert.equal(isMedicationReminderNotification({ type: 'task-reminder' }), false);
    assert.equal(isMedicationReminderNotification({ type: 'event-reminder' }), false);
    assert.equal(isMedicationReminderNotification(undefined), false);
  });
});

describe('daily medication triggers across daylight-saving changes', () => {
  it('keeps the intended local time and quiet-hour decision on both sides of spring DST', () => {
    const trigger = medicationDailyTrigger('08:30');
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const beforeDst = new Date('2026-03-07T13:30:00.000Z');
    const afterDst = new Date('2026-03-09T12:30:00.000Z');

    assert.deepEqual(trigger, { hour: 8, minute: 30 });
    assert.equal(formatter.format(beforeDst), '08:30');
    assert.equal(formatter.format(afterDst), '08:30');
    assert.equal(isMedicationTimeInQuietHours('08:30', '22:00', '06:00'), false);
    assert.equal(isMedicationTimeInQuietHours('23:00', '22:00', '06:00'), true);
  });
  it('schedules one dose for the repeated autumn hour and keeps quiet-hour filtering local', () => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const firstOccurrence = new Date('2026-11-01T05:30:00.000Z');
    const secondOccurrence = new Date('2026-11-01T06:30:00.000Z');
    const repeatedHourSchedules = dedupeMedicationReminderSchedules([
      { scheduleId: 'schedule-1', time: formatter.format(firstOccurrence) },
      { scheduleId: 'schedule-1', time: formatter.format(secondOccurrence) },
    ]);

    assert.equal(formatter.format(firstOccurrence), '01:30');
    assert.equal(formatter.format(secondOccurrence), '01:30');
    assert.deepEqual(medicationDailyTrigger('01:30'), { hour: 1, minute: 30 });
    assert.equal(repeatedHourSchedules.length, 1);
    assert.equal(isMedicationTimeInQuietHours('01:30', '01:00', '02:00'), true);
    assert.equal(isMedicationTimeInQuietHours('02:00', '01:00', '02:00'), false);
  });
});

describe('daily medication triggers in fractional-offset timezones', () => {
  const cases = [
    {
      timezone: 'Asia/Kolkata',
      utcTime: '2026-01-15T01:45:00.000Z',
      localTime: '07:15',
    },
    {
      timezone: 'Asia/Kathmandu',
      utcTime: '2026-01-15T01:30:00.000Z',
      localTime: '07:15',
    },
  ];

  it('keeps the configured local hour and minute in half-hour and 45-minute offsets', () => {
    for (const { timezone, utcTime, localTime } of cases) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });

      assert.deepEqual(medicationDailyTrigger(localTime), { hour: 7, minute: 15 });
      assert.equal(formatter.format(new Date(utcTime)), localTime);
    }
  });

  it('preserves overnight quiet-hour boundaries when the device timezone has a fractional offset', () => {
    const settings = {
      medications: true,
      tasks: false,
      events: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:00',
      timezone: 'UTC',
    };

    for (const { timezone } of cases) {
      const reconciled = reconcileReminderTimezone(settings, timezone);

      assert.equal(reconciled?.timezone, timezone);
      assert.equal(reconciled?.quietHoursStart, '22:00');
      assert.equal(reconciled?.quietHoursEnd, '06:00');
      assert.equal(isMedicationTimeInQuietHours('21:59', '22:00', '06:00'), false);
      assert.equal(isMedicationTimeInQuietHours('22:00', '22:00', '06:00'), true);
      assert.equal(isMedicationTimeInQuietHours('05:59', '22:00', '06:00'), true);
      assert.equal(isMedicationTimeInQuietHours('06:00', '22:00', '06:00'), false);
    }
  });
});