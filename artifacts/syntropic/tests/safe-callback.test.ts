import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safeRelativeCallback } from '../lib/safe-callback.ts'

describe('authentication callback paths', () => {
  it('preserves QR return paths for credentials and Google sign-in', () => {
    assert.equal(
      safeRelativeCallback('/storage/qr/opaque-token?print=1#label'),
      '/storage/qr/opaque-token?print=1#label',
    )
  })

  it('rejects absolute, protocol-relative, and slash-backslash redirects', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/%5cevil.example',
      '\\evil.example',
    ]) {
      assert.equal(safeRelativeCallback(value), '/', value)
    }
  })
})