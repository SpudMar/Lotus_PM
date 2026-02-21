/**
 * Unit tests for email-ingest module.
 * All AWS SDK clients, mailparser, Prisma, and audit log are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  CopyObjectCommand: jest.fn(),
}))

jest.mock('@aws-sdk/client-textract', () => ({
  TextractClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  StartDocumentTextDetectionCommand: jest.fn(),
}))

jest.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutEventsCommand: jest.fn(),
}))

jest.mock('mailparser', () => ({
  simpleParser: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn(),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { S3Client, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { TextractClient } from '@aws-sdk/client-textract'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { simpleParser } from 'mailparser'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

import {
  parseEmailFromS3,
  moveToNoAttachment,
  uploadPdfToS3,
  startTextractJob,
  createEmailInvoiceDraft,
  sqsMessageSchema,
  SYSTEM_USER_ID,
} from './email-ingest'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fake async-iterable body (simulates AWS SDK streaming response) */
function makeBody(content: string): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(content)
    },
  }
}

function mockS3Send(returnValue: unknown): void {
  const mockSend = jest.fn().mockResolvedValueOnce(returnValue)
  ;(S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }))
}

function mockTextractSend(jobId: string): void {
  const mockSend = jest.fn().mockResolvedValueOnce({ JobId: jobId })
  ;(TextractClient as jest.Mock).mockImplementation(() => ({ send: mockSend }))
}

function mockEventBridgeSend(): void {
  const mockSend = jest.fn().mockResolvedValueOnce({})
  ;(EventBridgeClient as jest.Mock).mockImplementation(() => ({ send: mockSend }))
}

// ── sqsMessageSchema ──────────────────────────────────────────────────────────

describe('sqsMessageSchema', () => {
  test('accepts valid bucket and key', () => {
    const result = sqsMessageSchema.parse({ bucket: 'my-bucket', key: 'inbound/test.eml' })
    expect(result.bucket).toBe('my-bucket')
    expect(result.key).toBe('inbound/test.eml')
  })

  test('rejects missing bucket', () => {
    expect(() => sqsMessageSchema.parse({ key: 'inbound/test.eml' })).toThrow()
  })

  test('rejects empty key', () => {
    expect(() => sqsMessageSchema.parse({ bucket: 'my-bucket', key: '' })).toThrow()
  })
})

// ── parseEmailFromS3 ──────────────────────────────────────────────────────────

describe('parseEmailFromS3', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns hasPdf=false when email has no attachments', async () => {
    mockS3Send({ Body: makeBody('raw email bytes') })
    ;(simpleParser as jest.Mock).mockResolvedValueOnce({
      from: { value: [{ address: 'provider@example.com' }] },
      subject: 'Invoice #001',
      attachments: [],
    })

    const result = await parseEmailFromS3('my-bucket', 'inbound/email.eml')

    expect(result.hasPdf).toBe(false)
    expect(result.pdfBuffers).toHaveLength(0)
    expect(result.senderEmail).toBe('provider@example.com')
    expect(result.subject).toBe('Invoice #001')
  })

  test('returns hasPdf=true with PDF buffer when email has a PDF attachment', async () => {
    const pdfContent = Buffer.from('%PDF-1.4 fake content')

    mockS3Send({ Body: makeBody('raw email bytes') })
    ;(simpleParser as jest.Mock).mockResolvedValueOnce({
      from: { value: [{ address: 'billing@provider.com.au' }] },
      subject: 'Tax Invoice',
      attachments: [
        {
          contentType: 'application/pdf',
          filename: 'invoice.pdf',
          content: pdfContent,
        },
      ],
    })

    const result = await parseEmailFromS3('my-bucket', 'inbound/email.eml')

    expect(result.hasPdf).toBe(true)
    expect(result.pdfBuffers).toHaveLength(1)
    expect(result.pdfBuffers[0]).toEqual(pdfContent)
    expect(result.senderEmail).toBe('billing@provider.com.au')
  })

  test('detects PDF attachment by .pdf filename extension', async () => {
    const pdfContent = Buffer.from('%PDF-1.4 fake')

    mockS3Send({ Body: makeBody('raw email bytes') })
    ;(simpleParser as jest.Mock).mockResolvedValueOnce({
      from: { value: [{ address: 'sender@test.com' }] },
      subject: 'Invoice',
      attachments: [
        {
          contentType: 'application/octet-stream', // non-standard MIME type
          filename: 'INVOICE.PDF',                 // uppercase extension
          content: pdfContent,
        },
      ],
    })

    const result = await parseEmailFromS3('my-bucket', 'inbound/email.eml')
    expect(result.hasPdf).toBe(true)
  })

  test('skips non-PDF attachments (e.g. Word doc)', async () => {
    mockS3Send({ Body: makeBody('raw email bytes') })
    ;(simpleParser as jest.Mock).mockResolvedValueOnce({
      from: { value: [{ address: 'sender@test.com' }] },
      subject: 'Invoice',
      attachments: [
        {
          contentType: 'application/msword',
          filename: 'invoice.docx',
          content: Buffer.from('doc content'),
        },
      ],
    })

    const result = await parseEmailFromS3('my-bucket', 'inbound/email.eml')
    expect(result.hasPdf).toBe(false)
    expect(result.pdfBuffers).toHaveLength(0)
  })

  test('returns empty senderEmail when From header is missing', async () => {
    mockS3Send({ Body: makeBody('raw email bytes') })
    ;(simpleParser as jest.Mock).mockResolvedValueOnce({
      from: undefined,
      subject: undefined,
      attachments: [],
    })

    const result = await parseEmailFromS3('my-bucket', 'inbound/email.eml')
    expect(result.senderEmail).toBe('')
    expect(result.subject).toBe('')
  })

  test('throws when S3 body is empty', async () => {
    mockS3Send({ Body: null })

    await expect(parseEmailFromS3('my-bucket', 'inbound/email.eml')).rejects.toThrow(
      'S3 object my-bucket/inbound/email.eml has no body'
    )
  })

  test('fetches the correct S3 object', async () => {
    const s3SendMock = jest.fn().mockResolvedValueOnce({ Body: makeBody('x') })
    ;(S3Client as jest.Mock).mockImplementation(() => ({ send: s3SendMock }))
    ;(simpleParser as jest.Mock).mockResolvedValueOnce({
      from: { value: [{ address: 'a@b.com' }] },
      subject: '',
      attachments: [],
    })

    await parseEmailFromS3('test-bucket', 'inbound/abc.eml')

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'inbound/abc.eml',
    })
  })
})

// ── moveToNoAttachment ────────────────────────────────────────────────────────

describe('moveToNoAttachment', () => {
  beforeEach(() => jest.clearAllMocks())

  test('copies email to inbound/no-attachment/ prefix', async () => {
    const s3SendMock = jest.fn().mockResolvedValueOnce({})
    ;(S3Client as jest.Mock).mockImplementation(() => ({ send: s3SendMock }))

    await moveToNoAttachment('my-bucket', 'inbound/email.eml')

    expect(CopyObjectCommand).toHaveBeenCalledWith({
      Bucket: 'my-bucket',
      CopySource: 'my-bucket/inbound/email.eml',
      Key: 'inbound/no-attachment/email.eml',
    })
  })

  test('leaves key unchanged when it has no inbound/ prefix', async () => {
    const s3SendMock = jest.fn().mockResolvedValueOnce({})
    ;(S3Client as jest.Mock).mockImplementation(() => ({ send: s3SendMock }))

    await moveToNoAttachment('my-bucket', 'email.eml')

    // key.replace(/^inbound\//, 'inbound/no-attachment/') — no match → key unchanged
    expect(CopyObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'email.eml' })
    )
  })
})

// ── startTextractJob ──────────────────────────────────────────────────────────

describe('startTextractJob', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns JobId from Textract response', async () => {
    mockTextractSend('textract-job-abc123')

    const jobId = await startTextractJob('invoice-bucket', 'invoices/2026/02/doc.pdf')
    expect(jobId).toBe('textract-job-abc123')
  })

  test('throws when Textract returns no JobId', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({ JobId: undefined })
    ;(TextractClient as jest.Mock).mockImplementation(() => ({ send: mockSend }))

    await expect(
      startTextractJob('invoice-bucket', 'invoices/2026/02/doc.pdf')
    ).rejects.toThrow('Textract did not return a JobId')
  })
})

// ── createEmailInvoiceDraft ───────────────────────────────────────────────────

describe('createEmailInvoiceDraft', () => {
  beforeEach(() => jest.clearAllMocks())

  const draftData = {
    pdfS3Key: 'invoices/2026/02/abc.pdf',
    pdfS3Bucket: 'lotus-pm-invoices-staging-123',
    sourceEmail: 'provider@example.com',
    textractJobId: 'textract-job-xyz',
  }

  test('creates draft invoice with RECEIVED status and PENDING invoice number', async () => {
    const mockInvoice = { id: 'inv-001' }
    ;(prisma.invInvoice.create as jest.Mock).mockResolvedValueOnce(mockInvoice)
    ;(createAuditLog as jest.Mock).mockResolvedValueOnce(undefined)
    mockEventBridgeSend()

    const result = await createEmailInvoiceDraft(draftData)

    expect(prisma.invInvoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceNumber: 'PENDING',
        status: 'RECEIVED',
        ingestSource: 'EMAIL',
        subtotalCents: 0,
        gstCents: 0,
        totalCents: 0,
        s3Key: draftData.pdfS3Key,
        s3Bucket: draftData.pdfS3Bucket,
        sourceEmail: draftData.sourceEmail,
        textractJobId: draftData.textractJobId,
      }),
      select: { id: true },
    })

    expect(result.id).toBe('inv-001')
  })

  test('writes audit log with SYSTEM_USER_ID and EMAIL_RECEIVED action', async () => {
    ;(prisma.invInvoice.create as jest.Mock).mockResolvedValueOnce({ id: 'inv-002' })
    ;(createAuditLog as jest.Mock).mockResolvedValueOnce(undefined)
    mockEventBridgeSend()

    await createEmailInvoiceDraft(draftData)

    expect(createAuditLog).toHaveBeenCalledWith({
      userId: SYSTEM_USER_ID,
      action: 'EMAIL_RECEIVED',
      resource: 'invoice',
      resourceId: 'inv-002',
      after: expect.objectContaining({ ingestSource: 'EMAIL' }),
    })
  })

  test('audit log does NOT include sourceEmail (no PII in logs — REQ-017)', async () => {
    ;(prisma.invInvoice.create as jest.Mock).mockResolvedValueOnce({ id: 'inv-003' })
    ;(createAuditLog as jest.Mock).mockResolvedValueOnce(undefined)
    mockEventBridgeSend()

    await createEmailInvoiceDraft(draftData)

    const auditCall = (createAuditLog as jest.Mock).mock.calls[0]?.[0] as { after?: Record<string, unknown> }
    expect(auditCall?.after).not.toHaveProperty('sourceEmail')
  })

  test('emits EventBridge lotus-pm.invoices.email-received event', async () => {
    ;(prisma.invInvoice.create as jest.Mock).mockResolvedValueOnce({ id: 'inv-004' })
    ;(createAuditLog as jest.Mock).mockResolvedValueOnce(undefined)

    const ebSendMock = jest.fn().mockResolvedValueOnce({})
    ;(EventBridgeClient as jest.Mock).mockImplementation(() => ({ send: ebSendMock }))

    await createEmailInvoiceDraft(draftData)

    expect(ebSendMock).toHaveBeenCalledTimes(1)
    // The PutEventsCommand is what gets sent — verify it was constructed
    const { PutEventsCommand: MockPutEventsCommand } = jest.requireMock(
      '@aws-sdk/client-eventbridge'
    ) as { PutEventsCommand: jest.Mock }
    expect(MockPutEventsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Entries: [
          expect.objectContaining({
            Source: 'lotus-pm.invoices',
            DetailType: 'lotus-pm.invoices.email-received',
          }),
        ],
      })
    )
  })

  test('draft invoice has no participantId or providerId (unknown at receipt)', async () => {
    ;(prisma.invInvoice.create as jest.Mock).mockResolvedValueOnce({ id: 'inv-005' })
    ;(createAuditLog as jest.Mock).mockResolvedValueOnce(undefined)
    mockEventBridgeSend()

    await createEmailInvoiceDraft(draftData)

    const createCall = (prisma.invInvoice.create as jest.Mock).mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(createCall?.data).not.toHaveProperty('participantId')
    expect(createCall?.data).not.toHaveProperty('providerId')
  })
})

// ── uploadPdfToS3 key format ──────────────────────────────────────────────────

describe('uploadPdfToS3', () => {
  beforeEach(() => jest.clearAllMocks())

  test('uploads to invoices/<year>/<month>/<uuid>.pdf key pattern', async () => {
    const s3SendMock = jest.fn().mockResolvedValueOnce({})
    ;(S3Client as jest.Mock).mockImplementation(() => ({ send: s3SendMock }))

    const key = await uploadPdfToS3(Buffer.from('%PDF'), 'invoice-bucket')

    expect(key).toMatch(/^invoices\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/)
  })

  test('uploads with SSE-S3 encryption (REQ-016)', async () => {
    const { PutObjectCommand: MockPutObjectCommand } = jest.requireMock(
      '@aws-sdk/client-s3'
    ) as { PutObjectCommand: jest.Mock }

    const s3SendMock = jest.fn().mockResolvedValueOnce({})
    ;(S3Client as jest.Mock).mockImplementation(() => ({ send: s3SendMock }))

    await uploadPdfToS3(Buffer.from('%PDF'), 'invoice-bucket')

    expect(MockPutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        ServerSideEncryption: 'AES256',
        ContentType: 'application/pdf',
      })
    )
  })
})
