import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { presignedUploadSchema, receiptAttachSchema } from '../lib/validation.ts'

const validUpload = {
  fileName: 'report.pdf',
  contentType: 'application/pdf',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}

describe('presigned upload safety', () => {
  it('requires a bounded private upload with a checksum', () => {
    assert.equal(presignedUploadSchema.safeParse(validUpload).success, true)
    assert.equal(presignedUploadSchema.safeParse({ ...validUpload, byteSize: 25 * 1024 * 1024 + 1 }).success, false)
    assert.equal(presignedUploadSchema.safeParse({ ...validUpload, contentType: 'application/zip' }).success, false)
    assert.equal(presignedUploadSchema.safeParse({ ...validUpload, sha256: 'not-a-checksum' }).success, false)
  })

  it('rejects public uploads and unsafe file names', () => {
    assert.equal(presignedUploadSchema.safeParse({ ...validUpload, isPublic: true }).success, false)
    assert.equal(presignedUploadSchema.safeParse({ ...validUpload, fileName: '../public.html' }).success, false)
    assert.equal(presignedUploadSchema.safeParse({ ...validUpload, fileName: 'nested/report.pdf' }).success, false)
  })

  it('requires an upload id when attaching a prepared receipt', () => {
    assert.equal(receiptAttachSchema.safeParse({ uploadId: 'upload-1' }).success, true)
    assert.equal(receiptAttachSchema.safeParse({ uploadId: '' }).success, false)
    assert.equal(receiptAttachSchema.safeParse({ uploadId: 'upload-1', extra: true }).success, false)
  })
})