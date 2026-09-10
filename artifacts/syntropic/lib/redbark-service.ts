import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { assertRedbarkGates, nextSyncRetry, preserveUserOverride, providerObservationHash, reconciliationIdentity, sourceIdempotencyKey, type ProviderTransaction } from '@/lib/automation-beta'
import { getRedbarkAdapter } from '@/lib/redbark-provider'

export async function requireRedbarkGates(userId: string) {
  const attestations = await prisma.redbarkGateAttestation.findMany({ where: { userId } })
  assertRedbarkGates(attestations)
  return Object.fromEntries(attestations.map((item) => [item.gate, item.contractValue!]))
}

export function assertProviderTransaction(input: ProviderTransaction) {
  if (!input.providerTransactionId?.trim() || !['pending', 'posted'].includes(input.status) ||
    !input.currency?.trim() || !Number.isFinite(Number(input.amount)) || Number.isNaN(new Date(input.date).getTime())) {
    throw new Error('Invalid provider transaction')
  }
}

type IngestInput = { accountId: string; providerAccountId: string; transaction: ProviderTransaction }

/** All writes are made using the caller's transaction, allowing webhook pages
 * and batches to be all-or-nothing. A source row is immutable: repeat
 * observations update only its linked, user-override-preserving projection. */
async function ingestInTransaction(tx: Prisma.TransactionClient, input: {
  userId: string; connectionId: string; account: { id: string; finAccountId: string | null }; event: IngestInput
}) {
  const { event } = input
  const key = sourceIdempotencyKey(input.connectionId, input.account.id, event.transaction)
  const existing = await tx.redbarkSourceTransaction.findUnique({
    where: { idempotencyKey: key },
    include: {
      transaction: true,
      observations: { orderBy: { receivedAt: 'desc' }, take: 1 },
    },
  })
  const amount = Number(event.transaction.amount)
  const date = new Date(event.transaction.date)
  const providerData = {
    date, amount, currency: event.transaction.currency,
    merchant: event.transaction.merchant ?? null, description: event.transaction.description ?? null,
  }
  if (existing) {
    const priorObservation = existing.observations[0]
    const priorProvider = priorObservation
      ? {
          date: priorObservation.providerDate,
          amount: priorObservation.providerAmount,
          currency: priorObservation.providerCurrency,
          merchant: priorObservation.providerMerchant,
          description: priorObservation.providerDescription,
        }
      : {
          date: existing.providerDate,
          amount: existing.providerAmount,
          currency: existing.providerCurrency,
          merchant: existing.providerMerchant,
          description: existing.providerDescription,
        }
    const ledger = await tx.transaction.update({
      where: { id: existing.transactionId },
      data: {
        date: preserveUserOverride(existing.transaction.date.toISOString().slice(0, 10), priorProvider.date.slice(0, 10), date.toISOString().slice(0, 10)) === date.toISOString().slice(0, 10) ? date : undefined,
        amount: preserveUserOverride(existing.transaction.amount, Number(priorProvider.amount), amount),
        currency: preserveUserOverride(existing.transaction.currency, priorProvider.currency, event.transaction.currency),
        merchant: preserveUserOverride(existing.transaction.merchant, priorProvider.merchant, providerData.merchant),
        description: preserveUserOverride(existing.transaction.description, priorProvider.description, providerData.description),
      },
    })
    await tx.redbarkSourceObservation.createMany({
      data: [{
        sourceTransactionId: existing.id, observationHash: providerObservationHash(event.transaction),
        providerStatus: event.transaction.status, providerAmount: event.transaction.amount,
        providerCurrency: event.transaction.currency, providerDate: event.transaction.date,
        providerMerchant: providerData.merchant, providerDescription: providerData.description,
        rawPayload: event.transaction.raw as any,
      }],
      skipDuplicates: true,
    })
    return { transactionId: ledger.id, sourceId: existing.id, created: false }
  }
  const identity = reconciliationIdentity(event.transaction)
  const pending = event.transaction.status === 'posted'
    ? await tx.redbarkSourceTransaction.findFirst({
        where: { connectionId: input.connectionId, redbarkAccountId: input.account.id, reconciliationKey: identity, providerStatus: 'pending' },
        orderBy: { receivedAt: 'desc' },
        include: {
          transaction: true,
          observations: { orderBy: { receivedAt: 'desc' }, take: 1 },
        },
      })
    : null
  const pendingObservation = pending?.observations[0]
  const pendingProvider = pending
    ? pendingObservation
      ? {
          date: pendingObservation.providerDate,
          amount: pendingObservation.providerAmount,
          currency: pendingObservation.providerCurrency,
          merchant: pendingObservation.providerMerchant,
          description: pendingObservation.providerDescription,
        }
      : {
          date: pending.providerDate,
          amount: pending.providerAmount,
          currency: pending.providerCurrency,
          merchant: pending.providerMerchant,
          description: pending.providerDescription,
        }
    : null
  const ledger = pending
    ? await tx.transaction.update({
        where: { id: pending.transactionId },
        data: {
          date: preserveUserOverride(pending.transaction.date.toISOString().slice(0, 10), pendingProvider!.date.slice(0, 10), date.toISOString().slice(0, 10)) === date.toISOString().slice(0, 10) ? date : undefined,
          amount: preserveUserOverride(pending.transaction.amount, Number(pendingProvider!.amount), amount),
          currency: preserveUserOverride(pending.transaction.currency, pendingProvider!.currency, event.transaction.currency),
          merchant: preserveUserOverride(pending.transaction.merchant, pendingProvider!.merchant, providerData.merchant),
          description: preserveUserOverride(pending.transaction.description, pendingProvider!.description, providerData.description),
        },
      })
    : await tx.transaction.create({
        data: { userId: input.userId, accountId: input.account.finAccountId, ...providerData, status: 'pending', tags: [] },
      })
  const source = await tx.redbarkSourceTransaction.create({
    data: {
      connectionId: input.connectionId, redbarkAccountId: input.account.id, transactionId: ledger.id, idempotencyKey: key,
      providerTransactionId: event.transaction.providerTransactionId, reconciliationKey: identity, providerStatus: event.transaction.status,
      providerAmount: event.transaction.amount, providerCurrency: event.transaction.currency, providerDate: event.transaction.date,
      providerMerchant: providerData.merchant, providerDescription: providerData.description, rawPayload: event.transaction.raw as any,
    },
  })
  await tx.redbarkSourceObservation.create({
    data: {
      sourceTransactionId: source.id, observationHash: providerObservationHash(event.transaction),
      providerStatus: event.transaction.status, providerAmount: event.transaction.amount,
      providerCurrency: event.transaction.currency, providerDate: event.transaction.date,
      providerMerchant: providerData.merchant, providerDescription: providerData.description,
      rawPayload: event.transaction.raw as any,
    },
  })
  return { transactionId: ledger.id, sourceId: source.id, created: true }
}

export async function ingestRedbarkBatch(input: { userId: string; connectionId: string; events: IngestInput[] }) {
  await requireRedbarkGates(input.userId)
  input.events.forEach((event) => assertProviderTransaction(event.transaction))
  return prisma.$transaction(async (tx) => {
    const connection = await tx.redbarkConnection.findFirst({ where: { id: input.connectionId, userId: input.userId, status: 'active' } })
    if (!connection) throw new Error('Active Redbark connection not found')
    const providerAccountIds = [...new Set(input.events.map((event) => event.providerAccountId))]
    const accounts = await tx.redbarkAccount.findMany({ where: { connectionId: input.connectionId, providerAccountId: { in: providerAccountIds } } })
    const byProviderId = new Map(accounts.map((account) => [account.providerAccountId, account]))
    if (byProviderId.size !== providerAccountIds.length) throw new Error('Webhook or sync references an unknown account')
    const results = []
    for (const event of input.events) results.push(await ingestInTransaction(tx, {
      userId: input.userId, connectionId: input.connectionId, account: byProviderId.get(event.providerAccountId)!, event,
    }))
    return results
  })
}

export async function ingestRedbarkTransaction(input: { userId: string; connectionId: string; accountId: string; providerAccountId: string; transaction: ProviderTransaction }) {
  const results = await ingestRedbarkBatch({ userId: input.userId, connectionId: input.connectionId, events: [input] })
  return results[0]
}

export async function runRedbarkSyncJob(input: { userId: string; connectionId: string; jobId: string }) {
  const claimed = await prisma.redbarkSyncJob.updateMany({
    where: {
      id: input.jobId,
      connectionId: input.connectionId,
      OR: [
        { status: 'queued' },
        { status: 'retrying', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] },
      ],
    },
    data: { status: 'running', startedAt: new Date(), attemptCount: { increment: 1 }, failureCode: null, failureMessage: null },
  })
  if (!claimed.count) return
  try {
    const gates = await requireRedbarkGates(input.userId)
    const connection = await prisma.redbarkConnection.findFirst({
      where: { id: input.connectionId, userId: input.userId, status: { in: ['active', 'outage'] } },
      include: { consents: { where: { revokedAt: null }, orderBy: { expiresAt: 'desc' }, take: 1 } },
    })
    if (!connection?.credentialReference || !connection.apiVersion) throw new Error('Active Redbark connection contract is incomplete')
    const consent = connection.consents[0]
    if (!consent || consent.expiresAt <= new Date()) {
      await prisma.$transaction([
        prisma.redbarkConnection.update({ where: { id: input.connectionId }, data: { status: 'consent_expired' } }),
        prisma.redbarkSyncJob.update({
          where: { id: input.jobId },
          data: {
            status: 'failed',
            failureCode: 'CONSENT_EXPIRED',
            failureMessage: 'Redbark consent has expired',
            completedAt: new Date(),
          },
        }),
      ])
      return
    }
    const adapter = getRedbarkAdapter({ apiVersion: connection.apiVersion, sandbox: true, gateValues: gates, credentialReference: connection.credentialReference })
    const accounts = await prisma.redbarkAccount.findMany({ where: { connectionId: input.connectionId } })
    let processed = 0
    for (const account of accounts) {
      let cursor: string | null = null
      const seenCursors = new Set<string>()
      do {
        const page = await adapter.listTransactions(account.providerAccountId, cursor)
        page.transactions.forEach(assertProviderTransaction)
        await ingestRedbarkBatch({
          userId: input.userId, connectionId: input.connectionId,
          events: page.transactions.map((transaction) => ({ accountId: account.id, providerAccountId: account.providerAccountId, transaction })),
        })
        processed += page.transactions.length
        cursor = page.nextCursor
        if (cursor && (seenCursors.has(cursor) || seenCursors.size > 10_000)) throw new Error('Provider pagination cursor repeated or exceeded safety limit')
        if (cursor) seenCursors.add(cursor)
        await prisma.redbarkSyncJob.update({ where: { id: input.jobId }, data: { progressCurrent: processed, cursor } })
      } while (cursor)
    }
    await prisma.$transaction([
      prisma.redbarkSyncJob.update({ where: { id: input.jobId }, data: { status: 'succeeded', completedAt: new Date(), cursor: null } }),
      prisma.redbarkConnection.update({ where: { id: input.connectionId }, data: { status: 'active', lastSyncedAt: new Date(), lastError: null } }),
    ])
  } catch (error: any) {
    const job = await prisma.redbarkSyncJob.findUniqueOrThrow({ where: { id: input.jobId } })
    const retry = nextSyncRetry(job.attemptCount, job.maxAttempts)
    const deadLetter = retry.status === 'dead_letter'
    await prisma.$transaction([
      prisma.redbarkSyncJob.update({ where: { id: input.jobId }, data: {
        status: retry.status, failureCode: 'SYNC_FAILED',
        failureMessage: error?.message ?? 'Redbark sync failed',
        nextRetryAt: retry.nextRetryAt,
        completedAt: deadLetter ? new Date() : null,
      } }),
      prisma.redbarkConnection.update({ where: { id: input.connectionId }, data: { status: 'outage', lastError: error?.message ?? 'Redbark sync failed' } }),
    ])
  }
}

/** Recover interrupted work and execute due jobs without requiring a browser
 * request. The compare-and-set claim inside runRedbarkSyncJob prevents two
 * worker processes from executing the same job concurrently. */
export async function processDueRedbarkSyncJobs(batchSize = 10, now = new Date()) {
  const staleCutoff = new Date(now.getTime() - 5 * 60_000)
  await prisma.redbarkSyncJob.updateMany({
    where: { status: 'running', startedAt: { lt: staleCutoff } },
    data: {
      status: 'retrying',
      nextRetryAt: now,
      failureCode: 'WORKER_INTERRUPTED',
      failureMessage: 'A prior sync worker stopped before completion; retrying safely',
    },
  })
  const due = await prisma.redbarkSyncJob.findMany({
    where: {
      connection: { status: { in: ['active', 'outage'] } },
      OR: [
        { status: 'queued' },
        { status: 'retrying', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
      ],
    },
    include: { connection: { select: { userId: true } } },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(batchSize, 100)),
  })
  for (const job of due) {
    await runRedbarkSyncJob({
      userId: job.connection.userId,
      connectionId: job.connectionId,
      jobId: job.id,
    })
  }
  const statuses = due.length
    ? await prisma.redbarkSyncJob.findMany({
        where: { id: { in: due.map(job => job.id) } },
        select: { status: true },
      })
    : []
  return {
    processed: due.length,
    succeeded: statuses.filter(job => job.status === 'succeeded').length,
    retrying: statuses.filter(job => job.status === 'retrying').length,
    deadLettered: statuses.filter(job => job.status === 'dead_letter').length,
    failed: statuses.filter(job => job.status === 'failed').length,
  }
}
