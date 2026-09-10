import type { ProviderTransaction } from './automation-beta'

/**
 * Contract-only provider boundary. No Redbark URL, payload shape, or signature
 * algorithm is assumed. A production adapter must be supplied only after every
 * gate has documented contract configuration.
 */
export type RedbarkPage = {
  transactions: ProviderTransaction[]
  nextCursor: string | null
}

export interface RedbarkAdapter {
  readonly apiVersion: string
  readonly sandbox: boolean
  listTransactions(providerAccountId: string, cursor: string | null): Promise<RedbarkPage>
  verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<boolean>
  parseWebhook(rawBody: Uint8Array): Promise<Array<{ providerAccountId: string; transaction: ProviderTransaction }>>
  revokeConnection(providerConnectionId: string): Promise<void>
}

export type RedbarkAdapterFactory = (contract: {
  apiVersion: string
  sandbox: true
  gateValues: Record<string, string>
  credentialReference: string
}) => RedbarkAdapter

let configuredFactory: RedbarkAdapterFactory | null = null

export function configureRedbarkAdapter(factory: RedbarkAdapterFactory) {
  configuredFactory = factory
}

export function getRedbarkAdapter(contract: Parameters<RedbarkAdapterFactory>[0]) {
  if (!configuredFactory) throw new Error('Redbark adapter is not configured; refusing provider access')
  const adapter = configuredFactory(contract)
  if (!adapter.sandbox || adapter.apiVersion !== contract.apiVersion) {
    throw new Error('Redbark adapter does not match the attested sandbox/API contract')
  }
  return adapter
}