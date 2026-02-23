import { prisma } from '@/lib/db'
import { processEvent } from '@/lib/modules/automation/engine'
import type {
  AssignCoordinatorInput,
  CreateCoordinatorInput,
  UpdateCoordinatorInput,
} from './coordinators.validation'
import type { CoreUser } from '@prisma/client'

export async function listCoordinators() {
  return prisma.coreUser.findMany({
    where: { role: 'SUPPORT_COORDINATOR', deletedAt: null },
    select: { id: true, name: true, email: true, role: true, phone: true },
    orderBy: { name: 'asc' },
  })
}

export async function getCoordinator(id: string) {
  const coordinator = await prisma.coreUser.findFirst({
    where: { id, role: 'SUPPORT_COORDINATOR', deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  })
  if (!coordinator) throw new Error('Coordinator not found')
  return coordinator
}

export async function listAssignments(coordinatorId?: string) {
  return prisma.crmCoordinatorAssignment.findMany({
    where: {
      isActive: true,
      ...(coordinatorId ? { coordinatorId } : {}),
    },
    include: {
      coordinator: { select: { id: true, name: true, email: true } },
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
    },
    orderBy: { assignedAt: 'desc' },
  })
}

export async function assignCoordinator(data: AssignCoordinatorInput, assignedById: string) {
  // Check coordinator exists with correct role
  const coordinator = await prisma.coreUser.findFirst({
    where: { id: data.coordinatorId, role: 'SUPPORT_COORDINATOR', deletedAt: null },
  })
  if (!coordinator) throw new Error('Coordinator not found or is not a Support Coordinator')

  // Check participant exists
  const participant = await prisma.crmParticipant.findFirst({
    where: { id: data.participantId, deletedAt: null },
  })
  if (!participant) throw new Error('Participant not found')

  // Upsert: if record exists (even inactive), re-activate it
  const existing = await prisma.crmCoordinatorAssignment.findUnique({
    where: {
      coordinatorId_participantId: {
        coordinatorId: data.coordinatorId,
        participantId: data.participantId,
      },
    },
  })

  let assignment
  if (existing) {
    if (existing.isActive) throw new Error('Coordinator is already assigned to this participant')
    assignment = await prisma.crmCoordinatorAssignment.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        deactivatedAt: null,
        organisation: data.organisation ?? null,
        assignedAt: new Date(),
        assignedById,
      },
    })
  } else {
    assignment = await prisma.crmCoordinatorAssignment.create({
      data: {
        coordinatorId: data.coordinatorId,
        participantId: data.participantId,
        organisation: data.organisation ?? null,
        assignedById,
      },
    })
  }

  await prisma.coreAuditLog.create({
    data: {
      userId: assignedById,
      action: 'coordinator.assigned',
      resource: 'CrmCoordinatorAssignment',
      resourceId: assignment.id,
      after: { coordinatorId: data.coordinatorId, participantId: data.participantId },
    },
  })

  void processEvent('lotus-pm.crm.coordinator-assigned', {
    participantId: data.participantId,
    coordinatorId: data.coordinatorId,
    assignmentId: assignment.id,
    assignedById,
    organisation: data.organisation ?? null,
  })

  return assignment
}

export async function unassignCoordinator(assignmentId: string, userId: string) {
  const assignment = await prisma.crmCoordinatorAssignment.findUnique({
    where: { id: assignmentId },
  })
  if (!assignment) throw new Error('Assignment not found')
  if (!assignment.isActive) throw new Error('Assignment is already inactive')

  const updated = await prisma.crmCoordinatorAssignment.update({
    where: { id: assignmentId },
    data: { isActive: false, deactivatedAt: new Date() },
  })

  await prisma.coreAuditLog.create({
    data: {
      userId,
      action: 'coordinator.unassigned',
      resource: 'CrmCoordinatorAssignment',
      resourceId: assignmentId,
      before: { isActive: true },
      after: { isActive: false },
    },
  })

  void processEvent('lotus-pm.crm.coordinator-unassigned', {
    participantId: assignment.participantId,
    coordinatorId: assignment.coordinatorId,
    assignmentId,
    deactivatedById: userId,
  })

  return updated
}

export async function getParticipantCoordinator(participantId: string) {
  return prisma.crmCoordinatorAssignment.findFirst({
    where: { participantId, isActive: true },
    include: {
      coordinator: { select: { id: true, name: true, email: true } },
    },
  })
}

export async function getCoordinatorParticipants(coordinatorId: string) {
  return prisma.crmCoordinatorAssignment.findMany({
    where: { coordinatorId, isActive: true },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
    },
    orderBy: { assignedAt: 'desc' },
  })
}

// ── CRUD: Create ────────────────────────────────────────────────────────────

/**
 * Creates a new Support Coordinator user.
 * The `password` field in the input is validated for strength but not stored
 * (CoreUser has no password column — authentication is handled via NextAuth
 * CredentialsProvider or Cognito OAuth). The password value is accepted by the
 * API for forward-compatibility and UX consistency, but discarded here.
 */
export async function createCoordinator(
  input: CreateCoordinatorInput,
  userId: string
): Promise<Omit<CoreUser, 'isActive' | 'mfaEnabled' | 'lastLoginAt'>> {
  const existing = await prisma.coreUser.findFirst({
    where: { email: input.email, deletedAt: null },
  })
  if (existing) throw new Error('Email already in use')

  const created = await prisma.coreUser.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      role: 'SUPPORT_COORDINATOR',
    },
  })

  await prisma.coreAuditLog.create({
    data: {
      userId,
      action: 'coordinator.created',
      resource: 'CoreUser',
      resourceId: created.id,
      after: { name: created.name, email: created.email },
    },
  })

  return created
}

// ── CRUD: Update ────────────────────────────────────────────────────────────

export async function updateCoordinator(
  id: string,
  input: UpdateCoordinatorInput,
  userId: string
): Promise<CoreUser> {
  const coordinator = await prisma.coreUser.findFirst({
    where: { id, role: 'SUPPORT_COORDINATOR', deletedAt: null },
  })
  if (!coordinator) throw new Error('Coordinator not found')

  if (input.email && input.email !== coordinator.email) {
    const conflict = await prisma.coreUser.findFirst({
      where: { email: input.email, deletedAt: null, NOT: { id } },
    })
    if (conflict) throw new Error('Email already in use')
  }

  const before = { name: coordinator.name, email: coordinator.email, phone: coordinator.phone }

  const updated = await prisma.coreUser.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  })

  await prisma.coreAuditLog.create({
    data: {
      userId,
      action: 'coordinator.updated',
      resource: 'CoreUser',
      resourceId: id,
      before,
      after: { name: updated.name, email: updated.email, phone: updated.phone },
    },
  })

  return updated
}

// ── CRUD: Deactivate ────────────────────────────────────────────────────────

export async function deactivateCoordinator(
  id: string,
  userId: string
): Promise<{ success: true }> {
  const coordinator = await prisma.coreUser.findFirst({
    where: { id, role: 'SUPPORT_COORDINATOR', deletedAt: null },
  })
  if (!coordinator) throw new Error('Coordinator not found')

  await prisma.coreUser.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  await prisma.crmCoordinatorAssignment.updateMany({
    where: { coordinatorId: id, isActive: true },
    data: { isActive: false, deactivatedAt: new Date() },
  })

  await prisma.coreAuditLog.create({
    data: {
      userId,
      action: 'coordinator.deactivated',
      resource: 'CoreUser',
      resourceId: id,
      after: { deletedAt: new Date().toISOString() },
    },
  })

  return { success: true }
}
