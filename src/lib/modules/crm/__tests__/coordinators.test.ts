/**
 * Unit tests for the CRM Coordinator Assignment module.
 * Prisma client is mocked — no real DB calls.
 */

import {
  listCoordinators,
  getCoordinator,
  listAssignments,
  assignCoordinator,
  unassignCoordinator,
  getParticipantCoordinator,
  getCoordinatorParticipants,
} from '../coordinators'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    coreUser: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    crmParticipant: {
      findFirst: jest.fn(),
    },
    crmCoordinatorAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    coreAuditLog: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue([]),
}))

import { prisma } from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCoordinator(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coord-001',
    name: 'Sarah Mitchell',
    email: 'sarah@lotusassist.com.au',
    role: 'SUPPORT_COORDINATOR',
    deletedAt: null,
    ...overrides,
  }
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'part-001',
    firstName: 'Michael',
    lastName: 'Thompson',
    ndisNumber: '430167234',
    deletedAt: null,
    ...overrides,
  }
}

function makeAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assign-001',
    coordinatorId: 'coord-001',
    participantId: 'part-001',
    organisation: 'Lotus Assist',
    assignedAt: new Date('2026-02-22T10:00:00Z'),
    assignedById: 'admin-001',
    isActive: true,
    deactivatedAt: null,
    createdAt: new Date('2026-02-22T10:00:00Z'),
    updatedAt: new Date('2026-02-22T10:00:00Z'),
    coordinator: { id: 'coord-001', name: 'Sarah Mitchell', email: 'sarah@lotusassist.com.au' },
    participant: { id: 'part-001', firstName: 'Michael', lastName: 'Thompson', ndisNumber: '430167234' },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.coreAuditLog.create.mockResolvedValue({})
})

describe('listCoordinators', () => {
  test('returns all active support coordinators ordered by name', async () => {
    const coordinators = [makeCoordinator(), makeCoordinator({ id: 'coord-002', name: 'Tom Baker' })]
    mockPrisma.coreUser.findMany.mockResolvedValue(coordinators)

    const result = await listCoordinators()

    expect(mockPrisma.coreUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'SUPPORT_COORDINATOR', deletedAt: null },
        orderBy: { name: 'asc' },
      })
    )
    expect(result).toEqual(coordinators)
  })

  test('returns empty array when no coordinators exist', async () => {
    mockPrisma.coreUser.findMany.mockResolvedValue([])
    const result = await listCoordinators()
    expect(result).toEqual([])
  })
})

describe('getCoordinator', () => {
  test('returns coordinator by id', async () => {
    const coordinator = makeCoordinator()
    mockPrisma.coreUser.findFirst.mockResolvedValue(coordinator)

    const result = await getCoordinator('coord-001')
    expect(result).toEqual(coordinator)
    expect(mockPrisma.coreUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'coord-001', role: 'SUPPORT_COORDINATOR', deletedAt: null },
      })
    )
  })

  test('throws when coordinator not found', async () => {
    mockPrisma.coreUser.findFirst.mockResolvedValue(null)
    await expect(getCoordinator('does-not-exist')).rejects.toThrow('Coordinator not found')
  })

  test('throws when user exists but is not SUPPORT_COORDINATOR role', async () => {
    mockPrisma.coreUser.findFirst.mockResolvedValue(null) // findFirst returns null due to role filter
    await expect(getCoordinator('coord-001')).rejects.toThrow('Coordinator not found')
  })
})

describe('listAssignments', () => {
  test('returns all active assignments when no coordinatorId given', async () => {
    const assignments = [makeAssignment()]
    mockPrisma.crmCoordinatorAssignment.findMany.mockResolvedValue(assignments)

    const result = await listAssignments()

    expect(mockPrisma.crmCoordinatorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    )
    expect(result).toEqual(assignments)
  })

  test('filters by coordinatorId when provided', async () => {
    const assignments = [makeAssignment()]
    mockPrisma.crmCoordinatorAssignment.findMany.mockResolvedValue(assignments)

    const result = await listAssignments('coord-001')

    expect(mockPrisma.crmCoordinatorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, coordinatorId: 'coord-001' },
      })
    )
    expect(result).toEqual(assignments)
  })
})

describe('assignCoordinator', () => {
  const input = {
    coordinatorId: 'coord-001',
    participantId: 'part-001',
    organisation: 'Lotus Assist',
  }

  test('creates a new assignment successfully', async () => {
    const assignment = makeAssignment()
    mockPrisma.coreUser.findFirst.mockResolvedValue(makeCoordinator())
    mockPrisma.crmParticipant.findFirst.mockResolvedValue(makeParticipant())
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(null)
    mockPrisma.crmCoordinatorAssignment.create.mockResolvedValue(assignment)

    const result = await assignCoordinator(input, 'admin-001')

    expect(mockPrisma.crmCoordinatorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coordinatorId: 'coord-001',
          participantId: 'part-001',
          organisation: 'Lotus Assist',
          assignedById: 'admin-001',
        }),
      })
    )
    expect(result).toEqual(assignment)
  })

  test('throws when coordinator not found or wrong role', async () => {
    mockPrisma.coreUser.findFirst.mockResolvedValue(null)
    await expect(assignCoordinator(input, 'admin-001')).rejects.toThrow(
      'Coordinator not found or is not a Support Coordinator'
    )
  })

  test('throws when participant not found', async () => {
    mockPrisma.coreUser.findFirst.mockResolvedValue(makeCoordinator())
    mockPrisma.crmParticipant.findFirst.mockResolvedValue(null)
    await expect(assignCoordinator(input, 'admin-001')).rejects.toThrow('Participant not found')
  })

  test('throws when coordinator is already assigned to participant', async () => {
    mockPrisma.coreUser.findFirst.mockResolvedValue(makeCoordinator())
    mockPrisma.crmParticipant.findFirst.mockResolvedValue(makeParticipant())
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(makeAssignment({ isActive: true }))

    await expect(assignCoordinator(input, 'admin-001')).rejects.toThrow(
      'Coordinator is already assigned to this participant'
    )
  })

  test('re-activates existing inactive assignment (upsert)', async () => {
    const inactive = makeAssignment({ isActive: false, deactivatedAt: new Date() })
    const reactivated = makeAssignment({ isActive: true, deactivatedAt: null })
    mockPrisma.coreUser.findFirst.mockResolvedValue(makeCoordinator())
    mockPrisma.crmParticipant.findFirst.mockResolvedValue(makeParticipant())
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(inactive)
    mockPrisma.crmCoordinatorAssignment.update.mockResolvedValue(reactivated)

    const result = await assignCoordinator(input, 'admin-001')

    expect(mockPrisma.crmCoordinatorAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assign-001' },
        data: expect.objectContaining({ isActive: true, deactivatedAt: null }),
      })
    )
    expect(result.isActive).toBe(true)
  })

  test('creates audit log after assignment', async () => {
    const assignment = makeAssignment()
    mockPrisma.coreUser.findFirst.mockResolvedValue(makeCoordinator())
    mockPrisma.crmParticipant.findFirst.mockResolvedValue(makeParticipant())
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(null)
    mockPrisma.crmCoordinatorAssignment.create.mockResolvedValue(assignment)

    await assignCoordinator(input, 'admin-001')

    expect(mockPrisma.coreAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'admin-001',
          action: 'coordinator.assigned',
          resource: 'CrmCoordinatorAssignment',
        }),
      })
    )
  })
})

describe('unassignCoordinator', () => {
  test('deactivates an active assignment', async () => {
    const assignment = makeAssignment()
    const deactivated = makeAssignment({ isActive: false, deactivatedAt: new Date() })
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(assignment)
    mockPrisma.crmCoordinatorAssignment.update.mockResolvedValue(deactivated)

    const result = await unassignCoordinator('assign-001', 'admin-001')

    expect(mockPrisma.crmCoordinatorAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-001' },
      data: expect.objectContaining({ isActive: false }),
    })
    expect(result.isActive).toBe(false)
  })

  test('throws when assignment not found', async () => {
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(null)
    await expect(unassignCoordinator('no-such-id', 'admin-001')).rejects.toThrow('Assignment not found')
  })

  test('throws when assignment is already inactive', async () => {
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(
      makeAssignment({ isActive: false })
    )
    await expect(unassignCoordinator('assign-001', 'admin-001')).rejects.toThrow(
      'Assignment is already inactive'
    )
  })

  test('creates audit log after unassignment', async () => {
    const assignment = makeAssignment()
    const deactivated = makeAssignment({ isActive: false })
    mockPrisma.crmCoordinatorAssignment.findUnique.mockResolvedValue(assignment)
    mockPrisma.crmCoordinatorAssignment.update.mockResolvedValue(deactivated)

    await unassignCoordinator('assign-001', 'admin-001')

    expect(mockPrisma.coreAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'admin-001',
          action: 'coordinator.unassigned',
          resource: 'CrmCoordinatorAssignment',
        }),
      })
    )
  })
})

describe('getParticipantCoordinator', () => {
  test('returns active assignment for participant', async () => {
    const assignment = makeAssignment()
    mockPrisma.crmCoordinatorAssignment.findFirst.mockResolvedValue(assignment)

    const result = await getParticipantCoordinator('part-001')

    expect(mockPrisma.crmCoordinatorAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { participantId: 'part-001', isActive: true },
      })
    )
    expect(result).toEqual(assignment)
  })

  test('returns null when participant has no active coordinator', async () => {
    mockPrisma.crmCoordinatorAssignment.findFirst.mockResolvedValue(null)
    const result = await getParticipantCoordinator('part-001')
    expect(result).toBeNull()
  })
})

describe('getCoordinatorParticipants', () => {
  test('returns active assignments for coordinator', async () => {
    const assignments = [makeAssignment(), makeAssignment({ id: 'assign-002', participantId: 'part-002' })]
    mockPrisma.crmCoordinatorAssignment.findMany.mockResolvedValue(assignments)

    const result = await getCoordinatorParticipants('coord-001')

    expect(mockPrisma.crmCoordinatorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { coordinatorId: 'coord-001', isActive: true },
      })
    )
    expect(result).toHaveLength(2)
  })

  test('returns empty array when coordinator has no participants', async () => {
    mockPrisma.crmCoordinatorAssignment.findMany.mockResolvedValue([])
    const result = await getCoordinatorParticipants('coord-001')
    expect(result).toEqual([])
  })
})
