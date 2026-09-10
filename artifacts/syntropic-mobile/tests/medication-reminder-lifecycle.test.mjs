import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { subscribeMedicationReminderForegroundRefresh } from '../lib/medication-reminder-lifecycle.ts';

describe('medication reminder foreground lifecycle', () => {
  it('runs one rescheduling pass for one active transition', async () => {
    let listener;
    let registrations = 0;
    let removals = 0;
    let refreshes = 0;
    const appState = {
      addEventListener(_event, nextListener) {
        registrations += 1;
        listener = nextListener;
        return { remove: () => { removals += 1; } };
      },
    };

    const unsubscribe = subscribeMedicationReminderForegroundRefresh(
      appState,
      true,
      async () => { refreshes += 1; },
    );
    listener('background');
    listener('active');
    await Promise.resolve();

    assert.equal(registrations, 1);
    assert.equal(refreshes, 1);
    unsubscribe();
    assert.equal(removals, 1);
  });

  it('does not register while signed out', () => {
    let registrations = 0;
    const appState = {
      addEventListener() {
        registrations += 1;
        return { remove() {} };
      },
    };

    subscribeMedicationReminderForegroundRefresh(appState, false, async () => undefined);
    assert.equal(registrations, 0);
  });
});