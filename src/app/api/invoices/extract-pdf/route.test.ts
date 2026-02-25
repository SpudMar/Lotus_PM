/**
 * Tests for POST /api/invoices/extract-pdf
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 403 wrong role / missing permission
 *   - 400 no file attached
 *   - 415 non-PDF file
 *   - 200 success with mocked Textract + AI response (includes s3Key/s3Bucket)
 *   - 200 fallback success when full AI returns null but fallback succeeds
 *   - 422 when both AI paths return null
 *   - 500 on Textract AWS error
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/invoices/ai-processor', () => ({
  processWithAI: jest.fn(),
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ ...input })),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { TextractClient } from '@aws-sdk/client-textract'
import { S3Client } from '@aws-sdk/client-s3'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { requirePermission } from '@/lib/auth/session'
import { processWithAI } from '@/lib/modules/invoices/ai-processor'
import {
  POST,
  _setTextractClientForTest,
  _resetTextractClient,
  _setS3ClientForTest,
  _resetS3Client,
  _setBedrockFallbackClientForTest,
  _resetBedrockFallbackClient,
} from './route'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockProcessWithAI = processWithAI as jest.MockedFunction<typeof processWithAI>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const pmSession = {
  user: { id: 'user-pm', name: 'PM User', role: 'PLAN_MANAGER', email: 'pm@test.com' },
}

/** Minimal valid Textract blocks with a LINE block containing text */
const mockTextractBlocks = [
  {
    BlockType: 'LINE',
    Text: 'Tax Invoice',
    Confidence: 99.5,
    Id: 'block-001',
  },
  {
    BlockType: 'LINE',
    Text: 'Invoice Number: INV-2026-001',
    Confidence: 98.2,
    Id: 'block-002',
  },
  {
    BlockType: 'LINE',
    Text: 'Invoice Date: 15/02/2026',
    Confidence: 97.8,
    Id: 'block-003',
  },
  {
    BlockType: 'LINE',
    Text: 'ABN: 12 345 678 901',
    Confidence: 99.1,
    Id: 'block-004',
  },
  {
    BlockType: 'LINE',
    Text: 'Support Coordination 15_042_0128_1_3 2.0 hrs $150.00 $300.00',
    Confidence: 95.3,
    Id: 'block-005',
  },
  {
    BlockType: 'LINE',
    Text: 'Total Due: $300.00',
    Confidence: 99.0,
    Id: 'block-006',
  },
]

/** Minimal valid AI result */
const mockAiResult = {
  invoiceNumber: 'INV-2026-001',
  invoiceDate: '2026-02-15',
  providerAbn: '12345678901',
  providerName: 'Test Provider Pty Ltd',
  participantNdisNumber: null,
  participantName: null,
  totalCents: 30000,
  gstCents: 0,
  lineItems: [
    {
      description: 'Support Coordination',
      suggestedNdisCode: '15_042_0128_1_3',
      codeConfidence: 'HIGH' as const,
      codeReasoning: 'Matches support coordination code',
      serviceDate: '2026-02-15',
      quantity: 2,
      unitPriceCents: 15000,
      totalCents: 30000,
      claimType: 'STANDARD' as const,
      dayType: 'WEEKDAY' as const,
      gstApplicable: false,
    },
  ],
  overallConfidence: 'HIGH' as const,
  flags: [],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a FormData request with the given file (or none) */
function makeMultipartRequest(file?: File | null): NextRequest {
  const formData = new FormData()
  if (file) {
    formData.append('file', file)
  }
  return new NextRequest('http://localhost/api/invoices/extract-pdf', {
    method: 'POST',
    body: formData,
  })
}

/** Create a minimal fake PDF File */
function makePdfFile(name = 'invoice.pdf', type = 'application/pdf', sizeBytes = 1024): File {
  const content = new Uint8Array(sizeBytes).fill(0x25) // Fill with '%' — PDF magic bytes start with %
  return new File([content], name, { type })
}

/** Create a mock TextractClient that returns the given blocks */
function mockTextractClientWith(blocks: unknown[], shouldThrow?: Error): TextractClient {
  const mockSend = jest.fn()
  if (shouldThrow) {
    mockSend.mockRejectedValue(shouldThrow)
  } else {
    mockSend.mockResolvedValue({ Blocks: blocks })
  }
  return { send: mockSend } as unknown as TextractClient
}

/** Create a mock S3Client that succeeds on PutObject */
function mockS3Client(shouldThrow?: Error): S3Client {
  const mockSend = jest.fn()
  if (shouldThrow) {
    mockSend.mockRejectedValue(shouldThrow)
  } else {
    mockSend.mockResolvedValue({})
  }
  return { send: mockSend } as unknown as S3Client
}

/** Create a mock BedrockRuntimeClient that returns the given JSON text */
function mockBedrockFallbackClient(jsonText: string | null): BedrockRuntimeClient {
  const mockSend = jest.fn()
  if (jsonText === null) {
    mockSend.mockResolvedValue({ output: { message: { content: [] } } })
  } else {
    mockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: jsonText }],
        },
      },
    })
  }
  return { send: mockSend } as unknown as BedrockRuntimeClient
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/extract-pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(pmSession as never)
    _resetTextractClient()
    _resetS3Client()
    _resetBedrockFallbackClient()
    // Set S3_BUCKET_INVOICES so S3 upload is attempted
    process.env['S3_BUCKET_INVOICES'] = 'lotus-pm-invoices-test'
  })

  afterEach(() => {
    _resetTextractClient()
    _resetS3Client()
    _resetBedrockFallbackClient()
    delete process.env['S3_BUCKET_INVOICES']
  })

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when user lacks invoices:write permission', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  // ── Input validation ────────────────────────────────────────────────────────

  it('returns 400 when no file is attached', async () => {
    const res = await POST(makeMultipartRequest(null))

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 415 when file is not a PDF', async () => {
    const textFile = new File(['plain text content'], 'document.txt', { type: 'text/plain' })
    const res = await POST(makeMultipartRequest(textFile))

    expect(res.status).toBe(415)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNSUPPORTED_MEDIA_TYPE')
  })

  it('returns 400 when file exceeds 10 MB limit', async () => {
    // 11 MB file
    const oversizedFile = makePdfFile('big.pdf', 'application/pdf', 11 * 1024 * 1024)
    const res = await POST(makeMultipartRequest(oversizedFile))

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string; error: string }
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toContain('10 MB')
  })

  // ── Success (full AI path) ──────────────────────────────────────────────────

  it('returns 200 with extracted data and s3Key/s3Bucket on success', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    _setS3ClientForTest(mockS3Client())
    mockProcessWithAI.mockResolvedValue(mockAiResult)

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data).toBeDefined()
    expect(body.data.invoiceNumber).toBe('INV-2026-001')
    expect(body.data.invoiceDate).toBe('2026-02-15')
    expect(body.data.providerName).toBe('Test Provider Pty Ltd')
    expect(body.data.providerAbn).toBe('12345678901')
    expect(body.data.totalAmountCents).toBe(30000)
    // S3 fields should be present
    expect(typeof body.data.s3Key).toBe('string')
    expect(body.data.s3Bucket).toBe('lotus-pm-invoices-test')
    expect(Array.isArray(body.data.lineItems)).toBe(true)
    const items = body.data.lineItems as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]?.supportItemCode).toBe('15_042_0128_1_3')
    expect(items[0]?.supportItemName).toBe('Support Coordination')
    expect(items[0]?.quantity).toBe(2)
    expect(items[0]?.unitPriceCents).toBe(15000)
    expect(items[0]?.totalCents).toBe(30000)
    expect(items[0]?.serviceDate).toBe('2026-02-15')
  })

  it('returns s3Key with uploads/manual/ prefix', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    _setS3ClientForTest(mockS3Client())
    mockProcessWithAI.mockResolvedValue(mockAiResult)

    const res = await POST(makeMultipartRequest(makePdfFile()))
    const body = await res.json() as { data: { s3Key: string } }

    expect(body.data.s3Key).toMatch(/^uploads\/manual\/\d+-[a-f0-9-]+\.pdf$/)
  })

  it('passes extracted text to processWithAI', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    _setS3ClientForTest(mockS3Client())
    mockProcessWithAI.mockResolvedValue(mockAiResult)

    await POST(makeMultipartRequest(makePdfFile()))

    expect(mockProcessWithAI).toHaveBeenCalledTimes(1)
    const callArg = mockProcessWithAI.mock.calls[0]?.[0]
    expect(callArg).toBeDefined()
    expect(callArg?.extractedText).toContain('Tax Invoice')
    expect(callArg?.extractedText).toContain('INV-2026-001')
    // No DB context on preview extraction
    expect(callArg?.invoiceId).toBe('extract-preview')
    expect(callArg?.providerName).toBeNull()
    expect(callArg?.participantName).toBeNull()
  })

  // ── S3 upload robustness ────────────────────────────────────────────────────

  it('returns null s3Key/s3Bucket when S3 upload fails but extraction succeeds', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    _setS3ClientForTest(mockS3Client(new Error('S3 network error')))
    mockProcessWithAI.mockResolvedValue(mockAiResult)

    const res = await POST(makeMultipartRequest(makePdfFile()))

    // Should still return 200 — extraction succeeds even if S3 fails
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { s3Key: unknown; s3Bucket: unknown } }
    expect(body.data.s3Key).toBeNull()
    expect(body.data.s3Bucket).toBeNull()
  })

  // ── Fallback extraction path ────────────────────────────────────────────────

  it('returns 200 with fallback data when full AI returns null but fallback succeeds', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    _setS3ClientForTest(mockS3Client())
    mockProcessWithAI.mockResolvedValue(null)

    const fallbackJson = JSON.stringify({
      providerName: 'Fallback Provider',
      providerAbn: '12345678901',
      invoiceNumber: 'INV-FB-001',
      invoiceDate: '2026-02-15',
      totalAmountCents: 30000,
    })
    _setBedrockFallbackClientForTest(mockBedrockFallbackClient(fallbackJson))

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.providerName).toBe('Fallback Provider')
    expect(body.data.invoiceNumber).toBe('INV-FB-001')
    expect(body.data.totalAmountCents).toBe(30000)
    // Fallback returns empty line items
    expect(body.data.lineItems).toEqual([])
    // S3 key should still be returned
    expect(typeof body.data.s3Key).toBe('string')
  })

  // ── AI failure paths ────────────────────────────────────────────────────────

  it('returns 422 when both AI and fallback return null', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    _setS3ClientForTest(mockS3Client())
    mockProcessWithAI.mockResolvedValue(null)
    _setBedrockFallbackClientForTest(mockBedrockFallbackClient(null))

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(422)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('AI_EXTRACTION_FAILED')
  })

  it('returns 422 when Textract returns no text blocks', async () => {
    // Blocks with no LINE type — empty extraction
    _setTextractClientForTest(mockTextractClientWith([
      { BlockType: 'PAGE', Id: 'page-001' },
    ]))

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(422)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('EXTRACTION_EMPTY')
  })

  // ── AWS error ───────────────────────────────────────────────────────────────

  it('returns 500 on Textract AWS error', async () => {
    const awsError = new Error('AWS Textract service unavailable')
    awsError.name = 'ServiceUnavailableException'
    _setTextractClientForTest(mockTextractClientWith([], awsError))

    const res = await POST(makeMultipartRequest(makePdfFile()))

    expect(res.status).toBe(500)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('EXTRACTION_ERROR')
  })
})
