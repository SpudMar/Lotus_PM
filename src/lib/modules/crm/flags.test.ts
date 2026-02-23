/**
 * Unit tests for the Flag/Hold module (WS-F3).
 * Prisma client is mocked — no real DB calls.
 */

import { createFlag, listFlags, resolveFlag, getActiveFlags, FlagSeverity } from './flags'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    crmFlag: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFlag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flag-001',
    severity: FlagSeverity.ADVISORY,
    reason: 'Watch for automated invoices after cancellation',
    createdAt: new Date('2026-02-24T10:00:00Z'),
    createdById: 'user-001',
    createdBy: { id: 'user-001', name: 'Jane Plan Manager' },
    participantId: 'part-001',
    providerId: null,
    resolvedAt: null,
    resolvedById: null,
    resolvedBy: null,
    resolveNote: null,
    deletedAt: null,
    ...overrides,
  }
}

// ── createFlag ────────────────────────────────────────────────────────────────

describe('createFlag', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a flag with participantId', async () => {
    const created = makeFlag()
    mockPrisma.crmFlag.create.mockResolvedValue(created)

    const { createAuditLog } = await import('@/lib/modules/core/audit')

    const result = await createFlag(
      {
        severity: FlagSeverity.ADVISORY,
        reason: 'Watch for automated invoices after cancellation',
        participantId: 'part-001',
      },
      'user-001'
    )

    expect(mockPrisma.crmFlag.create).toHaveBeenCalledWith({
      data: {
        severity: FlagSeverity.ADVISORY,
        reason: 'Watch for automated invoices after cancellation',
        createdById: 'user-001',
        participantId: 'part-001',
        providerId: undefined,
      },
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-001',
        action: 'flag.created',
        resource: 'flag',
        resourceId: 'flag-001',
      })
    )
    expect(result).toEqual(created)
  })

  it('creates a blocking flag with providerId', async () => {
    const created = makeFlag({
      id: 'flag-002',
      severity: FlagSeverity.BLOCKING,
      participantId: null,
      providerId: 'prov-001',
    })
    mockPrisma.crmFlag.create.mockResolvedValue(created)

    const result = await createFlag(
      {
        severity: FlagSeverity.BLOCKING,
        reason: 'Provider under investigation — do not approve invoices',
        providerId: 'prov-001',
      },
      'user-001'
    )

    expect(mockPrisma.crmFlag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: FlagSeverity.BLOCKING,
        providerId: 'prov-001',
        participantId: undefined,
      }),
    })
    expect(result.id).toBe('flag-002')
  })

  it('throws when both participantId and providerId are provided', async () => {
    await expect(
      createFlag(
        {
          severity: FlagSeverity.ADVISORY,
          reason: 'Both provided — invalid',
          participantId: 'part-001',
          providerId: 'prov-001',
        },
        'user-001'
      )
    ).rejects.toThrow('Exactly one of participantId or providerId must be provided')

    expect(mockPrisma.crmFlag.create).not.toHaveBeenCalled()
  })

  it('throws when neither participantId nor providerId are provided', async () => {
    await expect(
      createFlag(
        {
          severity: FlagSeverity.ADVISORY,
          reason: 'Neither provided — invalid',
        },
        'user-001'
      )
    ).rejects.toThrow('Exactly one of participantId or providerId must be provided')

    expect(mockPrisma.crmFlag.create).not.toHaveBeenCalled()
  })
})

// ── resolveFlag ───────────────────────────────────────────────────────────────

describe('resolveFlag', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sets resolvedAt, resolvedById, and resolveNote', async () => {
    const resolved = makeFlag({
      resolvedAt: new Date('2026-02-25T09:00:00Z'),
      resolvedById: 'user-002',
      resolvedBy: { id: 'user-002', name: 'Senior PM' },
      resolveNote: 'Confirmed with coordinator — normal operations resumed',
    })
    mockPrisma.crmFlag.update.mockResolvedValue(resolved)

    const { createAuditLog } = await import('@/lib/modules/core/audit')

    const result = await resolveFlag(
      'flag-001',
      'Confirmed with coordinator — normal operations resumed',
      'user-002'
    )

    expect(mockPrisma.crmFlag.update).toHaveBeenCalledWith({
      where: { id: 'flag-001' },
      data: expect.objectContaining({
        resolvedAt: expect.any(Date),
        resolvedById: 'user-002',
        resolveNote: 'Confirmed with coordinator — normal operations resumed',
      }),
    })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-002',
        action: 'flag.resolved',
        resource: 'flag',
        resourceId: 'flag-001',
      })
    )
    expect(result).toEqual(resolved)
  })
})

// ── getActiveFlags ────────────────────────────────────────────────────────────

describe('getActiveFlags', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns only unresolved, non-deleted flags for a participant', async () => {
    const activeFlag = makeFlag({ resolvedAt: null, deletedAt: null })
    mockPrisma.crmFlag.findMany.mockResolvedValue([activeFlag])

    const result = await getActiveFlags({ participantId: 'part-001' })

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ participantId: 'part-001' }],
          resolvedAt: null,
          deletedAt: null,
        }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('flag-001')
  })

  it('excludes soft-deleted flags', async () => {
    mockPrisma.crmFlag.findMany.mockResolvedValue([])

    const result = await getActiveFlags({ participantId: 'part-001' })

    const callArg = mockPrisma.crmFlag.findMany.mock.calls[0][0]
    expect(callArg.where.deletedAt).toBeNull()
    expect(result).toHaveLength(0)
  })

  it('returns flags for both participant and provider when both provided (OR logic)', async () => {
    const participantFlag = makeFlag({ participantId: 'part-001', providerId: null })
    const providerFlag = makeFlag({
      id: 'flag-002',
      participantId: null,
      providerId: 'prov-001',
    })
    mockPrisma.crmFlag.findMany.mockResolvedValue([participantFlag, providerFlag])

    const result = await getActiveFlags({ participantId: 'part-001', providerId: 'prov-001' })

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ participantId: 'part-001' }, { providerId: 'prov-001' }],
        }),
      })
    )
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no opts provided', async () => {
    const result = await getActiveFlags({})
    expect(mockPrisma.crmFlag.findMany).not.toHaveBeenCalled()
    expect(result).toHaveLength(0)
  })

  it('returns only flags for the correct entity', async () => {
    const flagForPart001 = makeFlag({ participantId: 'part-001' })
    mockPrisma.crmFlag.findMany.mockResolvedValue([flagForPart001])

    const result = await getActiveFlags({ participantId: 'part-001' })

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ participantId: 'part-001' }],
        }),
      })
    )
    expect(result).toHaveLength(1)
  })
})

// ── listFlags ─────────────────────────────────────────────────────────────────

describe('listFlags', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filters by participantId and excludes resolved by default', async () => {
    const flags = [makeFlag()]
    mockPrisma.crmFlag.findMany.mockResolvedValue(flags)
    mockPrisma.crmFlag.count.mockResolvedValue(1)

    const result = await listFlags({ participantId: 'part-001' })

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: 'part-001',
          resolvedAt: null,
          deletedAt: null,
        }),
      })
    )
    expect(result.flags).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('includes resolved flags when includeResolved=true', async () => {
    mockPrisma.crmFlag.findMany.mockResolvedValue([])
    mockPrisma.crmFlag.count.mockResolvedValue(0)

    await listFlags({ participantId: 'part-001', includeResolved: true })

    const whereArg = mockPrisma.crmFlag.findMany.mock.calls[0][0].where as Record<string, unknown>
    expect(whereArg).not.toHaveProperty('resolvedAt')
  })

  it('filters by providerId', async () => {
    mockPrisma.crmFlag.findMany.mockResolvedValue([])
    mockPrisma.crmFlag.count.mockResolvedValue(0)

    await listFlags({ providerId: 'prov-001' })

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerId: 'prov-001' }),
      })
    )
  })

  it('applies default pagination (limit=20, offset=0)', async () => {
    mockPrisma.crmFlag.findMany.mockResolvedValue([])
    mockPrisma.crmFlag.count.mockResolvedValue(0)

    await listFlags({})

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, skip: 0 })
    )
  })

  it('applies custom pagination', async () => {
    mockPrisma.crmFlag.findMany.mockResolvedValue([])
    mockPrisma.crmFlag.count.mockResolvedValue(0)

    await listFlags({ limit: 10, offset: 30 })

    expect(mockPrisma.crmFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 30 })
    )
  })
})
