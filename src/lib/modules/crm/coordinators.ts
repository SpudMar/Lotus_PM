import { prisma } from '@/lib/db'
import { processEvent } from '@/lib/modules/automation/engine'
import type { AssignCoordinatorInput } from './coordinators.validation'

export async function listCoordinators() {
  return prisma.coreUser.findMany({
    where: { role: 'SUPPORT_COORDINATOR', deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
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
