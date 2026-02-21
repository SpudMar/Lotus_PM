import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { z } from 'zod'
import type { createProviderSchema, updateProviderSchema } from './validation'

type CreateInput = z.infer<typeof createProviderSchema>
type UpdateInput = z.infer<typeof updateProviderSchema>

export async function listProviders(params: {
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
            { name: { contains: search, mode: 'insensitive' as const } },
            { abn: { contains: search } },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.crmProvider.findMany({
      where,
      include: { _count: { select: { invoices: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmProvider.count({ where }),
  ])

  return { data, total }
}

export async function getProvider(id: string) {
  return prisma.crmProvider.findFirst({
    where: { id, deletedAt: null },
    include: {
      invoices: {
        orderBy: { receivedAt: 'desc' },
        take: 10,
        include: {
          participant: { select: { firstName: true, lastName: true } },
        },
      },
      commLogs: { orderBy: { occurredAt: 'desc' }, take: 20 },
    },
  })
}

export async function createProvider(input: CreateInput, userId: string) {
  const provider = await prisma.crmProvider.create({
    data: {
      ...input,
      email: input.email || undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'provider.created',
    resource: 'provider',
    resourceId: provider.id,
    after: { name: provider.name, abn: provider.abn },
  })

  return provider
}

export async function updateProvider(id: string, input: UpdateInput, userId: string) {
  const provider = await prisma.crmProvider.update({
    where: { id },
    data: {
      ...input,
      email: input.email || undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'provider.updated',
    resource: 'provider',
    resourceId: id,
    after: { name: provider.name },
  })

  return provider
}
