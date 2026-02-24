/**
 * Unit tests for the Invoice AI Processing Engine.
 *
 * Mocks Prisma and the AI processor. Tests routing logic only:
 *   1. All HIGH + valid lines → AUTO_APPROVED
 *   2. LOW overall confidence → NEEDS_REVIEW
 *   3. AI returns null → NEEDS_REVIEW
 *   4. Duplicate line detected → AUTO_REJECTED
 *   5. MEDIUM confidence → NEEDS_CODES
 *   6. Inactive participant → AUTO_REJECTED
 *   7. Inactive provider → AUTO_REJECTED
 *   8. Inactive plan → AUTO_REJECTED
 *   9. BLOCKING flag present → NEEDS_REVIEW
 *  10. invoiceApprovalEnabled=true + all pass → PARTICIPANT_APPROVAL
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'inv_001' }),
    },
    invInvoiceLine: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    invItemPattern: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    crmFlag: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ndisPriceGuideVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ndisSupportItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/modules/price-guide/price-guide', () => ({
  validateLineItemPrice: jest.fn().mockResolvedValue({ valid: true }),
}))

jest.mock('@/lib/modules/crm/flags', () => ({
  getActiveFlags: jest.fn().mockResolvedValue([]),
  FlagSeverity: {
    ADVISORY: 'ADVISORY',
    BLOCKING: 'BLOCKING',
  },
}))

jest.mock('./ai-processor', () => ({
  processWithAI: jest.fn(),
}))

jest.mock('./invoices', () => ({
  approveInvoice: jest.fn().mockResolvedValue({ id: 'inv_001', status: 'APPROVED' }),
  ValidationFailedError: class ValidationFailedError extends Error {},
}))

jest.mock('./participant-approval', () => ({
  requestParticipantApproval: jest.fn().mockResolvedValue({ token: 'tok_123', invoice: {} }),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import { processInvoice } from './processing-engine'
import { processWithAI } from './ai-processor'
import { approveInvoice } from './invoices'
import { prisma } from '@/lib/db'
import type { AIProcessingResult } from './ai-processor'

const mockProcessWithAI = processWithAI as jest.MockedFunction<typeof processWithAI>
const mockApproveInvoice = approveInvoice as jest.MockedFunction<typeof approveInvoice>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_001',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date('2026-02-01'),
    totalCents: 13512,
    aiRawData: null,
    participantId: 'part_001',
    providerId: 'prov_001',
    lines: [
      {
        id: 'line_001',
        supportItemCode: '01_002_0107_1_1',
        supportItemName: 'Support Worker',
        serviceDate: new Date('2026-02-01'),
        quantity: 2,
        unitPriceCents: 6756,
        totalCents: 13512,
      },
    ],
    provider: {
      id: 'prov_001',
      name: 'Test Support Services',
      abn: '12345678901',
      providerType: 'SUPPORT_WORKER',
      isActive: true,
    },
    participant: {
      id: 'part_001',
      firstName: 'Jane',
      lastName: 'Doe',
      ndisNumber: '123456789',
      isActive: true,
      invoiceApprovalEnabled: false,
      pricingRegion: 'NON_REMOTE',
    },
    plan: {
      id: 'plan_001',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      budgetLines: [{ categoryCode: '01' }],
    },
    ...overrides,
  }
}

function makeHighConfidenceAIResult(): AIProcessingResult {
  return {
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-02-01',
    providerAbn: '12345678901',
    providerName: 'Test Support Services',
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
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function makeInvoiceForValidation() {
  const inv = makeInvoice()
  return {
    participantId: inv.participantId,
    lines: inv.lines.map((l) => ({
      id: l.id,
      totalCents: l.totalCents,
      quantity: l.quantity,
      serviceDate: l.serviceDate,
    })),
    plan: {
      startDate: inv.plan.startDate,
      endDate: inv.plan.endDate,
      status: inv.plan.status,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()

  // Default: findUniqueOrThrow returns base invoice
  ;(mockPrisma.invInvoice.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeInvoice())

  // Default: findUnique (used by validateInvoiceLines) returns invoice with lines
  ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(makeInvoiceForValidation())

  // Default: no duplicate lines
  ;(mockPrisma.invInvoiceLine.findFirst as jest.Mock).mockResolvedValue(null)

  // Default: no blocking flags
  ;(mockPrisma.crmFlag.findFirst as jest.Mock).mockResolvedValue(null)

  // Default: no price guide
  ;(mockPrisma.ndisPriceGuideVersion.findFirst as jest.Mock).mockResolvedValue(null)
})

describe('processInvoice routing', () => {
  it('routes to AUTO_APPROVED when all HIGH confidence and valid', async () => {
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('AUTO_APPROVED')
    expect(result.aiResult).not.toBeNull()
    expect(result.validationErrors).toHaveLength(0)
    expect(mockApproveInvoice).toHaveBeenCalledWith('inv_001', expect.any(String), undefined, true)
  })

  it('routes to NEEDS_REVIEW when overall confidence is LOW', async () => {
    const aiResult = { ...makeHighConfidenceAIResult(), overallConfidence: 'LOW' as const }
    mockProcessWithAI.mockResolvedValue(aiResult)

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('NEEDS_REVIEW')
    expect(mockApproveInvoice).not.toHaveBeenCalled()
  })

  it('routes to NEEDS_REVIEW when AI returns null', async () => {
    mockProcessWithAI.mockResolvedValue(null)

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('NEEDS_REVIEW')
    expect(result.aiResult).toBeNull()
    expect(mockApproveInvoice).not.toHaveBeenCalled()
  })

  it('routes to AUTO_REJECTED when duplicate line item is found', async () => {
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    // Simulate a duplicate line found
    ;(mockPrisma.invInvoiceLine.findFirst as jest.Mock).mockResolvedValue({ id: 'line_dup' })

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('AUTO_REJECTED')
    expect(result.validationErrors).toContain(
      'Duplicate line item detected (same provider, participant, date, and code)'
    )
    expect(mockApproveInvoice).not.toHaveBeenCalled()
  })

  it('routes to NEEDS_CODES when overall confidence is MEDIUM', async () => {
    const aiResult = { ...makeHighConfidenceAIResult(), overallConfidence: 'MEDIUM' as const }
    mockProcessWithAI.mockResolvedValue(aiResult)

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('NEEDS_CODES')
    expect(mockApproveInvoice).not.toHaveBeenCalled()
  })

  it('routes to NEEDS_CODES when a line has LOW confidence', async () => {
    const aiResult = makeHighConfidenceAIResult()
    aiResult.lineItems[0]!.codeConfidence = 'LOW'
    mockProcessWithAI.mockResolvedValue(aiResult)

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('NEEDS_CODES')
  })

  it('routes to AUTO_REJECTED when participant is inactive', async () => {
    ;(mockPrisma.invInvoice.findUniqueOrThrow as jest.Mock).mockResolvedValue(
      makeInvoice({ participant: { id: 'part_001', firstName: 'Jane', lastName: 'Doe', ndisNumber: '123', isActive: false, invoiceApprovalEnabled: false, pricingRegion: 'NON_REMOTE' } })
    )
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('AUTO_REJECTED')
    expect(result.validationErrors).toContain('Participant is not active')
  })

  it('routes to AUTO_REJECTED when provider is inactive', async () => {
    ;(mockPrisma.invInvoice.findUniqueOrThrow as jest.Mock).mockResolvedValue(
      makeInvoice({ provider: { id: 'prov_001', name: 'Test', abn: '123', providerType: null, isActive: false } })
    )
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('AUTO_REJECTED')
    expect(result.validationErrors).toContain('Provider is not active')
  })

  it('routes to AUTO_REJECTED when plan is not ACTIVE', async () => {
    ;(mockPrisma.invInvoice.findUniqueOrThrow as jest.Mock).mockResolvedValue(
      makeInvoice({ plan: { id: 'plan_001', status: 'EXPIRED', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), budgetLines: [] } })
    )
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('AUTO_REJECTED')
    expect(result.validationErrors).toContain('Plan is not active')
  })

  it('routes to NEEDS_REVIEW when participant has BLOCKING flag', async () => {
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    // Simulate blocking flag found
    ;(mockPrisma.crmFlag.findFirst as jest.Mock).mockResolvedValue({ id: 'flag_001' })

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('NEEDS_REVIEW')
    expect(result.validationErrors).toContain(
      'Participant or provider has unresolved BLOCKING flag'
    )
  })

  it('routes to PARTICIPANT_APPROVAL when participant has invoiceApprovalEnabled=true', async () => {
    ;(mockPrisma.invInvoice.findUniqueOrThrow as jest.Mock).mockResolvedValue(
      makeInvoice({
        participant: {
          id: 'part_001',
          firstName: 'Jane',
          lastName: 'Doe',
          ndisNumber: '123456789',
          isActive: true,
          invoiceApprovalEnabled: true,
          pricingRegion: 'NON_REMOTE',
        },
      })
    )
    mockProcessWithAI.mockResolvedValue(makeHighConfidenceAIResult())

    const result = await processInvoice('inv_001')

    expect(result.category).toBe('PARTICIPANT_APPROVAL')
    expect(mockApproveInvoice).not.toHaveBeenCalled()
  })
})

describe('processInvoice error handling', () => {
  it('falls back to NEEDS_REVIEW when findUniqueOrThrow throws', async () => {
    ;(mockPrisma.invInvoice.findUniqueOrThrow as jest.Mock).mockRejectedValue(
      new Error('Record not found')
    )

    const result = await processInvoice('inv_nonexistent')

    expect(result.category).toBe('NEEDS_REVIEW')
    expect(result.aiResult).toBeNull()
    expect(result.validationErrors[0]).toContain('Internal processing error')
  })
})
