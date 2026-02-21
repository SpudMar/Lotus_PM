/**
 * Unit tests for the documents storage module.
 * AWS SDK is mocked — no real S3 calls are made.
 */

import { buildS3Key, generateUploadUrl, generateDownloadUrl, deleteFile } from './storage'

// ─── Mock AWS SDK ─────────────────────────────────────────────────────────────

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}))

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}))

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>

// ─── buildS3Key ───────────────────────────────────────────────────────────────

describe('buildS3Key', () => {
  test('builds key with participantId', () => {
    const key = buildS3Key({
      participantId: 'part-001',
      documentId: 'doc-001',
      filename: 'plan.pdf',
    })
    expect(key).toBe('documents/part-001/doc-001/plan.pdf')
  })

  test('uses "general" scope when participantId is null', () => {
    const key = buildS3Key({
      participantId: null,
      documentId: 'doc-002',
      filename: 'template.pdf',
    })
    expect(key).toBe('documents/general/doc-002/template.pdf')
  })

  test('uses "general" scope when participantId is undefined', () => {
    const key = buildS3Key({
      documentId: 'doc-003',
      filename: 'report.pdf',
    })
    expect(key).toBe('documents/general/doc-003/report.pdf')
  })

  test('sanitises path separators in filename', () => {
    const key = buildS3Key({
      participantId: 'part-001',
      documentId: 'doc-004',
      filename: 'folder/subfolder/file.pdf',
    })
    // The key prefix always has slashes (documents/part/id/); the filename portion should not
    const prefix = 'documents/part-001/doc-004/'
    expect(key.startsWith(prefix)).toBe(true)
    const filenamePart = key.slice(prefix.length)
    expect(filenamePart).not.toContain('/')
  })

  test('sanitises backslashes in filename', () => {
    const key = buildS3Key({
      participantId: 'part-001',
      documentId: 'doc-005',
      filename: 'folder\\file.pdf',
    })
    expect(key).not.toMatch(/documents\/part-001\/doc-005\/.*\\/)
  })

  test('collapses whitespace in filename', () => {
    const key = buildS3Key({
      participantId: 'part-001',
      documentId: 'doc-006',
      filename: 'my   file   name.pdf',
    })
    expect(key).not.toMatch(/\s{2,}/)
  })
})

// ─── generateUploadUrl ────────────────────────────────────────────────────────

describe('generateUploadUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, AWS_S3_BUCKET: 'lotus-pm-test' }
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/upload-url')
  })

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
  })

  test('returns a presigned upload URL', async () => {
    const result = await generateUploadUrl({
      participantId: 'part-001',
      documentId: 'doc-001',
      filename: 'plan.pdf',
      mimeType: 'application/pdf',
    })

    expect(result.uploadUrl).toBe('https://s3.example.com/upload-url')
    expect(result.s3Bucket).toBe('lotus-pm-test')
    expect(result.s3Key).toContain('documents/part-001/doc-001/')
    expect(result.expiresIn).toBe(900)
  })

  test('uses default expiry of 900 seconds', async () => {
    const result = await generateUploadUrl({
      participantId: null,
      documentId: 'doc-001',
      filename: 'plan.pdf',
      mimeType: 'application/pdf',
    })
    expect(result.expiresIn).toBe(900)
  })

  test('caps expiry at 3600 seconds', async () => {
    const result = await generateUploadUrl({
      participantId: null,
      documentId: 'doc-001',
      filename: 'plan.pdf',
      mimeType: 'application/pdf',
      expiresIn: 9999,
    })
    expect(result.expiresIn).toBe(3600)
  })

  test('throws when AWS_S3_BUCKET is not set', async () => {
    delete process.env['AWS_S3_BUCKET']

    await expect(
      generateUploadUrl({
        participantId: null,
        documentId: 'doc-001',
        filename: 'plan.pdf',
        mimeType: 'application/pdf',
      })
    ).rejects.toThrow('AWS_S3_BUCKET environment variable is not set')
  })

  test('passes ServerSideEncryption AES256 to PutObjectCommand', async () => {
    const { PutObjectCommand: MockPut } = await import('@aws-sdk/client-s3')
    const putSpy = MockPut as jest.MockedClass<typeof import('@aws-sdk/client-s3').PutObjectCommand>

    await generateUploadUrl({
      participantId: null,
      documentId: 'doc-001',
      filename: 'plan.pdf',
      mimeType: 'application/pdf',
    })

    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ServerSideEncryption: 'AES256' })
    )
  })
})

// ─── generateDownloadUrl ──────────────────────────────────────────────────────

describe('generateDownloadUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, AWS_S3_BUCKET: 'lotus-pm-test' }
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/download-url')
  })

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
  })

  test('returns a presigned download URL', async () => {
    const result = await generateDownloadUrl({
      s3Key: 'documents/part-001/doc-001/plan.pdf',
    })

    expect(result.downloadUrl).toBe('https://s3.example.com/download-url')
    expect(result.expiresIn).toBe(300)
  })

  test('uses default expiry of 300 seconds', async () => {
    const result = await generateDownloadUrl({
      s3Key: 'documents/general/doc-001/file.pdf',
    })
    expect(result.expiresIn).toBe(300)
  })

  test('accepts custom expiry', async () => {
    const result = await generateDownloadUrl({
      s3Key: 'documents/general/doc-001/file.pdf',
      expiresIn: 600,
    })
    expect(result.expiresIn).toBe(600)
  })

  test('caps expiry at 3600 seconds', async () => {
    const result = await generateDownloadUrl({
      s3Key: 'documents/general/doc-001/file.pdf',
      expiresIn: 99999,
    })
    expect(result.expiresIn).toBe(3600)
  })

  test('uses provided s3Bucket instead of env var', async () => {
    const result = await generateDownloadUrl({
      s3Key: 'documents/general/doc-001/file.pdf',
      s3Bucket: 'custom-bucket',
    })
    expect(result.downloadUrl).toBe('https://s3.example.com/download-url')
  })
})

// ─── deleteFile ───────────────────────────────────────────────────────────────

describe('deleteFile', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, AWS_S3_BUCKET: 'lotus-pm-test' }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
  })

  test('sends DeleteObjectCommand with correct bucket and key', async () => {
    const MockS3 = S3Client as jest.MockedClass<typeof S3Client>
    const mockSend = jest.fn().mockResolvedValue({})
    MockS3.mockImplementation(() => ({ send: mockSend }) as unknown as S3Client)

    const MockDelete = DeleteObjectCommand as jest.MockedClass<typeof DeleteObjectCommand>

    await deleteFile({ s3Key: 'documents/part-001/doc-001/plan.pdf' })

    expect(MockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'lotus-pm-test',
        Key: 'documents/part-001/doc-001/plan.pdf',
      })
    )
  })

  test('uses provided s3Bucket when given', async () => {
    const MockDelete = DeleteObjectCommand as jest.MockedClass<typeof DeleteObjectCommand>

    await deleteFile({
      s3Key: 'documents/part-001/doc-001/plan.pdf',
      s3Bucket: 'custom-bucket',
    })

    expect(MockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'custom-bucket' })
    )
  })
})
