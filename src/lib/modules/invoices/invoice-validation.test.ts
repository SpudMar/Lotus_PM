/**
 * Unit tests for WS-F2 Invoice Validation Engine.
 *
 * Covers all validation checks and the integration with approveInvoice().
 *
 * Checks tested:
 *   1. PARTICIPANT_INACTIVE
 *   2. PROVIDER_INACTIVE
 *   3. BLOCKING_FLAG
 *   4. ADVISORY_FLAG (warning)
 *   5. INSUFFICIENT_BUDGET
 *   6. DUPLICATE_INVOICE
 *   7. PRICE_EXCEEDED
 *   8. PRICE_GUIDE_UNAVAILABLE (warning -- graceful degradation)
 *   9. All checks pass -> valid: true
 *  10. approveInvoice with validation error + force=false -> throws VALIDATION_FAILED
 *  11. approveInvoice with validation error + force=true -> approves
 *  12. PERIOD_BUDGET_EXCEEDED (warning)
 */

// ── Mocks (must come before imports) ─────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    planBudgetLine: {
      update: jest.fn(),
    },
    saServiceAgreement: {
      findFirst: jest.fn(),
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
  validateLineItemPrice: jest.fn(),
}))

jest.mock('@/lib/modules/crm/flags', () => ({
  getActiveFlags: jest.fn(),
  FlagSeverity: {
    ADVISORY: 'ADVISORY',
    BLOCKING: 'BLOCKING',
  },
}))

jest.mock('@/lib/modules/plans/funding-periods', () => ({
  getActivePeriodBudget: jest.fn(),
}))

jest.mock('@/lib/modules/crm/provider-participant-blocks', () => ({
  checkProviderBlocked: jest.fn().mockResolvedValue({ blocked: false }),
}))

jest.mock('@/lib/modules/crm/approved-supports', () => ({
  checkSupportApproved: jest.fn().mockResolvedValue({ approved: true }),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { validateLineItemPrice } from '@/lib/modules/price-guide/price-guide'
import { getActiveFlags } from '@/lib/modules/crm/flags'
import { getActivePeriodBudget } from '@/lib/modules/plans/funding-periods'
import { validateInvoiceForApproval } from './invoice-validation'
import { approveInvoice, ValidationFailedError } from './invoices'

// ── Type casts ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any
const mockValidateLineItemPrice = validateLineItemPrice as jest.MockedFunction<typeof validateLineItemPrice>
const mockGetActiveFlags = getActiveFlags as jest.MockedFunction<typeof getActiveFlags>
const mockGetActivePeriodBudget = getActivePeriodBudget as jest.MockedFunction<typeof getActivePeriodBudget>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'part-001',
    firstName: 'Jane',
    lastName: 'Smith',
    ndisNumber: '430000001',
    isActive: true,
    pricingRegion: 'NON_REMOTE',
    ...overrides,
  }
}

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prov-001',
    name: 'Blue Mountains Allied Health',
    abn: '11111111111',
    isActive: true,
    ...overrides,
  }
}

function makeBudgetLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bline-001',
    categoryCode: '15',
    allocatedCents: 500000,
    spentCents: 0,
    ...overrides,
  }
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-001',
    invoiceId: 'inv-001',
    supportItemCode: '15_042_0128_1_3',
    supportItemName: 'Support Coordination',
    categoryCode: '15',
    serviceDate: new Date('2026-01-15'),
    quantity: 1,
    unitPriceCents: 10000,
    totalCents: 10000,
    gstCents: 0,
    budgetLineId: 'bline-001',
    budgetLine: makeBudgetLine(),
    isPriceGuideCompliant: true,
    priceGuideMaxCents: null,
    ...overrides,
  }
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2026-001',
    providerId: 'prov-001',
    participantId: 'part-001',
    planId: 'plan-001',
    totalCents: 10000,
    status: 'PENDING_REVIEW',
    participant: makeParticipant(),
    provider: makeProvider(),
    lines: [makeLine()],
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockGetActiveFlags.mockResolvedValue([])
  mockValidateLineItemPrice.mockResolvedValue({ valid: true, capCents: 15000 })
  mockPrisma.invInvoice.findFirst.mockResolvedValue(null) // no duplicate by default
  mockPrisma.planBudgetLine.update.mockResolvedValue({})
  mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(null) // no active SA by default
  mockPrisma.invInvoice.aggregate.mockResolvedValue({ _sum: { totalCents: null } })
  mockGetActivePeriodBudget.mockResolvedValue(null) // no period budget by default
})

// ── validateInvoiceForApproval tests ─────────────────────────────────────────

describe('validateInvoiceForApproval', () => {
  // ── Check 1: PARTICIPANT_INACTIVE ──────────────────────────────────────────

  it('returns PARTICIPANT_INACTIVE error when participant is not active', async () => {
    const inv = makeInvoice({
      participant: makeParticipant({ isActive: false }),
    })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'PARTICIPANT_INACTIVE' })
    )
  })

  // ── Check 2: PROVIDER_INACTIVE ─────────────────────────────────────────────

  it('returns PROVIDER_INACTIVE error when provider is not active', async () => {
    const inv = makeInvoice({
      provider: makeProvider({ isActive: false }),
    })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'PROVIDER_INACTIVE' })
    )
  })

  // ── Check 3: BLOCKING_FLAG ─────────────────────────────────────────────────

  it('returns BLOCKING_FLAG error when a BLOCKING flag exists', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockGetActiveFlags.mockResolvedValue([
      {
        id: 'flag-001',
        severity: 'BLOCKING',
        reason: 'Suspected fraudulent invoices -- refer to compliance team',
        createdById: 'user-001',
        createdBy: { id: 'user-001', name: 'Jane PM' },
        participantId: 'part-001',
        providerId: null,
        resolvedAt: null,
        deletedAt: null,
        createdAt: new Date(),
      },
    ] as never[])

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'BLOCKING_FLAG',
        message: 'Suspected fraudulent invoices -- refer to compliance team',
      })
    )
  })

  // ── Check 8: ADVISORY_FLAG (warning) ──────────────────────────────────────

  it('returns ADVISORY_FLAG warning when an ADVISORY flag exists', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockGetActiveFlags.mockResolvedValue([
      {
        id: 'flag-002',
        severity: 'ADVISORY',
        reason: 'Watch for automated invoices after cancellation',
        createdById: 'user-001',
        createdBy: { id: 'user-001', name: 'Jane PM' },
        participantId: 'part-001',
        providerId: null,
        resolvedAt: null,
        deletedAt: null,
        createdAt: new Date(),
      },
    ] as never[])

    const result = await validateInvoiceForApproval('inv-001')

    // Advisory flag is a warning, not an error -- invoice should still be valid
    expect(result.valid).toBe(true)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'ADVISORY_FLAG',
        message: 'Watch for automated invoices after cancellation',
      })
    )
  })

  // ── Check 4: INSUFFICIENT_BUDGET ──────────────────────────────────────────

  it('returns INSUFFICIENT_BUDGET error when invoice lines exceed budget', async () => {
    const inv = makeInvoice({
      lines: [
        makeLine({
          totalCents: 600000, // 6000.00 -- exceeds budget of 5000.00
          budgetLine: makeBudgetLine({ allocatedCents: 500000, spentCents: 0 }),
        }),
      ],
    })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INSUFFICIENT_BUDGET' })
    )
  })

  // ── Check 7: DUPLICATE_INVOICE ────────────────────────────────────────────

  it('returns DUPLICATE_INVOICE error when same invoice number and provider already exists', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    // Simulate existing duplicate (different id, same invoiceNumber + providerId)
    mockPrisma.invInvoice.findFirst.mockResolvedValue({
      id: 'inv-999',
      status: 'APPROVED',
    })

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_INVOICE' })
    )
  })

  // ── Check 6: PRICE_EXCEEDED ────────────────────────────────────────────────

  it('returns PRICE_EXCEEDED error when line item price exceeds price guide cap', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockValidateLineItemPrice.mockResolvedValue({
      valid: false,
      capCents: 8000,
      message: 'Unit price $100.00 exceeds NDIS price guide cap of $80.00 for standard region',
    })

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'PRICE_EXCEEDED',
        lineId: 'line-001',
      })
    )
  })

  // ── Check 6 graceful degradation: PRICE_GUIDE_UNAVAILABLE ────────────────

  it('returns PRICE_GUIDE_UNAVAILABLE warning when price guide throws (not imported yet)', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockValidateLineItemPrice.mockRejectedValue(new Error('No price guide version found'))

    const result = await validateInvoiceForApproval('inv-001')

    // Should be valid -- price guide unavailability is only a warning
    expect(result.valid).toBe(true)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'PRICE_GUIDE_UNAVAILABLE' })
    )
    expect(result.errors).toHaveLength(0)
  })

  // ── All checks pass ───────────────────────────────────────────────────────

  it('returns valid=true with no errors or warnings when all checks pass', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockGetActiveFlags.mockResolvedValue([])
    mockValidateLineItemPrice.mockResolvedValue({ valid: true, capCents: 15000 })
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  // -- Check 9: SA_COMPLIANCE -- ITEM_NOT_IN_SA ----------------------------

  it('returns ITEM_NOT_IN_SA warning when invoice line item not in active SA', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue({
      id: 'sa-001',
      agreementRef: 'SA-20260101-ABCD',
      rateLines: [
        {
          id: 'rl-001',
          supportItemCode: '15_999_9999_1_3',
          agreedRateCents: 15000,
        },
      ],
      budgetAllocations: [],
    })

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true) // warnings only
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'ITEM_NOT_IN_SA',
        lineId: 'line-001',
      })
    )
  })

  // -- Check 9: SA_COMPLIANCE -- PRICE_ABOVE_SA_RATE -----------------------

  it('returns PRICE_ABOVE_SA_RATE warning when invoice price exceeds SA agreed rate', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue({
      id: 'sa-001',
      agreementRef: 'SA-20260101-ABCD',
      rateLines: [
        {
          id: 'rl-001',
          supportItemCode: '15_042_0128_1_3',
          agreedRateCents: 8000, // SA rate $80, invoice has $100
        },
      ],
      budgetAllocations: [],
    })

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'PRICE_ABOVE_SA_RATE',
        lineId: 'line-001',
      })
    )
  })

  // -- Check 9: SA_COMPLIANCE -- SA_BUDGET_EXCEEDED ------------------------

  it('returns SA_BUDGET_EXCEEDED warning when invoice would exceed SA allocation', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue({
      id: 'sa-001',
      agreementRef: 'SA-20260101-ABCD',
      rateLines: [],
      budgetAllocations: [
        { allocatedCents: 5000 }, // $50 total SA allocation
      ],
    })

    // Existing approved spend = $45
    mockPrisma.invInvoice.aggregate.mockResolvedValue({ _sum: { totalCents: 4500 } })
    // Invoice adds $100 (10000 cents) -> total $145 > $50

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'SA_BUDGET_EXCEEDED',
      })
    )
  })

  // -- Check 12: PERIOD_BUDGET_EXCEEDED (warning) -------------------------

  it('returns PERIOD_BUDGET_EXCEEDED warning when line total exceeds period budget', async () => {
    const inv = makeInvoice({
      lines: [
        makeLine({
          totalCents: 200000, // $2000.00
          budgetLine: makeBudgetLine({ categoryCode: '15' }),
        }),
      ],
    })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    // Period budget has only $1000 remaining
    mockGetActivePeriodBudget.mockResolvedValue({
      periodId: 'period-001',
      allocatedCents: 250000,
      spentCents: 150000,
      remainingCents: 100000, // $1000 remaining
    })

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true) // warning only, not an error
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'PERIOD_BUDGET_EXCEEDED',
        lineId: 'line-001',
      })
    )
  })

  it('does not warn when line total fits within period budget', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    // Period budget has plenty remaining
    mockGetActivePeriodBudget.mockResolvedValue({
      periodId: 'period-001',
      allocatedCents: 500000,
      spentCents: 0,
      remainingCents: 500000,
    })

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true)
    const periodWarnings = result.warnings.filter((w) => w.code === 'PERIOD_BUDGET_EXCEEDED')
    expect(periodWarnings).toHaveLength(0)
  })

  it('skips period budget check when no period budget exists for the category', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    // No period budget found (returns null)
    mockGetActivePeriodBudget.mockResolvedValue(null)

    const result = await validateInvoiceForApproval('inv-001')

    expect(result.valid).toBe(true)
    const periodWarnings = result.warnings.filter((w) => w.code === 'PERIOD_BUDGET_EXCEEDED')
    expect(periodWarnings).toHaveLength(0)
  })

  it('does not block approval when period budget check fails', async () => {
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(makeInvoice())
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    // Period budget service throws
    mockGetActivePeriodBudget.mockRejectedValue(new Error('DB connection error'))

    const result = await validateInvoiceForApproval('inv-001')

    // Should still be valid -- period budget check is advisory
    expect(result.valid).toBe(true)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'PERIOD_BUDGET_EXCEEDED',
        message: expect.stringContaining('Unable to check funding period budget'),
      })
    )
  })

  it('skips period budget check when invoice has no planId', async () => {
    const inv = makeInvoice({ planId: null })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.findFirst.mockResolvedValue(null)

    const result = await validateInvoiceForApproval('inv-001')

    expect(mockGetActivePeriodBudget).not.toHaveBeenCalled()
  })

})

// ── approveInvoice integration tests ─────────────────────────────────────────

describe('approveInvoice', () => {
  const approvedInvoice = {
    id: 'inv-001',
    status: 'APPROVED',
    totalCents: 10000,
    lines: [
      {
        id: 'line-001',
        budgetLineId: 'bline-001',
        totalCents: 10000,
        budgetLine: makeBudgetLine(),
      },
    ],
  }

  // ── force=false with errors -> throws ValidationFailedError ────────────────

  it('throws ValidationFailedError when validation errors exist and force=false', async () => {
    // Make participant inactive -> PARTICIPANT_INACTIVE error
    const inv = makeInvoice({
      participant: makeParticipant({ isActive: false }),
    })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    await expect(approveInvoice('inv-001', 'user-001')).rejects.toThrow(ValidationFailedError)
    await expect(approveInvoice('inv-001', 'user-001')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      validation: expect.objectContaining({
        valid: false,
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'PARTICIPANT_INACTIVE' }),
        ]),
      }),
    })

    // Invoice should NOT have been updated
    expect(mockPrisma.invInvoice.update).not.toHaveBeenCalled()
  })

  // ── force=true with errors -> approves anyway ──────────────────────────────

  it('approves invoice when force=true even with validation errors', async () => {
    // Make participant inactive -> would normally block approval
    const inv = makeInvoice({
      participant: makeParticipant({ isActive: false }),
    })
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.update.mockResolvedValue(approvedInvoice)

    const result = await approveInvoice('inv-001', 'user-001', undefined, true)

    expect(result.status).toBe('APPROVED')
    // Audit log should include forced: true
    const { createAuditLog } = jest.requireMock('@/lib/modules/core/audit') as {
      createAuditLog: jest.MockedFunction<(opts: Record<string, unknown>) => Promise<void>>
    }
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ forced: true }),
      })
    )
  })
})
