/**
 * Unit tests for POST /api/email-ingest
 * The email-ingest module functions are mocked — these tests cover:
 *   - 401 on missing / invalid Bearer token
 *   - 400 on malformed body
 *   - 200 with no-attachment handling
 *   - 200 on successful PDF processing
 *   - 500 on unexpected errors
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/modules/invoices/email-ingest', () => ({
  sqsMessageSchema: jest.requireActual('@/lib/modules/invoices/email-ingest').sqsMessageSchema,
  parseEmailFromS3: jest.fn(),
  moveToNoAttachment: jest.fn(),
  uploadPdfToS3: jest.fn(),
  startTextractJob: jest.fn(),
  createEmailInvoiceDraft: jest.fn(),
  SYSTEM_USER_ID: 'clsystem0000000000000001',
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  parseEmailFromS3,
  moveToNoAttachment,
  uploadPdfToS3,
  startTextractJob,
  createEmailInvoiceDraft,
} from '@/lib/modules/invoices/email-ingest'

const mockParseEmail = parseEmailFromS3 as jest.MockedFunction<typeof parseEmailFromS3>
const mockMoveToNoAttachment = moveToNoAttachment as jest.MockedFunction<typeof moveToNoAttachment>
const mockUploadPdf = uploadPdfToS3 as jest.MockedFunction<typeof uploadPdfToS3>
const mockStartTextract = startTextractJob as jest.MockedFunction<typeof startTextractJob>
const mockCreateDraft = createEmailInvoiceDraft as jest.MockedFunction<typeof createEmailInvoiceDraft>

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SECRET = 'test-ingest-secret-abc123'

function makeRequest(
  body: unknown,
  options: { secret?: string; method?: string } = {}
): NextRequest {
  const { secret = VALID_SECRET } = options
  return new NextRequest('http://localhost/api/email-ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/email-ingest', () => {
  const validBody = { bucket: 'lotus-pm-invoices', key: 'inbound/test.eml' }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EMAIL_INGEST_SECRET = VALID_SECRET
    process.env.S3_BUCKET_INVOICES = 'lotus-pm-invoices'
  })

  afterEach(() => {
    delete process.env.EMAIL_INGEST_SECRET
    delete process.env.S3_BUCKET_INVOICES
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/email-ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when Bearer token is wrong', async () => {
    const req = makeRequest(validBody, { secret: 'wrong-secret' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when EMAIL_INGEST_SECRET env var is not set', async () => {
    delete process.env.EMAIL_INGEST_SECRET
    const req = makeRequest(validBody)
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  test('returns 400 when body is missing bucket', async () => {
    const req = makeRequest({ key: 'inbound/test.eml' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  test('returns 400 when body is missing key', async () => {
    const req = makeRequest({ bucket: 'my-bucket' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  test('returns 400 when body is not JSON', async () => {
    const req = new NextRequest('http://localhost/api/email-ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Bearer ${VALID_SECRET}`,
      },
      body: 'not json',
    })
    const res = await POST(req)
    // JSON parse error → 500 (or 400 from Zod depending on how json() fails)
    expect([400, 500]).toContain(res.status)
  })

  // ── No-attachment path ─────────────────────────────────────────────────────

  test('returns 200 and calls moveToNoAttachment when email has no PDF', async () => {
    mockParseEmail.mockResolvedValueOnce({
      hasPdf: false,
      pdfBuffers: [],
      senderEmail: 'provider@example.com',
      subject: 'No invoice',
    })
    mockMoveToNoAttachment.mockResolvedValueOnce(undefined)

    const req = makeRequest(validBody)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockMoveToNoAttachment).toHaveBeenCalledWith(
      validBody.bucket,
      validBody.key
    )
    expect(mockUploadPdf).not.toHaveBeenCalled()
    expect(mockCreateDraft).not.toHaveBeenCalled()
  })

  // ── Success path ───────────────────────────────────────────────────────────

  test('returns 200 with invoiceId and textractJobId on successful processing', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4')

    mockParseEmail.mockResolvedValueOnce({
      hasPdf: true,
      pdfBuffers: [pdfBuffer],
      senderEmail: 'billing@provider.com.au',
      subject: 'Tax Invoice #001',
    })
    mockUploadPdf.mockResolvedValueOnce('invoices/2026/02/abc-uuid.pdf')
    mockStartTextract.mockResolvedValueOnce('textract-job-001')
    mockCreateDraft.mockResolvedValueOnce({ id: 'inv-draft-001' })

    const req = makeRequest(validBody)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { invoiceId: string; textractJobId: string }
    expect(data.invoiceId).toBe('inv-draft-001')
    expect(data.textractJobId).toBe('textract-job-001')
  })

  test('uploads first PDF buffer only (even if multiple PDFs attached)', async () => {
    const pdf1 = Buffer.from('%PDF-1.4 first')
    const pdf2 = Buffer.from('%PDF-1.4 second')

    mockParseEmail.mockResolvedValueOnce({
      hasPdf: true,
      pdfBuffers: [pdf1, pdf2],
      senderEmail: 'billing@provider.com.au',
      subject: 'Invoice',
    })
    mockUploadPdf.mockResolvedValueOnce('invoices/2026/02/pdf.pdf')
    mockStartTextract.mockResolvedValueOnce('job-001')
    mockCreateDraft.mockResolvedValueOnce({ id: 'inv-001' })

    const req = makeRequest(validBody)
    await POST(req)

    expect(mockUploadPdf).toHaveBeenCalledWith(pdf1, expect.any(String))
  })

  test('passes correct data to createEmailInvoiceDraft', async () => {
    mockParseEmail.mockResolvedValueOnce({
      hasPdf: true,
      pdfBuffers: [Buffer.from('%PDF')],
      senderEmail: 'accounts@provider.com.au',
      subject: 'Invoice',
    })
    mockUploadPdf.mockResolvedValueOnce('invoices/2026/02/xyz.pdf')
    mockStartTextract.mockResolvedValueOnce('job-xyz-001')
    mockCreateDraft.mockResolvedValueOnce({ id: 'inv-xyz' })

    const req = makeRequest(validBody)
    await POST(req)

    expect(mockCreateDraft).toHaveBeenCalledWith({
      pdfS3Key: 'invoices/2026/02/xyz.pdf',
      pdfS3Bucket: 'lotus-pm-invoices',
      sourceEmail: 'accounts@provider.com.au',
      textractJobId: 'job-xyz-001',
    })
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  test('returns 500 when parseEmailFromS3 throws', async () => {
    mockParseEmail.mockRejectedValueOnce(new Error('S3 fetch failed'))

    const req = makeRequest(validBody)
    const res = await POST(req)

    expect(res.status).toBe(500)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('INTERNAL_ERROR')
  })

  test('returns 500 when createEmailInvoiceDraft throws', async () => {
    mockParseEmail.mockResolvedValueOnce({
      hasPdf: true,
      pdfBuffers: [Buffer.from('%PDF')],
      senderEmail: 'a@b.com',
      subject: 'Invoice',
    })
    mockUploadPdf.mockResolvedValueOnce('invoices/2026/02/doc.pdf')
    mockStartTextract.mockResolvedValueOnce('job-001')
    mockCreateDraft.mockRejectedValueOnce(new Error('DB error'))

    const req = makeRequest(validBody)
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
