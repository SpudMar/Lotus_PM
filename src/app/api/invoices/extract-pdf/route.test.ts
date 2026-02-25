/**
 * Tests for POST /api/invoices/extract-pdf
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 403 wrong role / missing permission
 *   - 400 no file attached
 *   - 415 non-PDF file
 *   - 200 success with mocked Textract + AI response
 *   - 422 when AI returns null (nothing extracted)
 *   - 500 on Textract AWS error
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/invoices/ai-processor', () => ({
  processWithAI: jest.fn(),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { TextractClient } from '@aws-sdk/client-textract'
import { requirePermission } from '@/lib/auth/session'
import { processWithAI } from '@/lib/modules/invoices/ai-processor'
import { POST, _setTextractClientForTest, _resetTextractClient } from './route'

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/extract-pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(pmSession as never)
    _resetTextractClient()
  })

  afterEach(() => {
    _resetTextractClient()
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

  // ── Success ─────────────────────────────────────────────────────────────────

  it('returns 200 with extracted data on success', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
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

  it('passes extracted text to processWithAI', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
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

  // ── AI failure paths ────────────────────────────────────────────────────────

  it('returns 422 when AI returns null (nothing extracted)', async () => {
    _setTextractClientForTest(mockTextractClientWith(mockTextractBlocks))
    mockProcessWithAI.mockResolvedValue(null)

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
