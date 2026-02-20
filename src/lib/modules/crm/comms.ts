import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { z } from 'zod'
import type { createCommLogSchema } from './validation'

type CreateInput = z.infer<typeof createCommLogSchema>

export async function listCommLogs(params: {
  page: number
  pageSize: number
  participantId?: string
  providerId?: string
}) {
  const { page, pageSize, participantId, providerId } = params
  const where = {
    ...(participantId ? { participantId } : {}),
    ...(providerId ? { providerId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.crmCommLog.findMany({
      where,
      include: {
        participant: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmCommLog.count({ where }),
  ])

  return { data, total }
}

export async function createCommLog(input: CreateInput, userId: string) {
  const commLog = await prisma.crmCommLog.create({
    data: {
      ...input,
      userId,
      occurredAt: input.occurredAt ?? new Date(),
    },
  })

  await createAuditLog({
    userId,
    action: 'comm.created',
    resource: 'commLog',
    resourceId: commLog.id,
    after: { type: commLog.type, direction: commLog.direction },
  })

  return commLog
}
