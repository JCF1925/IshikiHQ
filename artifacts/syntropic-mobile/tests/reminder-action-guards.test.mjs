import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimNotificationResponse,
  medicationDoseRequestIdentity,
  runMedicationDoseOnce,
} from '../lib/reminder-action-guards.ts';

describe('reminder action duplicate guards', () => {
  it('routes once when cold-start hydration and the live listener deliver the same response', () => {
    const handledNotificationIds = new Set();
    let routes = 0;
    const openResponse = (notificationId) => {
      if (!claimNotificationResponse(handledNotificationIds, notificationId)) return;
      routes += 1;
    };

    openResponse('notification-123');
    openResponse('notification-123');

    assert.equal(routes, 1);
  });

  it('keeps recent duplicates blocked while evicting the oldest identifiers at the bound', () => {
    const handledNotificationIds = new Set();

    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-old', 2), true);
    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-recent', 2), true);
    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-recent', 2), false);

    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-new', 2), true);
    assert.equal(handledNotificationIds.size, 2);
    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-recent', 2), false);
    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-new', 2), false);
    assert.equal(claimNotificationResponse(handledNotificationIds, 'notification-old', 2), true);
  });

  it('shares one dose idempotency key across rapid repeated taps and submits once', async () => {
    const activeDoseKeys = new Set();
    const doseKey = 'schedule-123:2026-09-09:08:30';
    const identities = [];
    let releaseSubmission;
    const pendingSubmission = new Promise((resolve) => {
      releaseSubmission = resolve;
    });
    const submit = async () => {
      identities.push(medicationDoseRequestIdentity(doseKey));
      await pendingSubmission;
    };

    const firstTap = runMedicationDoseOnce(activeDoseKeys, doseKey, submit);
    const secondTap = runMedicationDoseOnce(activeDoseKeys, doseKey, submit);
    releaseSubmission();

    assert.equal(await firstTap, true);
    assert.equal(await secondTap, false);
    assert.deepEqual(identities, [{
      clientId: `medication-dose:${doseKey}`,
      idempotencyKey: `medication-reminder:${doseKey}`,
    }]);
  });
});