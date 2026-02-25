/**
 * Unit tests for POST /api/webhooks/m365-ingest
 *
 * Tests:
 *   1. Returns 401 if X-Webhook-Secret is missing
 *   2. Returns 401 if X-Webhook-Secret is wrong
 *   3. Returns 400 if body fails validation (no `from` field)
 *   4. Valid secret + body (no attachments): creates CrmCorrespondence, returns 200
 *   5. Valid secret + body + PDF attachment: uploads to S3, creates CrmCorrespondence
 *      with s3Keys in metadata
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn()
  const MockS3Client = jest.fn().mockImplementation(() => ({ send: mockSend }))
  const MockPutObjectCommand = jest.fn().mockImplementation((input: unknown) => ({
    _input: input,
  }))
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    __mockSend: mockSend,
  }
})

jest.mock('@aws-sdk/client-textract', () => ({
  TextractClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  StartDocumentTextDetectionCommand: jest.fn(),
  GetDocumentTextDetectionCommand: jest.fn(),
}))

jest.mock('@/lib/modules/invoices/email-ingest', () => ({
  startTextractJob: jest.fn(),
  createEmailInvoiceDraft: jest.fn(),
  // Keep the schema for any imports in the module — not used by our route directly
  sqsMessageSchema: { parse: jest.fn() },
  SYSTEM_USER_ID: 'clsystem0000000000000001',
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    crmCorrespondence: {
      create: jest.fn(),
    },
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { POST } from './route'
import { startTextractJob, createEmailInvoiceDraft } from '@/lib/modules/invoices/email-ingest'
import { prisma } from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockSend } = require('@aws-sdk/client-s3') as { __mockSend: jest.Mock }

const mockStartTextract = startTextractJob as jest.MockedFunction<typeof startTextractJob>
const mockCreateDraft = createEmailInvoiceDraft as jest.MockedFunction<typeof createEmailInvoiceDraft>
const mockCorrespondenceCreate = prisma.crmCorrespondence.create as jest.MockedFunction<
  typeof prisma.crmCorrespondence.create
>

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SECRET = 'test-m365-webhook-secret-xyz'

/** Minimal valid body — just the required `from` field */
const MINIMAL_BODY = {
  from: 'billing@provider.com.au',
}

/** Full realistic body with PDF attachment */
const PDF_ATTACHMENT = {
  name: 'invoice-001.pdf',
  contentType: 'application/pdf',
  // Small valid base64 string (does not need to be a real PDF for unit tests)
  contentBytes: Buffer.from('%PDF-1.4 test content').toString('base64'),
}

function makeRequest(
  body: unknown,
  options: { secret?: string | null } = {}
): NextRequest {
  const { secret = VALID_SECRET } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (secret !== null) {
    headers['x-webhook-secret'] = secret
  }
  return new NextRequest('http://localhost/api/webhooks/m365-ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/m365-ingest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.M365_WEBHOOK_SECRET = VALID_SECRET
    process.env.S3_BUCKET_INVOICES = 'lotus-pm-invoices-test'

    // Default happy-path mocks
    __mockSend.mockResolvedValue({})
    mockStartTextract.mockResolvedValue('textract-job-001')
    mockCreateDraft.mockResolvedValue({ id: 'inv-draft-001' })
    mockCorrespondenceCreate.mockResolvedValue({ id: 'corr-001' } as never)
  })

  afterEach(() => {
    delete process.env.M365_WEBHOOK_SECRET
    delete process.env.S3_BUCKET_INVOICES
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  test('returns 401 when X-Webhook-Secret header is missing', async () => {
    const req = makeRequest(MINIMAL_BODY, { secret: null })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when X-Webhook-Secret is wrong', async () => {
    const req = makeRequest(MINIMAL_BODY, { secret: 'wrong-secret' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when M365_WEBHOOK_SECRET env var is not set', async () => {
    delete process.env.M365_WEBHOOK_SECRET
    const req = makeRequest(MINIMAL_BODY, { secret: VALID_SECRET })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  test('returns 400 when body is missing required `from` field', async () => {
    const req = makeRequest({ subject: 'No sender here', bodyText: 'Hello' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  test('returns 400 when body is empty object', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  // ── No attachments path ────────────────────────────────────────────────────

  test('creates CrmCorrespondence and returns 200 when no attachments', async () => {
    const body = {
      subject: 'Enquiry from provider',
      from: 'billing@provider.com.au',
      fromName: 'Allied Health Provider',
      to: 'planmanager@lotusassist.com.au',
      bodyText: 'Please find our enquiry below.',
      messageId: '<msg-001@mail.provider.com>',
      receivedAt: '2026-02-25T09:00:00Z',
      attachments: [],
    }

    const req = makeRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { received: boolean; correspondenceId: string; s3Keys: string[] }
    expect(data.received).toBe(true)
    expect(data.correspondenceId).toBe('corr-001')
    expect(data.s3Keys).toHaveLength(0)

    // Should not have called Textract or created a draft invoice
    expect(mockStartTextract).not.toHaveBeenCalled()
    expect(mockCreateDraft).not.toHaveBeenCalled()

    // Should have created the correspondence record
    expect(mockCorrespondenceCreate).toHaveBeenCalledTimes(1)
    const createCall = mockCorrespondenceCreate.mock.calls[0]?.[0]
    expect(createCall?.data).toMatchObject({
      type: 'EMAIL_INBOUND',
      subject: 'Enquiry from provider',
      fromAddress: 'billing@provider.com.au',
      toAddress: 'planmanager@lotusassist.com.au',
    })
  })

  test('includes source m365-webhook in correspondence metadata', async () => {
    const req = makeRequest({
      from: 'billing@provider.com.au',
      messageId: '<abc123@mail.provider.com>',
      receivedAt: '2026-02-25T09:00:00Z',
    })
    await POST(req)

    const createCall = mockCorrespondenceCreate.mock.calls[0]?.[0]
    const metadata = createCall?.data?.metadata as Record<string, unknown>
    expect(metadata['source']).toBe('m365-webhook')
    expect(metadata['messageId']).toBe('<abc123@mail.provider.com>')
    expect(metadata['s3Keys']).toEqual([])
    expect(metadata['attachmentCount']).toBe(0)
  })

  // ── PDF attachment path ────────────────────────────────────────────────────

  test('uploads PDF to S3, starts Textract, creates draft, and returns s3Keys', async () => {
    const body = {
      subject: 'Invoice #INV-001',
      from: 'billing@provider.com.au',
      fromName: 'Allied Health Provider',
      to: 'planmanager@lotusassist.com.au',
      bodyText: 'Invoice attached.',
      messageId: '<inv001@mail.provider.com>',
      receivedAt: '2026-02-25T09:00:00Z',
      attachments: [PDF_ATTACHMENT],
    }

    const req = makeRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { received: boolean; correspondenceId: string; s3Keys: string[] }
    expect(data.received).toBe(true)
    expect(data.s3Keys).toHaveLength(1)

    // S3 upload should have been called
    expect(__mockSend).toHaveBeenCalled()

    // Textract job should have been started
    expect(mockStartTextract).toHaveBeenCalledTimes(1)
    expect(mockStartTextract).toHaveBeenCalledWith(
      'lotus-pm-invoices-test',
      expect.stringContaining('email-ingest/')
    )

    // Draft invoice should have been created
    expect(mockCreateDraft).toHaveBeenCalledTimes(1)
    expect(mockCreateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfS3Bucket: 'lotus-pm-invoices-test',
        sourceEmail: 'billing@provider.com.au',
        textractJobId: 'textract-job-001',
        emailSubject: 'Invoice #INV-001',
        originalFilename: 'invoice-001.pdf',
      })
    )

    // Correspondence should include s3Keys in metadata
    const createCall = mockCorrespondenceCreate.mock.calls[0]?.[0]
    const metadata = createCall?.data?.metadata as Record<string, unknown>
    expect(Array.isArray(metadata['s3Keys'])).toBe(true)
    expect((metadata['s3Keys'] as string[]).length).toBe(1)
  })

  test('uses messageId as S3 folder key when provided', async () => {
    const body = {
      from: 'billing@provider.com.au',
      messageId: '<custom-msg-id@mail.provider.com>',
      attachments: [PDF_ATTACHMENT],
    }

    const req = makeRequest(body)
    await POST(req)

    expect(mockStartTextract).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('<custom-msg-id@mail.provider.com>')
    )
  })

  test('ignores non-PDF attachments', async () => {
    const body = {
      from: 'billing@provider.com.au',
      attachments: [
        {
          name: 'photo.jpg',
          contentType: 'image/jpeg',
          contentBytes: Buffer.from('fake image').toString('base64'),
        },
        {
          name: 'document.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          contentBytes: Buffer.from('fake docx').toString('base64'),
        },
      ],
    }

    const req = makeRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockStartTextract).not.toHaveBeenCalled()
    expect(mockCreateDraft).not.toHaveBeenCalled()

    const data = await res.json() as { s3Keys: string[] }
    expect(data.s3Keys).toHaveLength(0)
  })

  test('strips HTML from bodyHtml when bodyText is not provided', async () => {
    const body = {
      from: 'billing@provider.com.au',
      bodyHtml: '<html><body><p>Invoice attached.</p><br/></body></html>',
    }

    const req = makeRequest(body)
    await POST(req)

    const createCall = mockCorrespondenceCreate.mock.calls[0]?.[0]
    const storedBody = createCall?.data?.body as string
    // Should not contain HTML tags
    expect(storedBody).not.toMatch(/<[^>]+>/)
    expect(storedBody).toContain('Invoice attached')
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  test('returns 500 when S3 upload throws', async () => {
    __mockSend.mockRejectedValueOnce(new Error('S3 network error'))

    const body = {
      from: 'billing@provider.com.au',
      attachments: [PDF_ATTACHMENT],
    }

    const req = makeRequest(body)
    const res = await POST(req)

    expect(res.status).toBe(500)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('INTERNAL_ERROR')
  })

  test('returns 500 when prisma.crmCorrespondence.create throws', async () => {
    mockCorrespondenceCreate.mockRejectedValueOnce(new Error('DB connection failed'))

    const req = makeRequest(MINIMAL_BODY)
    const res = await POST(req)

    expect(res.status).toBe(500)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('INTERNAL_ERROR')
  })
})
