import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const eventsSource = readFileSync(new URL('../app/(app)/events/events-client.tsx', import.meta.url), 'utf8')
const settingsRouteSource = readFileSync(new URL('../app/api/calendar/connections/[id]/settings/route.ts', import.meta.url), 'utf8')

describe('removed provider calendar recovery contract', () => {
  it('identifies a saved target that is no longer in the provider calendar list', () => {
    assert.match(eventsSource, /Saved provider calendar unavailable/)
    assert.match(eventsSource, /Select a replacement below/)
    assert.match(eventsSource, /calendarListStatus\[connection\.id\] === 'loaded'/)
    assert.match(eventsSource, /!availableCalendars\.some\(\(calendar: any\) => calendar\.id === savedTarget\.externalCalendarId\)/)
  })

  it('only allows an available provider calendar to be saved while preserving the draft scope', () => {
    assert.match(eventsSource, /disabled=\{calendar\.unavailable\}/)
    assert.match(eventsSource, /Select an available provider calendar/)
    assert.match(eventsSource, /const selection = calendarSyncSelection\(draft\.direction, draft\.eventTypes\)/)
    assert.match(eventsSource, /calendarName: connectionCalendars\[connectionId\]\?\.find/)
  })

  it('keeps opaque provider and connection identifiers out of rendered confirmation details', () => {
    assert.match(eventsSource, /activationPreviewForDisplay\(activationConfirmation\.preview\)/)
    assert.match(eventsSource, /calendarName: destination\.calendarName \|\| 'Selected Google calendar'/)
    assert.match(settingsRouteSource, /function publicSetting/)
    assert.match(settingsRouteSource, /settings: c\.settings\.map\(publicSetting\)/)
    assert.match(settingsRouteSource, /setting: publicSetting\(saved\)/)
  })
})