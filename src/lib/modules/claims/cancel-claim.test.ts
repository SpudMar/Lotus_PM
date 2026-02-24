jest.mock('@/lib/db', () => ({
  prisma: {
    clmClaim: { findUnique: jest.fn(), update: jest.fn() },
    planBudgetLine: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { cancelClaim } from './claims'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>

const USER_ID = 'user_test_123456789012'
const CLAIM_ID = 'claim_test_12345678901'
const BL_ID = 'bl_test_1234567890123'

function makeClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAIM_ID, claimReference: 'CLM-2026-0001', invoiceId: 'inv_test_123456789012',
    participantId: 'part_test_12345678901', claimedCents: 50000, approvedCents: 0, status: 'PENDING',
    lines: [{
      id: 'line_test_12345678901', claimId: CLAIM_ID, supportItemCode: '15_042_0128_1_3',
      supportItemName: 'Plan Management', categoryCode: '15', serviceDate: new Date(),
      quantity: 1, unitPriceCents: 50000, totalCents: 50000, gstCents: 0,
      invoiceLine: { budgetLineId: BL_ID },
    }],
    ...overrides,
  }
}

beforeEach(() => { jest.clearAllMocks() })

describe('cancelClaim', () => {
  test('sets claim status to CANCELLED', async () => {
    const claim = makeClaim()
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(claim)
    ;(mockPrisma.planBudgetLine.findUnique as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 50000 })
    ;(mockPrisma.planBudgetLine.update as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 0 })
    ;(mockPrisma.clmClaim.update as jest.Mock).mockResolvedValue({ ...claim, status: 'CANCELLED' })

    const result = await cancelClaim(CLAIM_ID, USER_ID, 'No longer needed')
    expect(result.status).toBe('CANCELLED')
    expect(mockPrisma.clmClaim.update).toHaveBeenCalledWith({
      where: { id: CLAIM_ID }, data: { status: 'CANCELLED' }, include: { lines: true },
    })
  })

  test('reverses budget reservations on linked budget lines', async () => {
    const claim = makeClaim()
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(claim)
    ;(mockPrisma.planBudgetLine.findUnique as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 50000 })
    ;(mockPrisma.planBudgetLine.update as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 0 })
    ;(mockPrisma.clmClaim.update as jest.Mock).mockResolvedValue({ ...makeClaim(), status: 'CANCELLED' })

    await cancelClaim(CLAIM_ID, USER_ID)
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledWith({ where: { id: BL_ID }, data: { reservedCents: 0 } })
  })

  test('does not go below zero when reversing reservations', async () => {
    const claim = makeClaim()
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(claim)
    ;(mockPrisma.planBudgetLine.findUnique as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 10000 })
    ;(mockPrisma.planBudgetLine.update as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 0 })
    ;(mockPrisma.clmClaim.update as jest.Mock).mockResolvedValue({ ...makeClaim(), status: 'CANCELLED' })

    await cancelClaim(CLAIM_ID, USER_ID)
    expect(mockPrisma.planBudgetLine.update).toHaveBeenCalledWith({ where: { id: BL_ID }, data: { reservedCents: 0 } })
  })

  test('creates audit log with cancellation details', async () => {
    const claim = makeClaim()
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(claim)
    ;(mockPrisma.planBudgetLine.findUnique as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 50000 })
    ;(mockPrisma.planBudgetLine.update as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 0 })
    ;(mockPrisma.clmClaim.update as jest.Mock).mockResolvedValue({ ...makeClaim(), status: 'CANCELLED' })

    await cancelClaim(CLAIM_ID, USER_ID, 'Duplicate claim')
    expect(mockCreateAuditLog).toHaveBeenCalledWith({
      userId: USER_ID, action: 'claim.cancelled', resource: 'claim', resourceId: CLAIM_ID,
      before: { status: 'PENDING' },
      after: expect.objectContaining({ status: 'CANCELLED', reason: 'Duplicate claim' }),
    })
  })

  test('cancels submitted claim', async () => {
    const claim = makeClaim({ status: 'SUBMITTED' })
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(claim)
    ;(mockPrisma.planBudgetLine.findUnique as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 50000 })
    ;(mockPrisma.planBudgetLine.update as jest.Mock).mockResolvedValue({ id: BL_ID, reservedCents: 0 })
    ;(mockPrisma.clmClaim.update as jest.Mock).mockResolvedValue({ ...claim, status: 'CANCELLED' })

    const result = await cancelClaim(CLAIM_ID, USER_ID)
    expect(result.status).toBe('CANCELLED')
  })

  test('throws NOT_FOUND when claim does not exist', async () => {
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(null)
    await expect(cancelClaim('nonexistent', USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  test('throws INVALID_STATUS when claim is APPROVED', async () => {
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(makeClaim({ status: 'APPROVED' }))
    await expect(cancelClaim(CLAIM_ID, USER_ID)).rejects.toThrow('INVALID_STATUS')
  })

  test('throws INVALID_STATUS when claim is PAID', async () => {
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(makeClaim({ status: 'PAID' }))
    await expect(cancelClaim(CLAIM_ID, USER_ID)).rejects.toThrow('INVALID_STATUS')
  })

  test('handles claim with no budget line links gracefully', async () => {
    const claim = makeClaim({ lines: [{ id: 'line_test_12345678901', claimId: CLAIM_ID, supportItemCode: '15_042_0128_1_3', supportItemName: 'Plan Management', categoryCode: '15', serviceDate: new Date(), quantity: 1, unitPriceCents: 50000, totalCents: 50000, gstCents: 0, invoiceLine: null }] })
    ;(mockPrisma.clmClaim.findUnique as jest.Mock).mockResolvedValue(claim)
    ;(mockPrisma.clmClaim.update as jest.Mock).mockResolvedValue({ ...claim, status: 'CANCELLED' })

    const result = await cancelClaim(CLAIM_ID, USER_ID)
    expect(result.status).toBe('CANCELLED')
    expect(mockPrisma.planBudgetLine.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.planBudgetLine.update).not.toHaveBeenCalled()
  })
})
