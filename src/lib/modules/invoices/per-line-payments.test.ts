/**
 * Unit tests for Wave 3 — Per-Line Partial Payments.
 *
 * Tests cover:
 *   1. All lines approved via lineDecisions → full invoice approval
 *   2. Mixed decisions: some approved, some rejected → only approved lines in claim, invoice APPROVED
 *   3. All lines rejected → invoice status REJECTED
 *   4. Adjust line → adjusted amount used in budget deduction & subtotalCents
 *   5. Standard approval (no lineDecisions) still works as before
 *
 * Also tests claim-generation.ts Wave 3 behavior:
 *   6. generateClaimBatch skips REJECTED lines
 *   7. generateClaimBatch uses adjustedAmountCents for ADJUSTED lines
 */

// ── Mocks (must come before imports) ─────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    invInvoiceLine: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    planBudgetLine: {
      update: jest.fn(),
    },
    clmClaim: {
      findFirst: jest.fn(),
      create: jest.fn(),
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
import { approveInvoice } from './invoices'
import { generateClaimBatch } from '@/lib/modules/claims/claim-generation'

// ── Type casts ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any
const mockValidateLineItemPrice = validateLineItemPrice as jest.MockedFunction<typeof validateLineItemPrice>
const mockGetActiveFlags = getActiveFlags as jest.MockedFunction<typeof getActiveFlags>

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
    lineStatus: 'PENDING',
    rejectionReason: null,
    adjustedAmountCents: null,
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
    totalCents: 20000,
    subtotalCents: 20000,
    status: 'PENDING_REVIEW',
    participant: makeParticipant(),
    provider: makeProvider(),
    lines: [
      makeLine({ id: 'line-001', totalCents: 10000 }),
      makeLine({ id: 'line-002', totalCents: 10000, budgetLineId: 'bline-002', budgetLine: makeBudgetLine({ id: 'bline-002' }) }),
    ],
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockGetActiveFlags.mockResolvedValue([])
  mockValidateLineItemPrice.mockResolvedValue({ valid: true, capCents: 15000 })
  mockPrisma.invInvoice.findFirst.mockResolvedValue(null)
  mockPrisma.planBudgetLine.update.mockResolvedValue({})
  mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(null)
  mockPrisma.invInvoice.aggregate.mockResolvedValue({ _sum: { totalCents: null } })
  mockPrisma.invInvoiceLine.update.mockResolvedValue({})
})

// ── approveInvoice with lineDecisions ─────────────────────────────────────────

describe('approveInvoice with lineDecisions', () => {
  it('all lines APPROVE -- approves invoice and updates budget for all lines', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    const updatedLines = [
      makeLine({ id: 'line-001', totalCents: 10000, lineStatus: 'APPROVE' }),
      makeLine({ id: 'line-002', totalCents: 10000, budgetLineId: 'bline-002', budgetLine: makeBudgetLine({ id: 'bline-002' }), lineStatus: 'APPROVE' }),
    ]
    mockPrisma.invInvoiceLine.findMany.mockResolvedValue(updatedLines)
    mockPrisma.invInvoice.update.mockResolvedValue({ ...inv, status: 'APPROVED', subtotalCents: 20000 })

    const lineDecisions = [
      { lineId: 'line-001', decision: 'APPROVE' as const },
      { lineId: 'line-002', decision: 'APPROVE' as const },
    ]

    await approveInvoice('inv-001', 'user-001', undefined, false, lineDecisions)

    // Should update each line status
    expect(mockPrisma.invInvoiceLine.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.invInvoiceLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'line-001' }, data: expect.objectContaining({ lineStatus: 'APPROVE' }) })
    )

    // Should update invoice to APPROVED with full subtotal
    expect(mockPrisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-001' },
        data: expect.objectContaining({ status: 'APPROVED', subtotalCents: 20000 }),
      })
    )

    // Should update both budget lines
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledTimes(2)
  })

  it('mixed decisions -- some approved, some rejected -- invoice APPROVED, rejected line excluded from budget', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    const updatedLines = [
      makeLine({ id: 'line-001', totalCents: 10000, lineStatus: 'APPROVE' }),
      makeLine({ id: 'line-002', totalCents: 10000, budgetLineId: 'bline-002', budgetLine: makeBudgetLine({ id: 'bline-002' }), lineStatus: 'REJECT' }),
    ]
    mockPrisma.invInvoiceLine.findMany.mockResolvedValue(updatedLines)
    mockPrisma.invInvoice.update.mockResolvedValue({ ...inv, status: 'APPROVED', subtotalCents: 10000 })

    const lineDecisions = [
      { lineId: 'line-001', decision: 'APPROVE' as const },
      { lineId: 'line-002', decision: 'REJECT' as const, reason: 'Incorrect service date' },
    ]

    await approveInvoice('inv-001', 'user-001', undefined, false, lineDecisions)

    // Invoice should be APPROVED (not rejected -- not all lines rejected)
    expect(mockPrisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', subtotalCents: 10000 }),
      })
    )

    // Only approved line (bline-001) should get budget deduction
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bline-001' },
        data: { spentCents: { increment: 10000 } },
      })
    )
  })

  it('all lines REJECT -- rejects the entire invoice', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    mockPrisma.invInvoice.update.mockResolvedValue({ ...inv, status: 'REJECTED' })

    const lineDecisions = [
      { lineId: 'line-001', decision: 'REJECT' as const, reason: 'Duplicate line' },
      { lineId: 'line-002', decision: 'REJECT' as const, reason: 'Price cap exceeded' },
    ]

    const result = await approveInvoice('inv-001', 'user-001', undefined, false, lineDecisions)

    // Both lines updated to REJECT
    expect(mockPrisma.invInvoiceLine.update).toHaveBeenCalledTimes(2)

    // Invoice should be rejected (not approved)
    expect(mockPrisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'All line items rejected' }),
      })
    )

    // No budget line updates for rejected invoice
    expect(mockPrisma.planBudgetLine.update).not.toHaveBeenCalled()

    expect(result).toMatchObject(expect.objectContaining({ status: 'REJECTED' }))
  })

  it('ADJUST line -- uses adjustedAmountCents for budget deduction and subtotal', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)

    // Line 001 adjusted to 7000 (from 10000), line 002 approved at full 10000
    const updatedLines = [
      makeLine({ id: 'line-001', totalCents: 10000, lineStatus: 'ADJUST', adjustedAmountCents: 7000 }),
      makeLine({ id: 'line-002', totalCents: 10000, budgetLineId: 'bline-002', budgetLine: makeBudgetLine({ id: 'bline-002' }), lineStatus: 'APPROVE' }),
    ]
    mockPrisma.invInvoiceLine.findMany.mockResolvedValue(updatedLines)
    mockPrisma.invInvoice.update.mockResolvedValue({ ...inv, status: 'APPROVED', subtotalCents: 17000 })

    const lineDecisions = [
      { lineId: 'line-001', decision: 'ADJUST' as const, adjustedAmountCents: 7000 },
      { lineId: 'line-002', decision: 'APPROVE' as const },
    ]

    await approveInvoice('inv-001', 'user-001', undefined, false, lineDecisions)

    // Subtotal should reflect 7000 + 10000 = 17000
    expect(mockPrisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', subtotalCents: 17000 }),
      })
    )

    // Budget deduction for adjusted line: 7000 (not 10000)
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bline-001' },
        data: { spentCents: { increment: 7000 } },
      })
    )

    // Budget deduction for approved line: 10000
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bline-002' },
        data: { spentCents: { increment: 10000 } },
      })
    )
  })

  it('no lineDecisions -- standard approval path runs unchanged', async () => {
    const inv = makeInvoice()
    mockPrisma.invInvoice.findUniqueOrThrow.mockResolvedValue(inv)
    const approvedInv = { ...inv, status: 'APPROVED', lines: inv.lines }
    mockPrisma.invInvoice.update.mockResolvedValue(approvedInv)

    await approveInvoice('inv-001', 'user-001')

    // No per-line updates
    expect(mockPrisma.invInvoiceLine.update).not.toHaveBeenCalled()
    // Invoice approved normally
    expect(mockPrisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      })
    )
    // Budget updated for all lines (both have budgetLineId)
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledTimes(2)
  })
})

// ── generateClaimBatch Wave 3 tests ──────────────────────────────────────────

describe('generateClaimBatch -- Wave 3 per-line status', () => {
  function makeClaimInvoice(lineOverrides: Record<string, unknown>[] = []) {
    return {
      id: 'inv-001',
      invoiceNumber: 'INV-2026-001',
      status: 'APPROVED',
      totalCents: 20000,
      participantId: 'part-001',
      participant: { id: 'part-001', firstName: 'Jane', lastName: 'Smith' },
      lines: lineOverrides.length > 0
        ? lineOverrides.map((ov, i) => ({
            id: `line-00${i + 1}`,
            invoiceId: 'inv-001',
            supportItemCode: '15_042_0128_1_3',
            supportItemName: 'Support Coordination',
            categoryCode: '15',
            serviceDate: new Date('2026-01-15'),
            quantity: 1,
            unitPriceCents: 10000,
            totalCents: 10000,
            gstCents: 0,
            lineStatus: 'APPROVED',
            adjustedAmountCents: null,
            ...ov,
          }))
        : [
            { id: 'line-001', invoiceId: 'inv-001', supportItemCode: '15_042_0128_1_3', supportItemName: 'SC', categoryCode: '15', serviceDate: new Date(), quantity: 1, unitPriceCents: 10000, totalCents: 10000, gstCents: 0, lineStatus: 'APPROVED', adjustedAmountCents: null },
            { id: 'line-002', invoiceId: 'inv-001', supportItemCode: '15_042_0128_1_3', supportItemName: 'SC', categoryCode: '15', serviceDate: new Date(), quantity: 1, unitPriceCents: 10000, totalCents: 10000, gstCents: 0, lineStatus: 'APPROVED', adjustedAmountCents: null },
          ],
    }
  }

  beforeEach(() => {
    mockPrisma.clmClaim.findFirst.mockResolvedValue(null)
    mockPrisma.clmClaim.create.mockResolvedValue({ id: 'claim-001' })
    mockPrisma.invInvoice.update.mockResolvedValue({})
  })

  it('skips REJECTED lines when generating claim', async () => {
    const invoice = makeClaimInvoice([
      { id: 'line-001', totalCents: 10000, lineStatus: 'APPROVED', adjustedAmountCents: null },
      { id: 'line-002', totalCents: 10000, lineStatus: 'REJECTED', adjustedAmountCents: null },
    ])
    mockPrisma.invInvoice.findMany.mockResolvedValue([invoice])

    await generateClaimBatch(['inv-001'], 'user-001')

    const createCall = mockPrisma.clmClaim.create.mock.calls[0][0]
    // Only 1 line (not 2) should be in the claim
    expect(createCall.data.lines.create).toHaveLength(1)
    expect(createCall.data.lines.create[0].invoiceLineId).toBe('line-001')
    // Claimed amount should only be for the approved line
    expect(createCall.data.claimedCents).toBe(10000)
  })

  it('uses adjustedAmountCents for ADJUSTED lines', async () => {
    const invoice = makeClaimInvoice([
      { id: 'line-001', totalCents: 10000, lineStatus: 'ADJUSTED', adjustedAmountCents: 7500 },
      { id: 'line-002', totalCents: 10000, lineStatus: 'APPROVED', adjustedAmountCents: null },
    ])
    mockPrisma.invInvoice.findMany.mockResolvedValue([invoice])

    await generateClaimBatch(['inv-001'], 'user-001')

    const createCall = mockPrisma.clmClaim.create.mock.calls[0][0]
    // Both lines included
    expect(createCall.data.lines.create).toHaveLength(2)
    // Adjusted line should have totalCents = 7500 (not 10000)
    const adjustedLine = createCall.data.lines.create.find((l: { invoiceLineId: string }) => l.invoiceLineId === 'line-001')
    expect(adjustedLine.totalCents).toBe(7500)
    // Total claimed should be 7500 + 10000 = 17500
    expect(createCall.data.claimedCents).toBe(17500)
  })

  it('all lines APPROVED -- full claim amount matches sum of lines', async () => {
    const invoice = makeClaimInvoice([
      { id: 'line-001', totalCents: 10000, lineStatus: 'APPROVED', adjustedAmountCents: null },
      { id: 'line-002', totalCents: 10000, lineStatus: 'APPROVED', adjustedAmountCents: null },
    ])
    mockPrisma.invInvoice.findMany.mockResolvedValue([invoice])

    await generateClaimBatch(['inv-001'], 'user-001')

    const createCall = mockPrisma.clmClaim.create.mock.calls[0][0]
    expect(createCall.data.lines.create).toHaveLength(2)
    expect(createCall.data.claimedCents).toBe(20000)
  })
})
