import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'

function pdfObject(id: number, body: Buffer | string) {
  return Buffer.concat([
    Buffer.from(`${id} 0 obj\n`, 'ascii'),
    typeof body === 'string' ? Buffer.from(body, 'ascii') : body,
    Buffer.from('\nendobj\n', 'ascii'),
  ])
}

function buildPdf(content: string) {
  const compressed = deflateSync(Buffer.from(content, 'ascii'))
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),
    pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    pdfObject(5, Buffer.concat([
      Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, 'ascii'),
      compressed,
      Buffer.from('\nendstream', 'ascii'),
    ])),
  ]
  const header = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')
  const offsets: number[] = []
  let offset = header.length
  for (const object of objects) {
    offsets.push(offset)
    offset += object.length
  }
  const xrefOffset = offset
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n')
  return Buffer.concat([header, ...objects, Buffer.from(xref, 'ascii')])
}

type ScannedStatementRow = {
  values: string[]
  y: number
}

function renderScannedStatement(
  title: string,
  headers: string[],
  rows: ScannedStatementRow[],
  options: { lowQuality?: boolean } = {},
) {
  const columnX = headers.map((_, index) => 70 + index * 300)
  const text = [
    `<text x="70" y="90" class="title">${title}</text>`,
    ...headers.map((header, index) => `<text x="${columnX[index]}" y="155" class="header">${header}</text>`),
    ...rows.flatMap((row) => row.values.map((value, index) => (
      `<text x="${columnX[index]}" y="${row.y}" class="value">${value}</text>`
    ))),
    ...(options.lowQuality ? [
      '<text x="70" y="20" class="scanArtifact">QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ</text>',
      '<text x="70" y="35" class="scanArtifact">QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ</text>',
      '<text x="70" y="50" class="scanArtifact">QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ</text>',
      '<text x="70" y="65" class="scanArtifact">QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ QZXJ</text>',
    ] : []),
  ].join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="900" viewBox="0 0 2200 900">
    <rect width="2200" height="900" fill="white"/>
    <style>
      text { font-family: "DejaVu Sans"; fill: #111; }
      .title { font-size: 34px; font-weight: bold; }
      .header { font-size: 20px; font-weight: bold; }
      .value { font-size: 22px; }
      .scanArtifact { font-size: 15px; fill: #111; letter-spacing: 3px; }
    </style>
    ${text}
  </svg>`
  const args = ['svg:-', '-background', 'white', '-flatten']
  if (options.lowQuality) args.push('-blur', '0x0.7', '-level', '6%,94%', '-quality', '8')
  else args.push('-quality', '78')
  args.push('jpg:-')
  return execFileSync('magick', args, { input: svg })
}

function buildImageOnlyPdf(image: Buffer, width: number, height: number) {
  const pageWidth = 792
  const pageHeight = Math.round(pageWidth * height / width)
  const imageObject = Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`, 'ascii'),
    image,
    Buffer.from('\nendstream', 'ascii'),
  ])
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    pdfObject(4, imageObject),
    pdfObject(5, Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`, 'ascii'),
    ])),
  ]
  const header = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')
  const offsets: number[] = []
  let offset = header.length
  for (const object of objects) {
    offsets.push(offset)
    offset += object.length
  }
  const xrefOffset = offset
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n')
  return Buffer.concat([header, ...objects, Buffer.from(xref, 'ascii')])
}

export function compressedMedicareStatementPdf() {
  return buildPdf([
    'BT',
    '/F1 10 Tf',
    '72 720 Td',
    '(Date of service|Item number|Service|Provider|Schedule fee|Patient fee|Medicare benefit) Tj',
    '0 -18 Td',
    '(09/09/2026|24|Optometry|Vision Clinic|$80.00|$80.00|$30.00) Tj',
    'ET',
  ].join('\n'))
}

export function imageOnlyMedicareStatementPdf() {
  return buildPdf('')
}

export function wideScannedMedicareStatementPdf() {
  const headers = ['DATE OF SERVICE', 'ITEM NUMBER', 'SERVICE', 'PROVIDER', 'SCHEDULE FEE', 'PATIENT FEE', 'MEDICARE BENEFIT']
  const image = renderScannedStatement('MEDICARE CLAIMS STATEMENT', headers, [
    { y: 230, values: ['08/09/2026', '24', 'OPTOMETRY', 'NORTH CLINIC', '$80.00', '$80.00', '$30.00'] },
    { y: 300, values: ['09/09/2026', '36', 'DENTAL EXAM', 'SOUTH CLINIC', '$120.00', '$120.00', '$50.00'] },
  ])
  return buildImageOnlyPdf(image, 2200, 900)
}

export function compactScannedMedicareStatementPdf() {
  const headers = ['DATE', 'PROVIDER', 'ITEM', 'DESCRIPTION', 'AMOUNT CHARGED', 'BENEFIT']
  const image = renderScannedStatement('MEDICARE BENEFIT DETAIL', headers, [
    { y: 230, values: ['10/09/2026', 'EAST CLINIC', '44', 'PHYSIO REVIEW', '$200.00', '$100.00'] },
    { y: 300, values: ['11/09/2026', 'WEST CLINIC', '55', 'EYE TEST', '$90.00', '$35.00'] },
  ])
  return buildImageOnlyPdf(image, 2200, 900)
}

export function lowQualityScannedMedicareStatementPdf() {
  const headers = ['DATE OF SERVICE', 'SERVICE', 'PROVIDER', 'ITEM NUMBER', 'BENEFIT PAID']
  const image = renderScannedStatement('MEDICARE CLAIMS', headers, [
    { y: 230, values: ['12/09/2026', 'GP VISIT', 'LOW CARE', '3', '$40.00'] },
    { y: 300, values: ['13/09/2026', 'PATHOLOGY', 'LOW CARE', '7', '$18.00'] },
  ], { lowQuality: true })
  return buildImageOnlyPdf(image, 2200, 900)
}
