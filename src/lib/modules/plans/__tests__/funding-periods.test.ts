/**
 * Unit tests for the S33 Funding Periods module.
 *
 * Covers:
 *   - listFundingPeriods: returns periods for a plan
 *   - createFundingPeriod: success within plan range
 *   - createFundingPeriod: rejects dates outside plan range
 *   - createFundingPeriod: rejects overlapping periods
 *   - createFundingPeriod: rejects when plan does not exist
 *   - deleteFundingPeriod: succeeds and cascades period budgets
 *   - deleteFundingPeriod: throws when period not found
 *   - addPeriodBudget: succeeds within budget line total
 *   - addPeriodBudget: rejects when allocation exceeds budget line total
 *   - updatePeriodBudget: succeeds with valid amount
 *   - getActivePeriodBudget: returns budget info for matching period/category
 *   - getActivePeriodBudget: returns null when no matching period
 *   - getActivePeriodBudget: returns null when no matching budget
 *   - getCumulativeReleasedBudget: sums across active periods up to date
 *   - getCumulativeReleasedBudget: returns 0 when no periods exist
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    planFundingPeriod: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    planPeriodBudget: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    planPlan: {
      findUnique: jest.fn(),
    },
    planBudgetLine: {
      findUnique: jest.fn(),
    },
    invInvoiceLine: {
      aggregate: jest.fn(),
    },
    coreAuditLog: {
      create: jest.fn(),
    },
  },
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import {
  listFundingPeriods,
  createFundingPeriod,
  deleteFundingPeriod,
  addPeriodBudget,
  updatePeriodBudget,
  getActivePeriodBudget,
  getCumulativeReleasedBudget,
} from '../funding-periods'

// ── Type casts ─────────────────────────────────────────────────────────────

const mockFundingPeriod = prisma.planFundingPeriod as jest.Mocked<typeof prisma.planFundingPeriod>
const mockPeriodBudget = prisma.planPeriodBudget as jest.Mocked<typeof prisma.planPeriodBudget>
const mockPlan = prisma.planPlan as jest.Mocked<typeof prisma.planPlan>
const mockBudgetLine = prisma.planBudgetLine as jest.Mocked<typeof prisma.planBudgetLine>
const mockAuditLog = prisma.coreAuditLog as jest.Mocked<typeof prisma.coreAuditLog>
const mockInvoiceLine = prisma.invInvoiceLine as jest.Mocked<typeof prisma.invInvoiceLine>

// ── Fixtures ───────────────────────────────────────────────────────────────

const PLAN_ID = 'plan-cuid-0001'
const PERIOD_ID = 'period-cuid-001'
const BUDGET_LINE_ID = 'budgetline-001'
const USER_ID = 'user-cuid-0001'

const planDates = {
  startDate: new Date('2025-07-01'),
  endDate: new Date('2026-06-30'),
}

function makePlan(overrides = {}) {
  return { id: PLAN_ID, ...planDates, ...overrides }
}

function makePeriod(overrides = {}) {
  return {
    id: PERIOD_ID,
    planId: PLAN_ID,
    startDate: new Date('2025-07-01'),
    endDate: new Date('2025-12-31'),
    label: 'First half',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function clearAll() {
  jest.clearAllMocks()
  mockAuditLog.create.mockResolvedValue({} as never)
}

// ── listFundingPeriods ─────────────────────────────────────────────────────

describe('listFundingPeriods', () => {
  beforeEach(clearAll)

  it('returns periods for a plan ordered by startDate', async () => {
    const periods = [makePeriod(), makePeriod({ id: 'period-cuid-002', startDate: new Date('2026-01-01'), endDate: new Date('2026-06-30'), label: 'Second half' })]
    mockFundingPeriod.findMany.mockResolvedValue(periods as never)

    const result = await listFundingPeriods(PLAN_ID)

    expect(mockFundingPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { planId: PLAN_ID },
        orderBy: { startDate: 'asc' },
      })
    )
    expect(result).toHaveLength(2)
  })

  it('returns empty array when plan has no periods', async () => {
    mockFundingPeriod.findMany.mockResolvedValue([] as never)

    const result = await listFundingPeriods(PLAN_ID)

    expect(result).toEqual([])
  })
})

// ── createFundingPeriod ────────────────────────────────────────────────────

describe('createFundingPeriod', () => {
  beforeEach(clearAll)

  it('creates a period that falls within the plan date range', async () => {
    mockPlan.findUnique.mockResolvedValue(makePlan() as never)
    mockFundingPeriod.findFirst.mockResolvedValue(null)
    const created = makePeriod()
    mockFundingPeriod.create.mockResolvedValue(created as never)

    const result = await createFundingPeriod(
      {
        planId: PLAN_ID,
        startDate: new Date('2025-07-01'),
        endDate: new Date('2025-12-31'),
        label: 'First half',
        isActive: true,
      },
      USER_ID,
    )

    expect(mockFundingPeriod.create).toHaveBeenCalled()
    expect(mockAuditLog.create).toHaveBeenCalled()
    expect(result.id).toBe(PERIOD_ID)
  })

  it('rejects a period whose startDate is before the plan startDate', async () => {
    mockPlan.findUnique.mockResolvedValue(makePlan() as never)

    await expect(
      createFundingPeriod(
        {
          planId: PLAN_ID,
          startDate: new Date('2025-06-01'), // before plan start
          endDate: new Date('2025-12-31'),
          isActive: true,
        },
        USER_ID,
      )
    ).rejects.toThrow('Funding period dates must fall within the plan date range')

    expect(mockFundingPeriod.create).not.toHaveBeenCalled()
  })

  it('rejects a period whose endDate is after the plan endDate', async () => {
    mockPlan.findUnique.mockResolvedValue(makePlan() as never)

    await expect(
      createFundingPeriod(
        {
          planId: PLAN_ID,
          startDate: new Date('2025-07-01'),
          endDate: new Date('2026-12-31'), // after plan end
          isActive: true,
        },
        USER_ID,
      )
    ).rejects.toThrow('Funding period dates must fall within the plan date range')

    expect(mockFundingPeriod.create).not.toHaveBeenCalled()
  })

  it('rejects a period that overlaps an existing period', async () => {
    mockPlan.findUnique.mockResolvedValue(makePlan() as never)
    mockFundingPeriod.findFirst.mockResolvedValue(makePeriod() as never) // overlap found

    await expect(
      createFundingPeriod(
        {
          planId: PLAN_ID,
          startDate: new Date('2025-10-01'),
          endDate: new Date('2026-03-31'),
          isActive: true,
        },
        USER_ID,
      )
    ).rejects.toThrow('Funding period overlaps with an existing period for this plan')

    expect(mockFundingPeriod.create).not.toHaveBeenCalled()
  })

  it('throws when the plan does not exist', async () => {
    mockPlan.findUnique.mockResolvedValue(null)

    await expect(
      createFundingPeriod(
        {
          planId: 'nonexistent-plan',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-12-31'),
          isActive: true,
        },
        USER_ID,
      )
    ).rejects.toThrow('Plan not found')
  })
})

// ── deleteFundingPeriod ────────────────────────────────────────────────────

describe('deleteFundingPeriod', () => {
  beforeEach(clearAll)

  it('deletes a period and its budgets via cascade', async () => {
    mockFundingPeriod.findUnique.mockResolvedValue(makePeriod() as never)
    mockFundingPeriod.delete.mockResolvedValue(makePeriod() as never)

    await deleteFundingPeriod(PERIOD_ID, USER_ID)

    expect(mockFundingPeriod.delete).toHaveBeenCalledWith({ where: { id: PERIOD_ID } })
    expect(mockAuditLog.create).toHaveBeenCalled()
  })

  it('throws when the period does not exist', async () => {
    mockFundingPeriod.findUnique.mockResolvedValue(null)

    await expect(deleteFundingPeriod('nonexistent', USER_ID)).rejects.toThrow(
      'Funding period not found',
    )

    expect(mockFundingPeriod.delete).not.toHaveBeenCalled()
  })
})

// ── addPeriodBudget ────────────────────────────────────────────────────────

describe('addPeriodBudget', () => {
  beforeEach(clearAll)

  it('creates a period budget allocation within the budget line total', async () => {
    mockBudgetLine.findUnique.mockResolvedValue({ id: BUDGET_LINE_ID, allocatedCents: 500000 } as never)
    mockPeriodBudget.create.mockResolvedValue({
      id: 'pb-001', fundingPeriodId: PERIOD_ID, budgetLineId: BUDGET_LINE_ID, allocatedCents: 250000,
    } as never)

    const result = await addPeriodBudget(PERIOD_ID, BUDGET_LINE_ID, 250000, USER_ID)

    expect(mockPeriodBudget.create).toHaveBeenCalledWith({
      data: { fundingPeriodId: PERIOD_ID, budgetLineId: BUDGET_LINE_ID, allocatedCents: 250000 },
    })
    expect(mockAuditLog.create).toHaveBeenCalled()
    expect(result.allocatedCents).toBe(250000)
  })

  it('rejects when allocation exceeds the budget line total', async () => {
    mockBudgetLine.findUnique.mockResolvedValue({ id: BUDGET_LINE_ID, allocatedCents: 100000 } as never)

    await expect(
      addPeriodBudget(PERIOD_ID, BUDGET_LINE_ID, 200000, USER_ID), // 200000 > 100000
    ).rejects.toThrow('Period budget allocation cannot exceed the budget line total')

    expect(mockPeriodBudget.create).not.toHaveBeenCalled()
  })

  it('throws when budget line does not exist', async () => {
    mockBudgetLine.findUnique.mockResolvedValue(null)

    await expect(
      addPeriodBudget(PERIOD_ID, 'nonexistent-line', 50000, USER_ID),
    ).rejects.toThrow('Budget line not found')
  })
})

// ── updatePeriodBudget ─────────────────────────────────────────────────────

describe('updatePeriodBudget', () => {
  beforeEach(clearAll)

  it('updates the allocation amount of a period budget', async () => {
    mockPeriodBudget.findUnique.mockResolvedValue({
      id: 'pb-001',
      allocatedCents: 250000,
      budgetLine: { allocatedCents: 500000 },
    } as never)
    mockPeriodBudget.update.mockResolvedValue({ id: 'pb-001', allocatedCents: 300000 } as never)

    const result = await updatePeriodBudget('pb-001', 300000, USER_ID)

    expect(mockPeriodBudget.update).toHaveBeenCalledWith({
      where: { id: 'pb-001' },
      data: { allocatedCents: 300000 },
    })
    expect(mockAuditLog.create).toHaveBeenCalled()
    expect(result.allocatedCents).toBe(300000)
  })

  it('rejects update when new amount exceeds the budget line total', async () => {
    mockPeriodBudget.findUnique.mockResolvedValue({
      id: 'pb-001',
      allocatedCents: 250000,
      budgetLine: { allocatedCents: 300000 },
    } as never)

    await expect(
      updatePeriodBudget('pb-001', 400000, USER_ID), // 400000 > 300000
    ).rejects.toThrow('Period budget allocation cannot exceed the budget line total')

    expect(mockPeriodBudget.update).not.toHaveBeenCalled()
  })
})

// ── getActivePeriodBudget ──────────────────────────────────────────────────

describe('getActivePeriodBudget', () => {
  beforeEach(clearAll)

  it('returns budget info when a matching period and category exist', async () => {
    mockFundingPeriod.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-12-31'),
    } as never)

    mockPeriodBudget.findFirst.mockResolvedValue({
      id: 'pb-001',
      allocatedCents: 250000,
      budgetLineId: BUDGET_LINE_ID,
    } as never)

    mockInvoiceLine.aggregate.mockResolvedValue({
      _sum: { totalCents: 100000 },
    } as never)

    const result = await getActivePeriodBudget(PLAN_ID, '15', new Date('2025-09-15'))

    expect(result).toEqual({
      periodId: PERIOD_ID,
      allocatedCents: 250000,
      spentCents: 100000,
      remainingCents: 150000,
    })

    expect(mockFundingPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          planId: PLAN_ID,
          isActive: true,
        }),
      })
    )
  })

  it('returns null when no active period contains the service date', async () => {
    mockFundingPeriod.findFirst.mockResolvedValue(null)

    const result = await getActivePeriodBudget(PLAN_ID, '15', new Date('2026-07-15'))

    expect(result).toBeNull()
    expect(mockPeriodBudget.findFirst).not.toHaveBeenCalled()
  })

  it('returns null when period exists but no budget for the category', async () => {
    mockFundingPeriod.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-12-31'),
    } as never)

    mockPeriodBudget.findFirst.mockResolvedValue(null)

    const result = await getActivePeriodBudget(PLAN_ID, '99', new Date('2025-09-15'))

    expect(result).toBeNull()
    expect(mockInvoiceLine.aggregate).not.toHaveBeenCalled()
  })

  it('returns remainingCents as 0 when spent exceeds allocated', async () => {
    mockFundingPeriod.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-12-31'),
    } as never)

    mockPeriodBudget.findFirst.mockResolvedValue({
      id: 'pb-001',
      allocatedCents: 100000,
      budgetLineId: BUDGET_LINE_ID,
    } as never)

    mockInvoiceLine.aggregate.mockResolvedValue({
      _sum: { totalCents: 150000 },
    } as never)

    const result = await getActivePeriodBudget(PLAN_ID, '15', new Date('2025-09-15'))

    expect(result).toEqual({
      periodId: PERIOD_ID,
      allocatedCents: 100000,
      spentCents: 150000,
      remainingCents: 0,
    })
  })
})

// ── getCumulativeReleasedBudget ────────────────────────────────────────────

describe('getCumulativeReleasedBudget', () => {
  beforeEach(clearAll)

  it('sums allocatedCents across active periods up to the given date', async () => {
    mockPeriodBudget.aggregate.mockResolvedValue({
      _sum: { allocatedCents: 750000 },
    } as never)

    const result = await getCumulativeReleasedBudget(PLAN_ID, '15', new Date('2026-03-15'))

    expect(result).toBe(750000)

    expect(mockPeriodBudget.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          budgetLine: { categoryCode: '15', planId: PLAN_ID },
          fundingPeriod: expect.objectContaining({
            planId: PLAN_ID,
            isActive: true,
          }),
        }),
      })
    )
  })

  it('returns 0 when no periods exist for the category', async () => {
    mockPeriodBudget.aggregate.mockResolvedValue({
      _sum: { allocatedCents: null },
    } as never)

    const result = await getCumulativeReleasedBudget(PLAN_ID, '99', new Date('2026-03-15'))

    expect(result).toBe(0)
  })
})
