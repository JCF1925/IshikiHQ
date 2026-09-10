// Minimal RFC 5545 iCalendar builder for the Ishiki calendar feed.

function pad(n: number) { return n < 10 ? `0${n}` : `${n}` }

function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function toIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

function escapeText(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold long lines to 75 octets per RFC 5545.
function fold(line: string): string {
  if (line.length <= 74) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 74))
  rest = rest.slice(74)
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73))
    rest = rest.slice(73)
  }
  if (rest.length) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export type IcsEvent = {
  id: string
  title: string
  startDatetime: string | Date
  endDatetime?: string | Date | null
  allDay?: boolean
  location?: string | null
  notes?: string | null
  isOnline?: boolean
}

export function buildIcs(events: IcsEvent[], calName = 'Ishiki'): string {
  const now = new Date()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ishiki//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    'X-WR-TIMEZONE:Australia/Sydney',
  ]

  for (const e of events) {
    const start = new Date(e.startDatetime)
    if (isNaN(start.getTime())) continue
    lines.push('BEGIN:VEVENT')
    lines.push(fold(`UID:${e.id}@syntropic`))
    lines.push(`DTSTAMP:${toIcsUtc(now)}`)
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(start)}`)
      const end = e.endDatetime ? new Date(e.endDatetime) : new Date(start.getTime() + 86400000)
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(end)}`)
    } else {
      lines.push(`DTSTART:${toIcsUtc(start)}`)
      const end = e.endDatetime ? new Date(e.endDatetime) : new Date(start.getTime() + 3600000)
      lines.push(`DTEND:${toIcsUtc(end)}`)
    }
    lines.push(fold(`SUMMARY:${escapeText(e.title)}`))
    if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location)}`))
    const descParts: string[] = []
    if (e.isOnline) descParts.push('Online')
    if (e.notes) descParts.push(e.notes)
    if (descParts.length) lines.push(fold(`DESCRIPTION:${escapeText(descParts.join(' — '))}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
