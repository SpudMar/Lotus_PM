/**
 * Unit tests for the Service Agreements module.
 * Covers CRUD, lifecycle transitions, and rate line management.
 *
 * Prisma is fully mocked — no real DB calls are made.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    saServiceAgreement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    saRateLine: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    coreAuditLog: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import {
  listServiceAgreements,
  getServiceAgreement,
  createServiceAgreement,
  updateServiceAgreement,
  deleteServiceAgreement,
  activateServiceAgreement,
  terminateServiceAgreement,
  addRateLine,
  updateRateLine,
  deleteRateLine,
} from '../service-agreements'

// ── Type casts ─────────────────────────────────────────────────────────────

const mockSA = prisma.saServiceAgreement as jest.Mocked<typeof prisma.saServiceAgreement>
const mockRL = prisma.saRateLine as jest.Mocked<typeof prisma.saRateLine>
const mockAudit = prisma.coreAuditLog as jest.Mocked<typeof prisma.coreAuditLog>

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_ID = 'user-cuid-0001'
const SA_ID = 'sa-cuid-00001'
const RL_ID = 'rl-cuid-00001'

function makeAgreement(overrides: Record<string, unknown> = {}) {
  return {
    id: SA_ID,
    agreementRef: 'SA-20260223-ABCD',
    participantId: 'participant-001',
    providerId: 'provider-001',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    reviewDate: null,
    status: 'DRAFT',
    notes: null,
    managedById: USER_ID,
    deletedAt: null,
    createdAt: new Date('2026-02-22'),
    updatedAt: new Date('2026-02-22'),
    participant: { id: 'participant-001', firstName: 'Jane', lastName: 'Doe', ndisNumber: '430123456' },
    provider: { id: 'provider-001', name: 'Support Co' },
    managedBy: { id: USER_ID, name: 'Plan Manager' },
    rateLines: [],
    ...overrides,
  }
}

function makeRateLine(overrides: Record<string, unknown> = {}) {
  return {
    id: RL_ID,
    agreementId: SA_ID,
    categoryCode: '01',
    categoryName: 'Daily Activities',
    supportItemCode: null,
    supportItemName: null,
    agreedRateCents: 15000,
    maxQuantity: null,
    unitType: 'H',
    createdAt: new Date('2026-02-22'),
    updatedAt: new Date('2026-02-22'),
    ...overrides,
  }
}

function clearAll() {
  jest.clearAllMocks()
  mockAudit.create.mockResolvedValue({} as never)
}

// ── listServiceAgreements ──────────────────────────────────────────────────

describe('listServiceAgreements', () => {
  beforeEach(clearAll)

  it('returns agreements excluding soft-deleted', async () => {
    const agreements = [makeAgreement()]
    mockSA.findMany.mockResolvedValue(agreements as never)

    const result = await listServiceAgreements()

    expect(mockSA.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.agreementRef).toBe('SA-20260223-ABCD')
  })

  it('applies filters when provided', async () => {
    mockSA.findMany.mockResolvedValue([] as never)

    await listServiceAgreements({ participantId: 'participant-001', status: 'ACTIVE' })

    expect(mockSA.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          participantId: 'participant-001',
          status: 'ACTIVE',
        }),
      })
    )
  })
})

// ── getServiceAgreement ────────────────────────────────────────────────────

describe('getServiceAgreement', () => {
  beforeEach(clearAll)

  it('returns agreement with rateLines', async () => {
    const agreement = makeAgreement({ rateLines: [makeRateLine()] })
    mockSA.findFirst.mockResolvedValue(agreement as never)

    const result = await getServiceAgreement(SA_ID)

    expect(mockSA.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SA_ID, deletedAt: null } })
    )
    expect(result.rateLines).toHaveLength(1)
  })

  it('throws when service agreement is not found or deleted', async () => {
    mockSA.findFirst.mockResolvedValue(null)

    await expect(getServiceAgreement('nonexistent')).rejects.toThrow('Service agreement not found')
  })
})

// ── createServiceAgreement ─────────────────────────────────────────────────

describe('createServiceAgreement', () => {
  beforeEach(clearAll)

  it('creates an agreement with correct fields and DRAFT status', async () => {
    const created = makeAgreement()
    mockSA.findUnique.mockResolvedValue(null) // no collision
    mockSA.create.mockResolvedValue(created as never)

    const result = await createServiceAgreement(
      {
        participantId: 'participant-001',
        providerId: 'provider-001',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        managedById: USER_ID,
      },
      USER_ID
    )

    expect(mockSA.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          participantId: 'participant-001',
          providerId: 'provider-001',
        }),
      })
    )
    expect(result.status).toBe('DRAFT')
    expect(mockAudit.create).toHaveBeenCalled()
  })

  it('generates agreementRef in SA-YYYYMMDD-XXXX format', async () => {
    const created = makeAgreement()
    mockSA.findUnique.mockResolvedValue(null)
    mockSA.create.mockResolvedValue(created as never)

    await createServiceAgreement(
      {
        participantId: 'participant-001',
        providerId: 'provider-001',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        managedById: USER_ID,
      },
      USER_ID
    )

    const createCall = mockSA.create.mock.calls[0]![0]
    expect(createCall.data.agreementRef).toMatch(/^SA-\d{8}-[A-Z0-9]{4}$/)
  })

  it('retries on agreementRef collision and generates unique ref', async () => {
    const existing = makeAgreement()
    const created = makeAgreement({ agreementRef: 'SA-20260223-WXYZ' })

    // First two calls return existing (collision), third returns null (unique)
    mockSA.findUnique
      .mockResolvedValueOnce(existing as never)
      .mockResolvedValueOnce(existing as never)
      .mockResolvedValueOnce(null)
    mockSA.create.mockResolvedValue(created as never)

    const result = await createServiceAgreement(
      {
        participantId: 'participant-001',
        providerId: 'provider-001',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        managedById: USER_ID,
      },
      USER_ID
    )

    expect(mockSA.findUnique).toHaveBeenCalledTimes(3)
    expect(result).toBeDefined()
  })
})

// ── updateServiceAgreement ─────────────────────────────────────────────────

describe('updateServiceAgreement', () => {
  beforeEach(clearAll)

  it('updates fields and creates audit log', async () => {
    const existing = makeAgreement()
    const updated = makeAgreement({ notes: 'Updated notes' })
    mockSA.findFirst.mockResolvedValue(existing as never)
    mockSA.update.mockResolvedValue(updated as never)

    const result = await updateServiceAgreement(SA_ID, { notes: 'Updated notes' }, USER_ID)

    expect(mockSA.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SA_ID },
        data: expect.objectContaining({ notes: 'Updated notes' }),
      })
    )
    expect(mockAudit.create).toHaveBeenCalled()
    expect(result.notes).toBe('Updated notes')
  })
})

// ── deleteServiceAgreement ─────────────────────────────────────────────────

describe('deleteServiceAgreement', () => {
  beforeEach(clearAll)

  it('sets deletedAt on a DRAFT agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'DRAFT' }) as never)
    mockSA.update.mockResolvedValue({} as never)

    await deleteServiceAgreement(SA_ID, USER_ID)

    expect(mockSA.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SA_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    )
    expect(mockAudit.create).toHaveBeenCalled()
  })

  it('rejects deletion of an ACTIVE agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'ACTIVE' }) as never)

    await expect(deleteServiceAgreement(SA_ID, USER_ID)).rejects.toThrow(
      'Cannot delete an ACTIVE service agreement'
    )

    expect(mockSA.update).not.toHaveBeenCalled()
  })
})

// ── activateServiceAgreement ───────────────────────────────────────────────

describe('activateServiceAgreement', () => {
  beforeEach(clearAll)

  it('transitions DRAFT → ACTIVE', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'DRAFT' }) as never)
    const activated = makeAgreement({ status: 'ACTIVE' })
    mockSA.update.mockResolvedValue(activated as never)

    const result = await activateServiceAgreement(SA_ID, USER_ID)

    expect(mockSA.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SA_ID },
        data: { status: 'ACTIVE' },
      })
    )
    expect(mockAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'service-agreement.activated',
        before: { status: 'DRAFT' },
        after: { status: 'ACTIVE' },
      }),
    })
    expect(result.status).toBe('ACTIVE')
  })

  it('rejects activation of a TERMINATED agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'TERMINATED' }) as never)

    await expect(activateServiceAgreement(SA_ID, USER_ID)).rejects.toThrow(
      'Cannot activate a service agreement with status TERMINATED'
    )

    expect(mockSA.update).not.toHaveBeenCalled()
  })

  it('rejects activation of an already ACTIVE agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'ACTIVE' }) as never)

    await expect(activateServiceAgreement(SA_ID, USER_ID)).rejects.toThrow(
      'Cannot activate a service agreement with status ACTIVE'
    )
  })
})

// ── terminateServiceAgreement ──────────────────────────────────────────────

describe('terminateServiceAgreement', () => {
  beforeEach(clearAll)

  it('transitions ACTIVE → TERMINATED', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'ACTIVE' }) as never)
    const terminated = makeAgreement({ status: 'TERMINATED' })
    mockSA.update.mockResolvedValue(terminated as never)

    const result = await terminateServiceAgreement(SA_ID, USER_ID)

    expect(mockSA.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SA_ID },
        data: { status: 'TERMINATED' },
      })
    )
    expect(mockAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'service-agreement.terminated',
        before: { status: 'ACTIVE' },
        after: { status: 'TERMINATED' },
      }),
    })
    expect(result.status).toBe('TERMINATED')
  })

  it('rejects termination of a DRAFT agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'DRAFT' }) as never)

    await expect(terminateServiceAgreement(SA_ID, USER_ID)).rejects.toThrow(
      'Cannot terminate a service agreement with status DRAFT'
    )

    expect(mockSA.update).not.toHaveBeenCalled()
  })
})

// ── addRateLine ────────────────────────────────────────────────────────────

describe('addRateLine', () => {
  beforeEach(clearAll)

  it('adds a rate line to a DRAFT agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'DRAFT' }) as never)
    const rl = makeRateLine()
    mockRL.create.mockResolvedValue(rl as never)

    const result = await addRateLine(
      SA_ID,
      {
        categoryCode: '01',
        categoryName: 'Daily Activities',
        agreedRateCents: 15000,
        unitType: 'H',
      },
      USER_ID
    )

    expect(mockRL.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agreementId: SA_ID,
          categoryCode: '01',
          agreedRateCents: 15000,
        }),
      })
    )
    expect(mockAudit.create).toHaveBeenCalled()
    expect(result.id).toBe(RL_ID)
  })

  it('rejects adding a rate line to an ACTIVE agreement', async () => {
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'ACTIVE' }) as never)

    await expect(
      addRateLine(SA_ID, { categoryCode: '01', categoryName: 'Daily Activities', agreedRateCents: 15000 }, USER_ID)
    ).rejects.toThrow('Rate lines can only be added to DRAFT service agreements')

    expect(mockRL.create).not.toHaveBeenCalled()
  })
})

// ── updateRateLine ─────────────────────────────────────────────────────────

describe('updateRateLine', () => {
  beforeEach(clearAll)

  it('updates agreedRateCents and creates audit log', async () => {
    mockRL.findUnique.mockResolvedValue(makeRateLine() as never)
    const updated = makeRateLine({ agreedRateCents: 18000 })
    mockRL.update.mockResolvedValue(updated as never)

    const result = await updateRateLine(RL_ID, { agreedRateCents: 18000 }, USER_ID)

    expect(mockRL.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RL_ID },
        data: expect.objectContaining({ agreedRateCents: 18000 }),
      })
    )
    expect(mockAudit.create).toHaveBeenCalled()
    expect(result.agreedRateCents).toBe(18000)
  })

  it('throws when rate line is not found', async () => {
    mockRL.findUnique.mockResolvedValue(null)

    await expect(updateRateLine('nonexistent', { agreedRateCents: 100 }, USER_ID)).rejects.toThrow(
      'Rate line not found'
    )

    expect(mockRL.update).not.toHaveBeenCalled()
  })
})

// ── deleteRateLine ─────────────────────────────────────────────────────────

describe('deleteRateLine', () => {
  beforeEach(clearAll)

  it('deletes a rate line and creates audit log', async () => {
    mockRL.findUnique.mockResolvedValue(makeRateLine() as never)
    mockRL.delete.mockResolvedValue({} as never)

    await deleteRateLine(RL_ID, USER_ID)

    expect(mockRL.delete).toHaveBeenCalledWith({ where: { id: RL_ID } })
    expect(mockAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'service-agreement.rate-line.deleted',
        resourceId: SA_ID,
      }),
    })
  })

  it('throws when rate line is not found', async () => {
    mockRL.findUnique.mockResolvedValue(null)

    await expect(deleteRateLine('nonexistent', USER_ID)).rejects.toThrow('Rate line not found')

    expect(mockRL.delete).not.toHaveBeenCalled()
  })
})

// ── Rate line cascade ──────────────────────────────────────────────────────

describe('Rate line cascade on SA delete', () => {
  beforeEach(clearAll)

  it('soft-deleting SA (DRAFT status) does not block rate line access via cascade', async () => {
    // This tests the DB cascade constraint exists in schema (onDelete: Cascade)
    // At the unit-test level we just verify the soft-delete path runs without errors
    // and does NOT call deleteRateLine (cascade is handled by the DB on hard delete)
    mockSA.findFirst.mockResolvedValue(makeAgreement({ status: 'DRAFT' }) as never)
    mockSA.update.mockResolvedValue({} as never)

    await deleteServiceAgreement(SA_ID, USER_ID)

    // SA is soft-deleted, rate lines remain untouched by application code
    // (DB cascade handles hard-delete scenarios)
    expect(mockRL.delete).not.toHaveBeenCalled()
    expect(mockSA.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    )
  })
})
