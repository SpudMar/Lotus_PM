/**
 * Unit tests for PM Fee Generation.
 *
 * Covers:
 *   - Monthly fee generation creates charges for active participants
 *   - Skips participants without active plans
 *   - Skips already-generated periods (idempotent)
 *   - Uses participant override rate when set
 *   - Claim generation links charges to claims
 *   - Empty inputs return zero results
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    pmFeeSchedule: { findMany: jest.fn() },
    pmFeeCharge: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    crmParticipant: { findMany: jest.fn() },
    clmClaim: { findFirst: jest.fn(), create: jest.fn() },
    coreAuditLog: { create: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { generateMonthlyFees, generateClaimsForFees } from './fee-generation'

const mockScheduleFindMany = prisma.pmFeeSchedule.findMany as jest.MockedFunction<typeof prisma.pmFeeSchedule.findMany>
const mockParticipantFindMany = prisma.crmParticipant.findMany as jest.MockedFunction<typeof prisma.crmParticipant.findMany>
const mockChargeFindUnique = prisma.pmFeeCharge.findUnique as jest.MockedFunction<typeof prisma.pmFeeCharge.findUnique>
const mockChargeCreate = prisma.pmFeeCharge.create as jest.MockedFunction<typeof prisma.pmFeeCharge.create>
const mockChargeFindMany = prisma.pmFeeCharge.findMany as jest.MockedFunction<typeof prisma.pmFeeCharge.findMany>
const mockChargeUpdate = prisma.pmFeeCharge.update as jest.MockedFunction<typeof prisma.pmFeeCharge.update>
const mockClaimFindFirst = prisma.clmClaim.findFirst as jest.MockedFunction<typeof prisma.clmClaim.findFirst>
const mockClaimCreate = prisma.clmClaim.create as jest.MockedFunction<typeof prisma.clmClaim.create>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSchedule(id: string, overrides: { participantId: string; rateCents: number }[] = []) {
  return {
    id,
    name: 'Monthly Plan Management Fee',
    supportItemCode: '14_033_0127_8_3',
    rateCents: 5000,
    frequency: 'MONTHLY' as const,
    isActive: true,
    deletedAt: null,
    overrides: overrides.map((o) => ({
      participantId: o.participantId,
      rateCents: o.rateCents,
    })),
  }
}

function makeParticipant(id: string) {
  return { id }
}

// ── Tests: generateMonthlyFees ────────────────────────────────────────────────

describe('generateMonthlyFees', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns zero results when no active fee schedules exist', async () => {
    mockScheduleFindMany.mockResolvedValue([])

    const result = await generateMonthlyFees(3, 2026, 'user-001')

    expect(result.chargesCreated).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.participants).toBe(0)
    expect(mockParticipantFindMany).not.toHaveBeenCalled()
  })

  it('returns zero results when no active participants with active plans', async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule('sched-1')] as never)
    mockParticipantFindMany.mockResolvedValue([])

    const result = await generateMonthlyFees(3, 2026, 'user-001')

    expect(result.chargesCreated).toBe(0)
    expect(result.participants).toBe(0)
  })

  it('creates charges for active participants with active plans', async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule('sched-1')] as never)
    mockParticipantFindMany.mockResolvedValue([
      makeParticipant('part-001'),
      makeParticipant('part-002'),
    ] as never)
    mockChargeFindUnique.mockResolvedValue(null) // no existing charges
    mockChargeCreate.mockResolvedValue({ id: 'charge-new' } as never)

    const result = await generateMonthlyFees(3, 2026, 'user-001')

    expect(result.chargesCreated).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.participants).toBe(2)
    expect(mockChargeCreate).toHaveBeenCalledTimes(2)
  })

  it('skips already-generated periods (idempotent)', async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule('sched-1')] as never)
    mockParticipantFindMany.mockResolvedValue([makeParticipant('part-001')] as never)
    // Charge already exists
    mockChargeFindUnique.mockResolvedValue({ id: 'existing-charge' } as never)

    const result = await generateMonthlyFees(3, 2026, 'user-001')

    expect(result.chargesCreated).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockChargeCreate).not.toHaveBeenCalled()
  })

  it('uses participant override rate when set', async () => {
    mockScheduleFindMany.mockResolvedValue([
      makeSchedule('sched-1', [{ participantId: 'part-001', rateCents: 7500 }]),
    ] as never)
    mockParticipantFindMany.mockResolvedValue([makeParticipant('part-001')] as never)
    mockChargeFindUnique.mockResolvedValue(null)
    mockChargeCreate.mockResolvedValue({ id: 'charge-new' } as never)

    await generateMonthlyFees(3, 2026, 'user-001')

    expect(mockChargeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCents: 7500, // override rate, not default 5000
        }),
      })
    )
  })

  it('uses schedule default rate when no override exists', async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule('sched-1')] as never)
    mockParticipantFindMany.mockResolvedValue([makeParticipant('part-001')] as never)
    mockChargeFindUnique.mockResolvedValue(null)
    mockChargeCreate.mockResolvedValue({ id: 'charge-new' } as never)

    await generateMonthlyFees(3, 2026, 'user-001')

    expect(mockChargeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCents: 5000, // default schedule rate
        }),
      })
    )
  })

  it('calculates correct period boundaries for the given month', async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule('sched-1')] as never)
    mockParticipantFindMany.mockResolvedValue([makeParticipant('part-001')] as never)
    mockChargeFindUnique.mockResolvedValue(null)
    mockChargeCreate.mockResolvedValue({ id: 'charge-new' } as never)

    await generateMonthlyFees(2, 2026, 'user-001')

    expect(mockChargeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          periodStart: new Date(2026, 1, 1), // Feb 1
          periodEnd: new Date(2026, 2, 0, 23, 59, 59, 999), // Feb 28 end of day
        }),
      })
    )
  })

  it('handles multiple schedules for the same participants', async () => {
    mockScheduleFindMany.mockResolvedValue([
      makeSchedule('sched-1'),
      makeSchedule('sched-2'),
    ] as never)
    mockParticipantFindMany.mockResolvedValue([makeParticipant('part-001')] as never)
    mockChargeFindUnique.mockResolvedValue(null)
    mockChargeCreate.mockResolvedValue({ id: 'charge-new' } as never)

    const result = await generateMonthlyFees(3, 2026, 'user-001')

    // 2 schedules x 1 participant = 2 charges
    expect(result.chargesCreated).toBe(2)
    expect(mockChargeCreate).toHaveBeenCalledTimes(2)
  })
})

// ── Tests: generateClaimsForFees ──────────────────────────────────────────────

describe('generateClaimsForFees', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns zero when given empty chargeIds array', async () => {
    const result = await generateClaimsForFees([], 'user-001')

    expect(result.claimsGenerated).toBe(0)
    expect(mockChargeFindMany).not.toHaveBeenCalled()
  })

  it('creates claims for PENDING charges and updates charge status', async () => {
    mockChargeFindMany.mockResolvedValue([
      {
        id: 'charge-001',
        participantId: 'part-001',
        amountCents: 5000,
        status: 'PENDING',
        periodStart: new Date(2026, 2, 1),
        periodEnd: new Date(2026, 2, 31),
        feeSchedule: {
          name: 'Monthly Plan Management Fee',
          supportItemCode: '14_033_0127_8_3',
        },
      },
    ] as never)
    mockClaimFindFirst.mockResolvedValue(null) // no existing claims — seq starts at 0001
    mockClaimCreate.mockResolvedValue({ id: 'claim-fee-001' } as never)
    mockChargeUpdate.mockResolvedValue({} as never)

    const result = await generateClaimsForFees(['charge-001'], 'user-001')

    expect(result.claimsGenerated).toBe(1)

    // Verify claim was created with correct data
    expect(mockClaimCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participantId: 'part-001',
          claimedCents: 5000,
          lines: {
            create: [
              expect.objectContaining({
                supportItemCode: '14_033_0127_8_3',
                categoryCode: '14',
                quantity: 1,
                totalCents: 5000,
              }),
            ],
          },
        }),
      })
    )

    // Verify charge was updated to CLAIMED
    expect(mockChargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'charge-001' },
        data: expect.objectContaining({
          status: 'CLAIMED',
          claimId: 'claim-fee-001',
        }),
      })
    )
  })

  it('generates sequential claim references', async () => {
    mockChargeFindMany.mockResolvedValue([
      {
        id: 'charge-001',
        participantId: 'part-001',
        amountCents: 5000,
        status: 'PENDING',
        periodStart: new Date(2026, 2, 1),
        periodEnd: new Date(2026, 2, 31),
        feeSchedule: { name: 'Monthly PM Fee', supportItemCode: '14_033_0127_8_3' },
      },
    ] as never)
    mockClaimFindFirst.mockResolvedValue(null)
    mockClaimCreate.mockResolvedValue({ id: 'claim-fee-001' } as never)
    mockChargeUpdate.mockResolvedValue({} as never)

    await generateClaimsForFees(['charge-001'], 'user-001')

    const createCall = mockClaimCreate.mock.calls[0]![0] as { data: { claimReference: string } }
    expect(createCall.data.claimReference).toMatch(/^CLM-\d{8}-0001$/)
  })

  it('only processes PENDING charges (filters out non-PENDING)', async () => {
    // The findMany query filters to PENDING only, so even if we pass claimed IDs,
    // the DB returns only PENDING ones
    mockChargeFindMany.mockResolvedValue([])

    const result = await generateClaimsForFees(['charge-already-claimed'], 'user-001')

    expect(result.claimsGenerated).toBe(0)
    expect(mockClaimCreate).not.toHaveBeenCalled()
  })
})
