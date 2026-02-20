import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { z } from 'zod'
import type { createParticipantSchema, updateParticipantSchema } from './validation'

type CreateInput = z.infer<typeof createParticipantSchema>
type UpdateInput = z.infer<typeof updateParticipantSchema>

export async function listParticipants(params: {
  page: number
  pageSize: number
  search?: string
}) {
  const { page, pageSize, search } = params
  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { ndisNumber: { contains: search } },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.crmParticipant.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { plans: true, invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmParticipant.count({ where }),
  ])

  return { data, total }
}

export async function getParticipant(id: string) {
  return prisma.crmParticipant.findFirst({
    where: { id, deletedAt: null },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      plans: { orderBy: { startDate: 'desc' } },
      invoices: { orderBy: { receivedAt: 'desc' }, take: 10 },
      commLogs: { orderBy: { occurredAt: 'desc' }, take: 20 },
    },
  })
}

export async function createParticipant(input: CreateInput, userId: string) {
  const participant = await prisma.crmParticipant.create({
    data: {
      ...input,
      email: input.email || undefined,
      dateOfBirth: new Date(input.dateOfBirth),
    },
  })

  await createAuditLog({
    userId,
    action: 'participant.created',
    resource: 'participant',
    resourceId: participant.id,
    after: { ndisNumber: participant.ndisNumber },
  })

  return participant
}

export async function updateParticipant(id: string, input: UpdateInput, userId: string) {
  const before = await prisma.crmParticipant.findUnique({ where: { id } })

  const participant = await prisma.crmParticipant.update({
    where: { id },
    data: {
      ...input,
      email: input.email || undefined,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'participant.updated',
    resource: 'participant',
    resourceId: id,
    before: { ndisNumber: before?.ndisNumber },
    after: { ndisNumber: participant.ndisNumber },
  })

  return participant
}

export async function softDeleteParticipant(id: string, userId: string) {
  await prisma.crmParticipant.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  })

  await createAuditLog({
    userId,
    action: 'participant.deleted',
    resource: 'participant',
    resourceId: id,
  })
}
