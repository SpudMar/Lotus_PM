/**
 * Unit tests for AI Invoice Processor (Bedrock Claude integration).
 *
 * Uses _setBedrockClientForTest / _resetBedrockClient to inject a mock
 * Bedrock client so no real AWS calls are made.
 *
 * Test scenarios:
 *   1. Clean invoice (all HIGH confidence) → well-structured AIProcessingResult
 *   2. Missing codes (NONE confidence on some lines) → result returned, lines have NONE confidence
 *   3. Bedrock error (client throws) → returns null (graceful fallback)
 *   4. Response parsing edge cases (missing fields, wrong types) → coercion works
 *   5. No tool use response → returns null
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    ndisPriceGuideVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ndisSupportItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import {
  processWithAI,
  _setBedrockClientForTest,
  _resetBedrockClient,
  _testExports,
  type AIProcessingInput,
} from './ai-processor'

import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseInput: AIProcessingInput = {
  extractedText: 'Support Worker - Monday 2 hrs @ $67.56 = $135.12',
  invoiceId: 'inv_test_001',
  providerName: 'Test Support Services Pty Ltd',
  providerAbn: '12345678901',
  providerType: 'SUPPORT_WORKER',
  participantName: 'Jane Doe',
  participantNdisNumber: '123456789',
  participantPlanCategories: ['01', '15'],
  historicalPatterns: [
    { categoryCode: '01', itemNumber: '01_002_0107_1_1', occurrences: 12 },
  ],
}

function makeToolUseResponse(toolInput: Record<string, unknown>) {
  return {
    output: {
      message: {
        content: [
          {
            toolUse: {
              name: 'extract_invoice_data',
              input: toolInput,
            },
          },
        ],
      },
    },
  }
}

function makeMockClient(response: unknown): BedrockRuntimeClient {
  return {
    send: jest.fn().mockResolvedValue(response),
  } as unknown as BedrockRuntimeClient
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetBedrockClient()
})

afterEach(() => {
  _resetBedrockClient()
})

describe('processWithAI', () => {
  it('returns structured result for clean invoice with HIGH confidence', async () => {
    const toolInput = {
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-02-01',
      providerAbn: '12345678901',
      providerName: 'Test Support Services Pty Ltd',
      participantNdisNumber: '123456789',
      participantName: 'Jane Doe',
      totalCents: 13512,
      gstCents: 0,
      lineItems: [
        {
          description: 'Support Worker - Monday',
          suggestedNdisCode: '01_002_0107_1_1',
          codeConfidence: 'HIGH',
          codeReasoning: 'Matched weekday support worker code',
          serviceDate: '2026-02-01',
          quantity: 2,
          unitPriceCents: 6756,
          totalCents: 13512,
          claimType: 'STANDARD',
          dayType: 'WEEKDAY',
          gstApplicable: false,
        },
      ],
      overallConfidence: 'HIGH',
      flags: [],
    }

    _setBedrockClientForTest(makeMockClient(makeToolUseResponse(toolInput)))

    const result = await processWithAI(baseInput)

    expect(result).not.toBeNull()
    expect(result?.invoiceNumber).toBe('INV-001')
    expect(result?.overallConfidence).toBe('HIGH')
    expect(result?.lineItems).toHaveLength(1)
    expect(result?.lineItems[0]?.codeConfidence).toBe('HIGH')
    expect(result?.lineItems[0]?.suggestedNdisCode).toBe('01_002_0107_1_1')
    expect(result?.lineItems[0]?.totalCents).toBe(13512)
    expect(result?.flags).toEqual([])
  })

  it('returns result with NONE confidence lines when codes are missing', async () => {
    const toolInput = {
      invoiceNumber: 'INV-002',
      invoiceDate: '2026-02-05',
      providerAbn: null,
      providerName: 'Unknown Provider',
      participantNdisNumber: null,
      participantName: null,
      totalCents: 20000,
      gstCents: 0,
      lineItems: [
        {
          description: 'Unknown therapy service',
          suggestedNdisCode: null,
          codeConfidence: 'NONE',
          codeReasoning: 'Service description unclear — code cannot be determined',
          serviceDate: '2026-02-05',
          quantity: 1,
          unitPriceCents: 20000,
          totalCents: 20000,
          claimType: 'STANDARD',
          dayType: null,
          gstApplicable: false,
        },
      ],
      overallConfidence: 'LOW',
      flags: ['Code could not be determined for line 1'],
    }

    _setBedrockClientForTest(makeMockClient(makeToolUseResponse(toolInput)))

    const result = await processWithAI(baseInput)

    expect(result).not.toBeNull()
    expect(result?.overallConfidence).toBe('LOW')
    expect(result?.lineItems[0]?.codeConfidence).toBe('NONE')
    expect(result?.lineItems[0]?.suggestedNdisCode).toBeNull()
    expect(result?.flags).toHaveLength(1)
  })

  it('returns null when Bedrock client throws', async () => {
    const mockClient = {
      send: jest.fn().mockRejectedValue(new Error('ServiceUnavailableException')),
    } as unknown as BedrockRuntimeClient

    _setBedrockClientForTest(mockClient)

    const result = await processWithAI(baseInput)

    expect(result).toBeNull()
  })

  it('returns null when response has no tool use block', async () => {
    const response = {
      output: {
        message: {
          content: [{ text: 'I cannot process this invoice.' }],
        },
      },
    }

    _setBedrockClientForTest(makeMockClient(response))

    const result = await processWithAI(baseInput)

    expect(result).toBeNull()
  })

  it('returns null when response output is missing', async () => {
    _setBedrockClientForTest(makeMockClient({}))

    const result = await processWithAI(baseInput)

    expect(result).toBeNull()
  })
})

describe('_testExports.validateAndCoerceResult', () => {
  const { validateAndCoerceResult } = _testExports

  it('coerces missing fields to safe defaults', () => {
    const result = validateAndCoerceResult({
      // No invoiceNumber, invoiceDate, etc.
      lineItems: [],
      overallConfidence: 'MEDIUM',
      flags: [],
    })

    expect(result).not.toBeNull()
    expect(result?.invoiceNumber).toBeNull()
    expect(result?.invoiceDate).toBeNull()
    expect(result?.totalCents).toBeNull()
    expect(result?.overallConfidence).toBe('MEDIUM')
    expect(result?.lineItems).toEqual([])
  })

  it('defaults overallConfidence to LOW for unknown values', () => {
    const result = validateAndCoerceResult({
      lineItems: [],
      overallConfidence: 'VERY_HIGH', // unknown value
      flags: [],
    })

    expect(result?.overallConfidence).toBe('LOW')
  })

  it('rounds totalCents to integer', () => {
    const result = validateAndCoerceResult({
      lineItems: [],
      overallConfidence: 'HIGH',
      flags: [],
      totalCents: 135.5, // float
    })

    expect(result?.totalCents).toBe(136) // Math.round(135.5)
  })

  it('filters non-string flags', () => {
    const result = validateAndCoerceResult({
      lineItems: [],
      overallConfidence: 'HIGH',
      flags: ['Valid flag', 123, null, 'Another flag'],
    })

    expect(result?.flags).toEqual(['Valid flag', 'Another flag'])
  })
})

describe('_testExports.coerceLineItem', () => {
  const { coerceLineItem } = _testExports

  it('coerces invalid confidence to NONE', () => {
    const line = coerceLineItem({
      description: 'Test',
      suggestedNdisCode: '01_002_0107_1_1',
      codeConfidence: 'SUPER_HIGH', // invalid
      codeReasoning: 'Test reason',
      serviceDate: '2026-02-01',
      quantity: 1,
      unitPriceCents: 5000,
      totalCents: 5000,
      claimType: 'STANDARD',
      dayType: null,
      gstApplicable: false,
    })

    expect(line.codeConfidence).toBe('NONE')
  })

  it('coerces invalid claimType to STANDARD', () => {
    const line = coerceLineItem({
      description: 'Test',
      suggestedNdisCode: null,
      codeConfidence: 'LOW',
      codeReasoning: '',
      serviceDate: null,
      quantity: 1,
      unitPriceCents: 0,
      totalCents: 0,
      claimType: 'UNKNOWN_TYPE', // invalid
      dayType: null,
      gstApplicable: false,
    })

    expect(line.claimType).toBe('STANDARD')
  })

  it('coerces invalid dayType to null', () => {
    const line = coerceLineItem({
      description: 'Test',
      suggestedNdisCode: null,
      codeConfidence: 'MEDIUM',
      codeReasoning: '',
      serviceDate: null,
      quantity: 1,
      unitPriceCents: 0,
      totalCents: 0,
      claimType: 'STANDARD',
      dayType: 'TUESDAY', // invalid
      gstApplicable: true,
    })

    expect(line.dayType).toBeNull()
  })

  it('handles missing description with fallback', () => {
    const line = coerceLineItem({
      // no description
      codeConfidence: 'LOW',
      codeReasoning: '',
      quantity: 1,
      unitPriceCents: 0,
      totalCents: 0,
      claimType: 'STANDARD',
      gstApplicable: false,
    })

    expect(line.description).toBe('Unknown')
  })
})
