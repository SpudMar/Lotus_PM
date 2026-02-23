/**
 * Unit tests for SA Budget Allocation service - WS-F6.
 *
 * Prisma is fully mocked - no real DB calls are made.
 */

// -- Mocks ------------------------------------------------------------------

jest.mock('@/lib/db', () => ({
  prisma: {
    planBudgetLine: {
      findUnique: jest.fn(),
    },
    saServiceAgreement: {
      findFirst: jest.fn(),
    },
    saBudgetAllocation: {
      aggregate: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    coreAuditLog: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

// -- Imports (after mocks) --------------------------------------------------

import { prisma } from '@/lib/db'
import {
  allocateBudget,
  getAllocations,
  getBudgetLineCommitment,
  removeAllocation,
  getAvailableCents,
} from '../budget-allocations'

// -- Type casts -------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

// -- Fixtures ---------------------------------------------------------------

const USER_ID = 'user-cuid-0001'
const SA_ID = 'clsa00000001'
const BUDGET_LINE_ID = 'clbl00000001'
const ALLOCATION_ID = 'clal00000001'

function makeBudgetLine(overrides: Record<string, unknown> = {}) {
  return {
    id: BUDGET_LINE_ID,
    allocatedCents: 500000,
    spentCents: 100000,
    ...overrides,
  }
}

function makeSa() {
  return { id: SA_ID }
}

function makeAllocation(overrides: Record<string, unknown> = {}) {
  return {
    id: ALLOCATION_ID,
    serviceAgreementId: SA_ID,
    budgetLineId: BUDGET_LINE_ID,
    allocatedCents: 200000,
    note: null,
    createdAt: new Date('2026-02-23'),
    createdById: USER_ID,
    ...overrides,
  }
}

// -- Tests ------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks()
})

// -- 1. allocateBudget - creates allocation correctly ----------------------

describe('allocateBudget', () => {
  it('creates a new allocation correctly', async () => {
    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(makeSa())
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(makeBudgetLine())
    mockPrisma.saBudgetAllocation.aggregate.mockResolvedValue({ _sum: { allocatedCents: null } })
    mockPrisma.saBudgetAllocation.upsert.mockResolvedValue(makeAllocation())

    const result = await allocateBudget(
      {
        serviceAgreementId: SA_ID,
        budgetLineId: BUDGET_LINE_ID,
        allocatedCents: 200000,
        note: 'OT sessions',
      },
      USER_ID
    )

    expect(result.id).toBe(ALLOCATION_ID)
    expect(result.allocatedCents).toBe(200000)
    expect(mockPrisma.saBudgetAllocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          serviceAgreementId_budgetLineId: {
            serviceAgreementId: SA_ID,
            budgetLineId: BUDGET_LINE_ID,
          },
        },
        create: expect.objectContaining({
          allocatedCents: 200000,
          note: 'OT sessions',
        }),
      })
    )
  })

  // -- 2. allocateBudget - updates existing allocation (upsert) ------------

  it('updates an existing allocation via upsert', async () => {
    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(makeSa())
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(makeBudgetLine())
    mockPrisma.saBudgetAllocation.aggregate.mockResolvedValue({ _sum: { allocatedCents: 0 } })
    const updatedAlloc = makeAllocation({ allocatedCents: 300000 })
    mockPrisma.saBudgetAllocation.upsert.mockResolvedValue(updatedAlloc)

    const result = await allocateBudget(
      { serviceAgreementId: SA_ID, budgetLineId: BUDGET_LINE_ID, allocatedCents: 300000 },
      USER_ID
    )

    expect(result.allocatedCents).toBe(300000)
    expect(mockPrisma.saBudgetAllocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ allocatedCents: 300000 }),
      })
    )
  })

  // -- 3. allocateBudget - throws ALLOCATION_EXCEEDS_AVAILABLE -------------

  it('throws ALLOCATION_EXCEEDS_AVAILABLE when allocation exceeds available', async () => {
    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(makeSa())
    // Budget line: allocated $5,000, spent $1,000 -> available $4,000
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(makeBudgetLine())
    // Another SA already committed $3,500
    mockPrisma.saBudgetAllocation.aggregate.mockResolvedValue({ _sum: { allocatedCents: 350000 } })

    // Try to allocate $1,000 more - but only $500 available ($4,000 - $3,500)
    await expect(
      allocateBudget(
        { serviceAgreementId: SA_ID, budgetLineId: BUDGET_LINE_ID, allocatedCents: 100000 },
        USER_ID
      )
    ).rejects.toThrow('ALLOCATION_EXCEEDS_AVAILABLE')

    expect(mockPrisma.saBudgetAllocation.upsert).not.toHaveBeenCalled()
  })

  it('throws NOT_FOUND when service agreement does not exist', async () => {
    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(null)

    await expect(
      allocateBudget(
        { serviceAgreementId: 'clnonexistent1', budgetLineId: BUDGET_LINE_ID, allocatedCents: 10000 },
        USER_ID
      )
    ).rejects.toThrow('NOT_FOUND')
  })

  it('throws NOT_FOUND when budget line does not exist', async () => {
    mockPrisma.saServiceAgreement.findFirst.mockResolvedValue(makeSa())
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(null)

    await expect(
      allocateBudget(
        { serviceAgreementId: SA_ID, budgetLineId: 'clnonexistent1', allocatedCents: 10000 },
        USER_ID
      )
    ).rejects.toThrow('NOT_FOUND')
  })
})

// -- 4. getAllocations - returns allocations for SA -------------------------

describe('getAllocations', () => {
  it('returns all allocations for a service agreement with budget line details', async () => {
    const allocWithRelations = {
      ...makeAllocation(),
      budgetLine: {
        id: BUDGET_LINE_ID,
        categoryCode: '15',
        categoryName: 'Support Coordination',
        allocatedCents: 500000,
        spentCents: 100000,
      },
      createdBy: { id: USER_ID, name: 'Jane PM' },
    }
    mockPrisma.saBudgetAllocation.findMany.mockResolvedValue([allocWithRelations])

    const result = await getAllocations(SA_ID)

    expect(result).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.budgetLine.categoryCode).toBe('15')
    expect(mockPrisma.saBudgetAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceAgreementId: SA_ID },
      })
    )
  })

  it('returns empty array when no allocations exist', async () => {
    mockPrisma.saBudgetAllocation.findMany.mockResolvedValue([])
    const result = await getAllocations(SA_ID)
    expect(result).toHaveLength(0)
  })
})

// -- 5. getBudgetLineCommitment - sums all SA allocations for a budget line -

describe('getBudgetLineCommitment', () => {
  it('sums all SA allocations for a budget line', async () => {
    const allocations = [
      {
        ...makeAllocation({ allocatedCents: 200000 }),
        serviceAgreement: { id: SA_ID, agreementRef: 'SA-20260101-AAAA' },
      },
      {
        ...makeAllocation({
          id: 'clal00000002',
          serviceAgreementId: 'clsa00000002',
          allocatedCents: 150000,
        }),
        serviceAgreement: { id: 'clsa00000002', agreementRef: 'SA-20260101-BBBB' },
      },
    ]
    mockPrisma.saBudgetAllocation.findMany.mockResolvedValue(allocations)

    const result = await getBudgetLineCommitment(BUDGET_LINE_ID)

    expect(result.totalCommittedCents).toBe(350000)
    expect(result.allocations).toHaveLength(2)
    expect(mockPrisma.saBudgetAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { budgetLineId: BUDGET_LINE_ID } })
    )
  })

  it('returns zero when no allocations exist', async () => {
    mockPrisma.saBudgetAllocation.findMany.mockResolvedValue([])
    const result = await getBudgetLineCommitment(BUDGET_LINE_ID)
    expect(result.totalCommittedCents).toBe(0)
    expect(result.allocations).toHaveLength(0)
  })
})

// -- 6. removeAllocation - deletes allocation -------------------------------

describe('removeAllocation', () => {
  it('deletes an allocation by id', async () => {
    mockPrisma.saBudgetAllocation.findUnique.mockResolvedValue(makeAllocation())
    mockPrisma.saBudgetAllocation.delete.mockResolvedValue(undefined)

    await removeAllocation(ALLOCATION_ID, USER_ID)

    expect(mockPrisma.saBudgetAllocation.delete).toHaveBeenCalledWith({
      where: { id: ALLOCATION_ID },
    })
  })

  it('throws NOT_FOUND when allocation does not exist', async () => {
    mockPrisma.saBudgetAllocation.findUnique.mockResolvedValue(null)

    await expect(removeAllocation('clnonexistent1', USER_ID)).rejects.toThrow('NOT_FOUND')
    expect(mockPrisma.saBudgetAllocation.delete).not.toHaveBeenCalled()
  })
})

// -- 7. getAvailableCents - returns correct available excluding own SA ------

describe('getAvailableCents', () => {
  it('returns allocated minus spent minus other SA commits', async () => {
    // $5,000 allocated, $1,000 spent -> $4,000 gross available
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(makeBudgetLine())
    // Other SAs have committed $1,500
    mockPrisma.saBudgetAllocation.aggregate.mockResolvedValue({ _sum: { allocatedCents: 150000 } })

    const available = await getAvailableCents(BUDGET_LINE_ID, SA_ID)

    // $4,000 - $1,500 = $2,500
    expect(available).toBe(250000)
    // Should exclude own SA existing allocation
    expect(mockPrisma.saBudgetAllocation.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceAgreementId: { not: SA_ID },
        }),
      })
    )
  })

  it('returns full available when no other SAs have committed', async () => {
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(makeBudgetLine())
    mockPrisma.saBudgetAllocation.aggregate.mockResolvedValue({ _sum: { allocatedCents: null } })

    const available = await getAvailableCents(BUDGET_LINE_ID)

    // $5,000 - $1,000 = $4,000
    expect(available).toBe(400000)
  })

  it('throws NOT_FOUND when budget line does not exist', async () => {
    mockPrisma.planBudgetLine.findUnique.mockResolvedValue(null)
    await expect(getAvailableCents('clnonexistent1')).rejects.toThrow('NOT_FOUND')
  })
})
