/**
 * Unit tests for POST /api/email-ingest/textract-complete
 *
 * The email-ingest module functions and textract-extraction are mocked.
 * Tests cover: auth, validation, JOB_PENDING (202), success (200), errors (500).
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/modules/invoices/email-ingest', () => ({
  // Use the real Zod schema for validation tests
  textractCompleteSchema: jest.requireActual('@/lib/modules/invoices/email-ingest')
    .textractCompleteSchema,
  pollTextractResult: jest.fn(),
  applyExtractionToInvoice: jest.fn(),
  TextractJobPendingError: jest.requireActual('@/lib/modules/invoices/email-ingest')
    .TextractJobPendingError,
}))

jest.mock('@/lib/modules/invoices/textract-extraction', () => ({
  extractInvoiceData: jest.fn(),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  pollTextractResult,
  applyExtractionToInvoice,
  TextractJobPendingError,
} from '@/lib/modules/invoices/email-ingest'
import { extractInvoiceData } from '@/lib/modules/invoices/textract-extraction'
import type { ExtractedInvoiceData } from '@/lib/modules/invoices/textract-extraction'

const mockPoll = pollTextractResult as jest.MockedFunction<typeof pollTextractResult>
const mockApply = applyExtractionToInvoice as jest.MockedFunction<typeof applyExtractionToInvoice>
const mockExtract = extractInvoiceData as jest.MockedFunction<typeof extractInvoiceData>

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SECRET = 'textract-test-secret-xyz'
const VALID_BODY = { jobId: 'textract-job-001', invoiceId: 'cinvoice0000000000001' }

function makeRequest(body: unknown, secret = VALID_SECRET): NextRequest {
  return new NextRequest('http://localhost/api/email-ingest/textract-complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  })
}

const emptyExtracted: ExtractedInvoiceData = {
  invoiceNumber: null,
  invoiceDate: null,
  subtotalCents: null,
  gstCents: null,
  totalCents: null,
  providerAbn: null,
  participantNdisNumber: null,
  lineItems: [],
  confidence: 0.85,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/email-ingest/textract-complete', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.EMAIL_INGEST_SECRET = VALID_SECRET
  })

  afterEach(() => {
    delete process.env.EMAIL_INGEST_SECRET
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/email-ingest/textract-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when Bearer token is wrong', async () => {
    const req = makeRequest(VALID_BODY, 'wrong-secret')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when EMAIL_INGEST_SECRET is not set', async () => {
    delete process.env.EMAIL_INGEST_SECRET
    const req = makeRequest(VALID_BODY)
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  test('returns 400 when jobId is missing', async () => {
    const req = makeRequest({ invoiceId: 'inv-001' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  test('returns 400 when invoiceId is missing', async () => {
    const req = makeRequest({ jobId: 'job-001' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  // ── JOB_PENDING (202) ──────────────────────────────────────────────────────

  test('returns 202 JOB_PENDING when Textract job is still in progress', async () => {
    mockPoll.mockRejectedValueOnce(
      new TextractJobPendingError('textract-job-001', 'IN_PROGRESS')
    )

    const req = makeRequest(VALID_BODY)
    const res = await POST(req)

    expect(res.status).toBe(202)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('JOB_PENDING')
    expect(mockApply).not.toHaveBeenCalled()
  })

  // ── Success (200) ──────────────────────────────────────────────────────────

  test('returns 200 with invoice updated to PENDING_REVIEW on success', async () => {
    const fakeBlocks = [{ BlockType: 'LINE', Text: 'Invoice #001', Confidence: 99 }]
    const fakeExtracted: ExtractedInvoiceData = {
      ...emptyExtracted,
      invoiceNumber: 'INV-2026-042',
      totalCents: 53403,
      lineItems: [],
    }
    const fakeInvoice = {
      id: 'cinvoice0000000000001',
      status: 'PENDING_REVIEW',
      invoiceNumber: 'INV-2026-042',
      aiConfidence: 0.85,
    }

    ;(mockPoll as jest.Mock).mockResolvedValueOnce(fakeBlocks)
    mockExtract.mockReturnValueOnce(fakeExtracted)
    ;(mockApply as jest.Mock).mockResolvedValueOnce(fakeInvoice)

    const req = makeRequest(VALID_BODY)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as {
      invoiceId: string
      status: string
      invoiceNumber: string
      confidence: number
      lineItemCount: number
    }
    expect(data.invoiceId).toBe('cinvoice0000000000001')
    expect(data.status).toBe('PENDING_REVIEW')
    expect(data.invoiceNumber).toBe('INV-2026-042')
    expect(data.lineItemCount).toBe(0)
  })

  test('passes extracted data to applyExtractionToInvoice', async () => {
    const fakeExtracted: ExtractedInvoiceData = {
      ...emptyExtracted,
      invoiceNumber: 'INV-001',
      totalCents: 10000,
      lineItems: [],
    }
    ;(mockPoll as jest.Mock).mockResolvedValueOnce([])
    mockExtract.mockReturnValueOnce(fakeExtracted)
    ;(mockApply as jest.Mock).mockResolvedValueOnce({
      id: VALID_BODY.invoiceId,
      status: 'PENDING_REVIEW',
      invoiceNumber: 'INV-001',
      aiConfidence: 0.85,
    })

    const req = makeRequest(VALID_BODY)
    await POST(req)

    expect(mockApply).toHaveBeenCalledWith(VALID_BODY.invoiceId, fakeExtracted)
  })

  test('passes Textract blocks to extractInvoiceData', async () => {
    const fakeBlocks = [{ BlockType: 'LINE', Text: 'Invoice #001' }]
    ;(mockPoll as jest.Mock).mockResolvedValueOnce(fakeBlocks)
    mockExtract.mockReturnValueOnce(emptyExtracted)
    ;(mockApply as jest.Mock).mockResolvedValueOnce({
      id: VALID_BODY.invoiceId,
      status: 'PENDING_REVIEW',
      invoiceNumber: 'PENDING',
      aiConfidence: 0,
    })

    const req = makeRequest(VALID_BODY)
    await POST(req)

    expect(mockExtract).toHaveBeenCalledWith(fakeBlocks)
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  test('returns 500 when pollTextractResult throws a non-pending error', async () => {
    mockPoll.mockRejectedValueOnce(new Error('Textract job abc123 failed: S3 access denied'))

    const req = makeRequest(VALID_BODY)
    const res = await POST(req)

    expect(res.status).toBe(500)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('INTERNAL_ERROR')
  })

  test('returns 500 when applyExtractionToInvoice throws', async () => {
    ;(mockPoll as jest.Mock).mockResolvedValueOnce([])
    mockExtract.mockReturnValueOnce(emptyExtracted)
    ;(mockApply as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'))

    const req = makeRequest(VALID_BODY)
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
