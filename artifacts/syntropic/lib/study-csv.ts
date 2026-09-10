export type ParsedStudyCsv = {
  headers: string[]
  rows: Record<string, string>[]
  error?: string
}

export function parseStudyCsv(text: string): ParsedStudyCsv {
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character === '"' && quoted && text[index + 1] === '"') index++
    else if (character === '"') quoted = !quoted
  }
  if (quoted) return { headers: [], rows: [], error: 'A quoted field is not closed. Check the final quotation mark.' }

  const rows: string[][] = [[]]
  let cell = ''
  for (let index = 0; index <= text.length; index++) {
    const character = text[index] ?? '\n'
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"'
      index++
    } else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) {
      rows.at(-1)!.push(cell.trim())
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++
      rows.at(-1)!.push(cell.trim())
      cell = ''
      if (rows.at(-1)!.some(Boolean)) rows.push([])
      else rows[rows.length - 1] = []
    } else cell += character
  }

  const populated = rows.filter((row) => row.some(Boolean))
  if (populated.length < 2) return { headers: populated[0] ?? [], rows: [], error: 'Add a header row and at least one unit row.' }
  const headers = populated[0]
  if (headers.some((header) => !header)) return { headers, rows: [], error: 'Every CSV column needs a header.' }
  if (new Set(headers).size !== headers.length) return { headers, rows: [], error: 'CSV headers must be unique.' }
  const dataRows = populated.slice(1)
  const wideRow = dataRows.findIndex((row) => row.length > headers.length)
  if (wideRow >= 0) return { headers, rows: [], error: `Row ${wideRow + 1} has more values than the header row.` }
  return {
    headers,
    rows: dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))),
  }
}