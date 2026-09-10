import { PrismaClient } from '@prisma/client'
import {
  isHealthClaimOwnershipViolation,
  reportHealthClaimOwnershipViolation,
} from './health-claim-alerting'

function createPrisma() {
  const client = new PrismaClient()
  client.$use(async (params, next) => {
    try {
      return await next(params)
    } catch (error) {
      if (
        params.model === 'HealthClaimImportAudit'
        && (params.action === 'create' || params.action === 'createMany')
        && isHealthClaimOwnershipViolation(error)
      ) {
        void reportHealthClaimOwnershipViolation(client)
      }
      throw error
    }
  })
  return client
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
