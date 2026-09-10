import { prisma } from '../lib/db.ts'
import {
  checkHealthClaimImportOwnership,
  formatHealthClaimOwnershipReport,
} from '../lib/health-claims-integrity.ts'

async function main() {
  try {
    const result = await checkHealthClaimImportOwnership(prisma)
    const report = formatHealthClaimOwnershipReport(result)

    if (result.mismatchedRows > 0) {
      console.error(report)
      process.exitCode = 1
    } else {
      console.log(report)
    }
  } catch {
    console.error('Health claim import ownership check: ERROR (read-only query could not complete; release blocked)')
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

void main()