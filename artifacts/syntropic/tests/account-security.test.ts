import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectPortableAccountData,
  healthClaimOwnerWhere,
  healthClaimReportScope,
  healthClaimReportWhere,
  hasRecentAuthentication,
} from '../lib/account-security.ts'
import { privateUploadSchema } from '../lib/validation.ts'

const validUpload = {
  fileName: 'receipt.pdf',
  contentType: 'application/pdf',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}

describe('account and generic upload hardening', () => {
  it('accepts bounded private upload declarations', () => {
    assert.equal(privateUploadSchema.safeParse(validUpload).success, true)
  })

  it('rejects traversal, extension mismatches, unsupported types, and invalid sizes', () => {
    assert.equal(privateUploadSchema.safeParse({ ...validUpload, fileName: '../receipt.pdf' }).success, false)
    assert.equal(privateUploadSchema.safeParse({ ...validUpload, fileName: 'receipt.png' }).success, false)
    assert.equal(privateUploadSchema.safeParse({ ...validUpload, contentType: 'image/svg+xml' }).success, false)
    assert.equal(privateUploadSchema.safeParse({ ...validUpload, byteSize: 25 * 1024 * 1024 + 1 }).success, false)
    assert.equal(privateUploadSchema.safeParse({ ...validUpload, unexpected: true }).success, false)
  })

  it('requires authentication within the bounded step-up window', () => {
    assert.equal(hasRecentAuthentication(1_000, 1_599), true)
    assert.equal(hasRecentAuthentication(1_000, 1_601), false)
    assert.equal(hasRecentAuthentication(undefined, 1_000), false)
    assert.equal(hasRecentAuthentication(1_031, 1_000), false)
  })

  it('provides an owner-and-live-record scope for health-claim reports', () => {
    assert.deepEqual(healthClaimOwnerWhere('user-1'), { userId: 'user-1' })
    assert.deepEqual(healthClaimReportWhere('user-1'), { userId: 'user-1', deletedAt: null })
    assert.deepEqual(healthClaimReportScope('user-1'), {
      owner: { userId: 'user-1' },
      liveImport: { userId: 'user-1', deletedAt: null },
    })
  })

  it('never exports settings, provider credentials, bearer tokens, push tokens, or sessions', async () => {
    const canaries = {
      setting: 'redbark-secret-canary',
      calendar: 'calendar-credential-canary',
      redbark: 'redbark-credential-canary',
      push: 'push-token-canary',
      session: 'session-token-canary',
      pathology: 'pathology-export-token-canary',
      storage: 'private-storage-key-canary',
    }
    const called: string[] = []
    const credentialDelegate = (name: string, record: Record<string, unknown>) => ({
      async findMany() {
        called.push(name)
        return [record]
      },
    })
    const database = {
      user: {
        async findUnique() {
          return {
            id: 'user-1',
            name: 'Test User',
            email: 'portable@example.com',
            emailVerified: null,
            image: null,
            timezone: 'Australia/Sydney',
            currency: 'AUD',
            theme: 'dark',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          }
        },
      },
      task: credentialDelegate('Task', {
        id: 'task-1',
        userId: 'user-1',
        title: 'Portable task',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      genericUpload: credentialDelegate('GenericUpload', {
        id: 'upload-1',
        userId: 'user-1',
        fileName: 'receipt.pdf',
        storageKey: canaries.storage,
      }),
      userSetting: credentialDelegate('UserSetting', { userId: 'user-1', key: 'redbark_api_key', value: canaries.setting }),
      calendarProviderConnection: credentialDelegate('CalendarProviderConnection', { userId: 'user-1', credentialReference: canaries.calendar }),
      redbarkConnection: credentialDelegate('RedbarkConnection', { userId: 'user-1', credentialReference: canaries.redbark }),
      mobilePushDevice: credentialDelegate('MobilePushDevice', { userId: 'user-1', token: canaries.push }),
      mobileDeviceSession: credentialDelegate('MobileDeviceSession', { userId: 'user-1', tokenHash: canaries.session }),
      pathologyExport: credentialDelegate('PathologyExport', { userId: 'user-1', token: canaries.pathology }),
    }

    const exported = await collectPortableAccountData('user-1', database)
    const serialized = JSON.stringify(exported)

    assert.match(serialized, /Portable task/)
    assert.match(serialized, /receipt\.pdf/)
    assert.equal(serialized.includes(canaries.storage), false)
    for (const canary of Object.values(canaries)) {
      assert.equal(serialized.includes(canary), false, `export leaked ${canary}`)
    }
    assert.deepEqual(called.sort(), ['GenericUpload', 'Task'])
    assert.equal(exported.manifest.excludedModels.includes('UserSetting'), true)
    assert.equal(exported.manifest.excludedModels.includes('CalendarProviderConnection'), true)
    assert.equal(exported.manifest.excludedModels.includes('RedbarkConnection'), true)
    assert.equal(exported.manifest.excludedModels.includes('MobilePushDevice'), true)
    assert.equal(exported.manifest.excludedModels.includes('PathologyExport'), true)
  })
})