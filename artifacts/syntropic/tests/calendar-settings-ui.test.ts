import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const eventsSource = readFileSync(new URL('../app/(app)/events/events-client.tsx', import.meta.url), 'utf8')
const conflictsRouteSource = readFileSync(new URL('../app/api/calendar/conflicts/route.ts', import.meta.url), 'utf8')

describe('calendar settings and conflict UI acceptance contract', () => {
  it('renders controlled direction and event-type scope choices before saving', () => {
    assert.match(eventsSource, /value=\{draft\.direction\}/)
    assert.match(eventsSource, /CALENDAR_SYNC_DIRECTIONS\.map/)
    assert.match(eventsSource, /Event type scope/)
    assert.match(eventsSource, /CALENDAR_SYNC_EVENT_TYPES\.map/)
    assert.match(eventsSource, /Review &amp; save settings/)
  })

  it('returns and renders both safe conflict snapshots before enabling resolution', () => {
    assert.match(conflictsRouteSource, /localSnapshot: calendarConflictSnapshotForDisplay\(localVersion\)/)
    assert.match(conflictsRouteSource, /providerSnapshot: calendarConflictSnapshotForDisplay\(providerVersion\)/)
    assert.match(eventsSource, /label="Ishiki version" snapshot=\{conflict\.localSnapshot\}/)
    assert.match(eventsSource, /label="Provider version" snapshot=\{conflict\.providerSnapshot\}/)
    assert.match(eventsSource, /!conflict\.providerSnapshot\?\.available/)
  })
})