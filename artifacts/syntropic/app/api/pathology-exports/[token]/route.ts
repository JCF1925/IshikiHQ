export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError } from '@/lib/api'
import { sha256 } from '@/lib/pathology'

function escapePdf(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, ' ')
}

function simplePdf(value: unknown) {
  const lines = JSON.stringify(value, null, 2).split('\n').flatMap((line) => line.length ? Array.from({ length: Math.ceil(line.length / 100) }, (_, index) => line.slice(index * 100, (index + 1) * 100)) : [''])
  const pages = Array.from({ length: Math.ceil(lines.length / 55) }, (_, index) => lines.slice(index * 55, (index + 1) * 55))
  const fontId = 3 + pages.length * 2
  const pageIds = pages.map((_, index) => 3 + index * 2)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ]
  pages.forEach((page, index) => {
    const contentId = 4 + index * 2
    const stream = `BT /F1 8 Tf 40 800 Td 10 TL ${page.map((line, lineIndex) => `${lineIndex ? 'T* ' : ''}(${escapePdf(line)}) Tj`).join(' ')} ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body)
}

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Unauthorized', 401)
  const { token } = await context.params
  const userId = (session.user as any).id
  const now = new Date()
  const record = await prisma.pathologyExport.findFirst({
    where: { tokenHash: sha256(token), userId, consumedAt: null, expiresAt: { gt: now }, report: { retentionState: 'retained', status: 'confirmed' } },
    include: { report: { select: { fileName: true } } },
  })
  if (!record) return apiError('NOT_FOUND', 'Export link is invalid, expired, or already used', 404)
  const claim = await prisma.pathologyExport.updateMany({ where: { id: record.id, userId, consumedAt: null, expiresAt: { gt: now }, report: { retentionState: 'retained', status: 'confirmed' } }, data: { consumedAt: now } })
  if (claim.count !== 1) return apiError('NOT_FOUND', 'Export link is invalid, expired, or already used', 404)
  const isPdf = record.format === 'pdf'
  const body = isPdf ? Uint8Array.from(simplePdf(record.selection)) : JSON.stringify(record.selection, null, 2)
  const stem = record.report.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  return new Response(body, { headers: {
    'Content-Type': isPdf ? 'application/pdf' : 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${stem}-selected.${isPdf ? 'pdf' : 'json'}"`,
    'Cache-Control': 'no-store, private',
  } })
}