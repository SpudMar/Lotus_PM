/**
 * Unit tests for the Fund Quarantine module.
 * Covers CRUD, capacity validation, draw-down, and auto-create from SA.
 *
 * Prisma is fully mocked — no real DB calls are made.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    fqQuarantine: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    planBudgetLine: {
      findUnique: jest.fn(),
    },
    saServiceAgreement: {
      findUnique: jest.fn(),
    },
    coreAuditLog: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import {
  listQuarantines,
  getQuarantine,
  createQuarantine,
  updateQuarantine,
  releaseQuarantine,
  drawDown,
  autoCreateFromServiceAgreement,
} from '../fund-quarantine'

// ── Type casts ─────────────────────────────────────────────────────────────

const mockFQ = prisma.fqQuarantine as jest.Mocked<typeof prisma.fqQuarantine>
const mockBudgetLine = prisma.planBudgetLine as jest.Mocked<typeof prisma.planBudgetLine>
const mockSA = prisma.saServiceAgreement as jest.Mocked<typeof prisma.saServiceAgreement>
const mockAudit = prisma.coreAuditLog as jest.Mocked<typeof prisma.coreAuditLog>

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_ID = 'user-cuid-0001'
const QID = 'quarantine-001'
const BUDGET_LINE_ID = 'budgetline-001'
const PROVIDER_ID = 'provider-001'
const SA_ID = 'sa-cuid-00001'
const PLAN_ID = 'plan-cuid-0001'

function makeQuarantine(overrides: Record<string, unknown> = {}) {
  return {
    id: QID,
    serviceAgreementId: SA_ID,
    budgetLineId: BUDGET_LINE_ID,
    providerId: PROVIDER_ID,
    supportItemCode: null,
    quarantinedCents: 100000,
    usedCents: 0,
    fundingPeriodId: null,
    status: 'ACTIVE' as const,
    notes: null,
    createdById: USER_ID,
    createdAt: new Date('2026-02-22'),
    updatedAt: new Date('2026-02-22'),
    ...overrides,
  }
}

function makeBudgetLine(overrides: Record<string, unknown> = {}) {
  return {
    id: BUDGET_LINE_ID,
    planId: PLAN_ID,
    categoryCode: '01',
    categoryName: 'Daily Activities',
    allocatedCents: 500000,
    spentCents: 50000,
    ...overrides,
  }
}

function makeRateLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rl-001',
    agreementId: SA_ID,
    categoryCode: '01',
    categoryName: 'Daily Activities',
    supportItemCode: '01_011_0107_1_3',
    supportItemName: 'Support item',
    agreedRateCents: 10000,
    maxQuantity: new (class Decimal { valueOf() { return 10 } toNumber() { return 10 } toString() { return '10' } })(),
    unitType: 'H',
    createdAt: new Date('2026-02-22'),
    updatedAt: new Date('2026-02-22'),
    ...overrides,
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockAudit.create.mockResolvedValue({} as never)
})

// ── listQuarantines ────────────────────────────────────────────────────────

describe('listQuarantines', () => {
  it('returns all quarantines when no filters provided', async () => {
    const records = [makeQuarantine()]
    mockFQ.findMany.mockResolvedValue(records as never)

    const result = await listQuarantines()

    expect(mockFQ.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
    expect(result).toEqual(records)
  })

  it('applies budgetLineId filter', async () => {
    mockFQ.findMany.mockResolvedValue([])

    await listQuarantines({ budgetLineId: BUDGET_LINE_ID })

    expect(mockFQ.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { budgetLineId: BUDGET_LINE_ID } })
    )
  })

  it('applies providerId filter', async () => {
    mockFQ.findMany.mockResolvedValue([])

    await listQuarantines({ providerId: PROVIDER_ID })

    expect(mockFQ.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerId: PROVIDER_ID } })
    )
  })

  it('applies status filter', async () => {
    mockFQ.findMany.mockResolvedValue([])

    await listQuarantines({ status: 'RELEASED' })

    expect(mockFQ.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'RELEASED' } })
    )
  })
})

// ── getQuarantine ─────────────────────────────────────────────────────────

describe('getQuarantine', () => {
  it('returns the quarantine when found', async () => {
    const record = makeQuarantine()
    mockFQ.findUnique.mockResolvedValue(record as never)

    const result = await getQuarantine(QID)

    expect(result).toEqual(record)
    expect(mockFQ.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: QID } })
    )
  })

  it('throws NOT_FOUND when quarantine does not exist', async () => {
    mockFQ.findUnique.mockResolvedValue(null)

    await expect(getQuarantine('nonexistent')).rejects.toThrow('NOT_FOUND')
  })
})

// ── createQuarantine ──────────────────────────────────────────────────────

describe('createQuarantine', () => {
  it('creates a quarantine when budget capacity is sufficient', async () => {
    const bl = makeBudgetLine()
    mockBudgetLine.findUnique.mockResolvedValue(bl as never)
    mockFQ.aggregate.mockResolvedValue({ _sum: { quarantinedCents: 0 } } as never)

    const record = makeQuarantine()
    mockFQ.create.mockResolvedValue(record as never)

    const result = await createQuarantine(
      {
        budgetLineId: BUDGET_LINE_ID,
        providerId: PROVIDER_ID,
        quarantinedCents: 100000,
      },
      USER_ID,
    )

    expect(result).toEqual(record)
    expect(mockFQ.create).toHaveBeenCalledTimes(1)
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
  })

  it('rejects when quarantinedCents exceeds available budget capacity', async () => {
    // allocatedCents=500000, spentCents=50000, existing quarantines=400000 → available=50000
    mockBudgetLine.findUnique.mockResolvedValue(makeBudgetLine() as never)
    mockFQ.aggregate.mockResolvedValue({ _sum: { quarantinedCents: 400000 } } as never)

    await expect(
      createQuarantine(
        { budgetLineId: BUDGET_LINE_ID, providerId: PROVIDER_ID, quarantinedCents: 100000 },
        USER_ID,
      )
    ).rejects.toThrow('INSUFFICIENT_BUDGET_CAPACITY')

    expect(mockFQ.create).not.toHaveBeenCalled()
  })

  it('rejects when budget line does not exist', async () => {
    mockBudgetLine.findUnique.mockResolvedValue(null)

    await expect(
      createQuarantine(
        { budgetLineId: 'invalid', providerId: PROVIDER_ID, quarantinedCents: 1000 },
        USER_ID,
      )
    ).rejects.toThrow('BUDGET_LINE_NOT_FOUND')
  })
})

// ── updateQuarantine ──────────────────────────────────────────────────────

describe('updateQuarantine', () => {
  it('updates notes without re-checking capacity', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ status: 'ACTIVE', quarantinedCents: 100000 }) as never
    )
    const updated = makeQuarantine({ notes: 'Updated note' })
    mockFQ.update.mockResolvedValue(updated as never)

    const result = await updateQuarantine(QID, { notes: 'Updated note' }, USER_ID)

    expect(result).toEqual(updated)
    expect(mockBudgetLine.findUnique).not.toHaveBeenCalled()
    expect(mockFQ.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: QID }, data: { notes: 'Updated note' } })
    )
  })

  it('validates capacity when quarantinedCents changes', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ status: 'ACTIVE', quarantinedCents: 100000 }) as never
    )
    mockBudgetLine.findUnique.mockResolvedValue(makeBudgetLine() as never)
    mockFQ.aggregate.mockResolvedValue({ _sum: { quarantinedCents: 0 } } as never)
    const updated = makeQuarantine({ quarantinedCents: 200000 })
    mockFQ.update.mockResolvedValue(updated as never)

    const result = await updateQuarantine(QID, { quarantinedCents: 200000 }, USER_ID)

    expect(result).toEqual(updated)
    expect(mockBudgetLine.findUnique).toHaveBeenCalledTimes(1)
  })

  it('throws NOT_FOUND when quarantine does not exist', async () => {
    mockFQ.findUnique.mockResolvedValue(null)

    await expect(updateQuarantine('nonexistent', { notes: 'x' }, USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  it('throws QUARANTINE_NOT_ACTIVE when quarantine is released', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ status: 'RELEASED' }) as never
    )

    await expect(updateQuarantine(QID, { notes: 'x' }, USER_ID)).rejects.toThrow('QUARANTINE_NOT_ACTIVE')
  })
})

// ── releaseQuarantine ─────────────────────────────────────────────────────

describe('releaseQuarantine', () => {
  it('sets status to RELEASED', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ status: 'ACTIVE' }) as never
    )
    const released = makeQuarantine({ status: 'RELEASED' })
    mockFQ.update.mockResolvedValue(released as never)

    const result = await releaseQuarantine(QID, USER_ID)

    expect(result.status).toBe('RELEASED')
    expect(mockFQ.update).toHaveBeenCalledWith({
      where: { id: QID },
      data: { status: 'RELEASED' },
    })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
  })

  it('throws NOT_FOUND when quarantine does not exist', async () => {
    mockFQ.findUnique.mockResolvedValue(null)

    await expect(releaseQuarantine('nonexistent', USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  it('throws QUARANTINE_NOT_ACTIVE when already released', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ status: 'RELEASED' }) as never
    )

    await expect(releaseQuarantine(QID, USER_ID)).rejects.toThrow('QUARANTINE_NOT_ACTIVE')
  })
})

// ── drawDown ──────────────────────────────────────────────────────────────

describe('drawDown', () => {
  it('increments usedCents successfully', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ quarantinedCents: 100000, usedCents: 20000, status: 'ACTIVE' }) as never
    )
    const updated = makeQuarantine({ usedCents: 50000 })
    mockFQ.update.mockResolvedValue(updated as never)

    const result = await drawDown(QID, 30000, USER_ID)

    expect(result).toEqual(updated)
    expect(mockFQ.update).toHaveBeenCalledWith({
      where: { id: QID },
      data: { usedCents: 50000 },
    })
    expect(mockAudit.create).toHaveBeenCalledTimes(1)
  })

  it('rejects when draw-down would exceed quarantined amount', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ quarantinedCents: 100000, usedCents: 80000, status: 'ACTIVE' }) as never
    )

    await expect(drawDown(QID, 30000, USER_ID)).rejects.toThrow('DRAW_DOWN_EXCEEDS_QUARANTINE')
    expect(mockFQ.update).not.toHaveBeenCalled()
  })

  it('throws NOT_FOUND when quarantine does not exist', async () => {
    mockFQ.findUnique.mockResolvedValue(null)

    await expect(drawDown('nonexistent', 1000, USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  it('throws QUARANTINE_NOT_ACTIVE when quarantine is not active', async () => {
    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ status: 'EXPIRED' }) as never
    )

    await expect(drawDown(QID, 1000, USER_ID)).rejects.toThrow('QUARANTINE_NOT_ACTIVE')
  })

  it('emits threshold event when usedCents reaches 80 percent', async () => {
    const { processEvent } = require('@/lib/modules/automation/engine') as { processEvent: jest.Mock }
    processEvent.mockClear()

    mockFQ.findUnique.mockResolvedValue(
      makeQuarantine({ quarantinedCents: 100000, usedCents: 70000, status: 'ACTIVE' }) as never
    )
    mockFQ.update.mockResolvedValue(makeQuarantine({ usedCents: 80000 }) as never)

    await drawDown(QID, 10000, USER_ID)

    // Allow microtask queue to flush the fire-and-forget
    await Promise.resolve()

    expect(processEvent).toHaveBeenCalledWith(
      'lotus-pm.fund-quarantine.threshold-reached',
      expect.objectContaining({ usedPercent: 80 })
    )
  })
})

// ── autoCreateFromServiceAgreement ────────────────────────────────────────

describe('autoCreateFromServiceAgreement', () => {
  const rateLine = {
    id: 'rl-001',
    agreementId: SA_ID,
    categoryCode: '01',
    categoryName: 'Daily Activities',
    supportItemCode: '01_011_0107_1_3',
    supportItemName: 'Support item',
    agreedRateCents: 10000,
    maxQuantity: { valueOf: () => 10, toNumber: () => 10 },
    unitType: 'H',
    createdAt: new Date('2026-02-22'),
    updatedAt: new Date('2026-02-22'),
  }

  it('creates quarantines for each matching rate line', async () => {
    mockSA.findUnique.mockResolvedValue({
      id: SA_ID,
      providerId: PROVIDER_ID,
      rateLines: [rateLine],
    } as never)

    mockBudgetLine.findUnique.mockResolvedValue(makeBudgetLine() as never)
    mockFQ.aggregate.mockResolvedValue({ _sum: { quarantinedCents: 0 } } as never)

    const created = makeQuarantine({ quarantinedCents: 100000 })
    mockFQ.create.mockResolvedValue(created as never)

    const result = await autoCreateFromServiceAgreement(SA_ID, PLAN_ID, USER_ID)

    expect(result).toHaveLength(1)
    expect(mockFQ.create).toHaveBeenCalledTimes(1)
    expect(mockFQ.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceAgreementId: SA_ID,
          providerId: PROVIDER_ID,
          quarantinedCents: 100000,
        }),
      })
    )
  })

  it('uses agreedRateCents as placeholder when maxQuantity is null', async () => {
    const rateLineNoQty = { ...rateLine, maxQuantity: null }
    mockSA.findUnique.mockResolvedValue({
      id: SA_ID,
      providerId: PROVIDER_ID,
      rateLines: [rateLineNoQty],
    } as never)

    mockBudgetLine.findUnique.mockResolvedValue(makeBudgetLine() as never)
    mockFQ.aggregate.mockResolvedValue({ _sum: { quarantinedCents: 0 } } as never)
    mockFQ.create.mockResolvedValue(makeQuarantine({ quarantinedCents: 10000 }) as never)

    const result = await autoCreateFromServiceAgreement(SA_ID, PLAN_ID, USER_ID)

    expect(result).toHaveLength(1)
    expect(mockFQ.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quarantinedCents: 10000 }),
      })
    )
  })

  it('skips rate lines with no matching budget line', async () => {
    mockSA.findUnique.mockResolvedValue({
      id: SA_ID,
      providerId: PROVIDER_ID,
      rateLines: [rateLine],
    } as never)

    mockBudgetLine.findUnique.mockResolvedValue(null)

    const result = await autoCreateFromServiceAgreement(SA_ID, PLAN_ID, USER_ID)

    expect(result).toHaveLength(0)
    expect(mockFQ.create).not.toHaveBeenCalled()
  })

  it('skips rate lines with insufficient budget capacity', async () => {
    mockSA.findUnique.mockResolvedValue({
      id: SA_ID,
      providerId: PROVIDER_ID,
      rateLines: [rateLine],
    } as never)

    // allocatedCents=500000, spentCents=50000, existing=450000 → available=0
    mockBudgetLine.findUnique.mockResolvedValue(makeBudgetLine() as never)
    mockFQ.aggregate.mockResolvedValue({ _sum: { quarantinedCents: 450000 } } as never)

    const result = await autoCreateFromServiceAgreement(SA_ID, PLAN_ID, USER_ID)

    expect(result).toHaveLength(0)
    expect(mockFQ.create).not.toHaveBeenCalled()
  })

  it('throws SERVICE_AGREEMENT_NOT_FOUND when SA does not exist', async () => {
    mockSA.findUnique.mockResolvedValue(null)

    await expect(autoCreateFromServiceAgreement('nonexistent', PLAN_ID, USER_ID))
      .rejects.toThrow('SERVICE_AGREEMENT_NOT_FOUND')
  })
})
