export const dynamic = "force-dynamic";
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { assertOwnedFinAccount, OwnershipError } from '@/lib/domain'
import { csvImportSchema } from '@/lib/validation'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const userId = (session.user as any).id

  try {
    const parsed = await parseBody(request, csvImportSchema)
    if (!parsed.success) return parsed.response
    const { rows, columnMap, fileName, accountId } = parsed.data
    try {
      await assertOwnedFinAccount(userId, accountId)
    } catch (error) {
      if (error instanceof OwnershipError) return apiError('NOT_FOUND', 'Account not found', 404)
      throw error
    }

    const dateCol = columnMap?.date ?? 'date'
    const amountCol = columnMap?.amount ?? 'amount'
    const merchantCol = columnMap?.merchant ?? 'merchant'
    const descCol = columnMap?.description ?? 'description'
    const categoryCol = columnMap?.category ?? 'category'

    const errors: string[] = []
    const transactionRows: Array<any> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const dateVal = row[dateCol]
        const amountVal = row[amountCol]
        if (!dateVal || amountVal === undefined) {
          errors.push(`Row ${i + 1}: missing date or amount`)
          continue
        }

        const date = new Date(String(dateVal))
        const amount = Number(String(amountVal).replace(/[^\d.-]/g, ''))
        if (Number.isNaN(date.getTime()) || !Number.isFinite(amount)) throw new Error('invalid date or amount')
        transactionRows.push({ userId, date, amount, merchant: row[merchantCol] || null, description: row[descCol] || null, category: row[categoryCol] || null, accountId: accountId ?? null, status: 'pending', tags: [] })
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e?.message ?? 'unknown error'}`)
      }
    }

    if (errors.length) return apiError('VALIDATION_ERROR', 'CSV contains invalid rows; nothing was imported', 400, { errors })
    const csvImport = await prisma.$transaction(async (tx) => {
      const record = await tx.csvImport.create({ data: { userId, fileName: fileName ?? 'import.csv', rowCount: rows.length, columnMap: JSON.stringify(columnMap), status: 'processing' } })
      await tx.transaction.createMany({ data: transactionRows.map((row) => ({ ...row, csvImportId: record.id })) })
      return tx.csvImport.update({ where: { id: record.id }, data: { status: 'completed', errors: null } })
    })

    return apiSuccess({ importId: csvImport.id, imported: transactionRows.length, total: rows.length, errors: [] })
  } catch (error: any) {
    console.error('CSV import error:', error)
    return apiError('INTERNAL_ERROR', 'Import failed', 500)
  }
}
