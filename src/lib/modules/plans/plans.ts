import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { z } from 'zod'
import type { createPlanSchema, updatePlanSchema } from './validation'

type CreateInput = z.infer<typeof createPlanSchema>
type UpdateInput = z.infer<typeof updatePlanSchema>

export async function listPlans(params: {
  page: number
  pageSize: number
  participantId?: string
  status?: string
}) {
  const { page, pageSize, participantId, status } = params
  const where = {
    ...(participantId ? { participantId } : {}),
    ...(status ? { status: status as 'ACTIVE' | 'EXPIRED' } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.planPlan.findMany({
      where,
      include: {
        participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
        budgetLines: true,
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.planPlan.count({ where }),
  ])

  return { data, total }
}

export async function getPlan(id: string) {
  return prisma.planPlan.findUnique({
    where: { id },
    include: {
      participant: true,
      budgetLines: { orderBy: { categoryCode: 'asc' } },
      invoices: {
        include: { provider: { select: { id: true, name: true } } },
        orderBy: { receivedAt: 'desc' },
        take: 20,
      },
    },
  })
}

export async function createPlan(input: CreateInput, userId: string) {
  const plan = await prisma.planPlan.create({
    data: {
      participantId: input.participantId,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      reviewDate: input.reviewDate ? new Date(input.reviewDate) : undefined,
      prodaPlanId: input.prodaPlanId,
      budgetLines: {
        create: input.budgetLines.map((line) => ({
          categoryCode: line.categoryCode,
          categoryName: line.categoryName,
          allocatedCents: line.allocatedCents,
        })),
      },
    },
    include: { budgetLines: true },
  })

  await createAuditLog({
    userId,
    action: 'plan.created',
    resource: 'plan',
    resourceId: plan.id,
    after: { participantId: plan.participantId, startDate: plan.startDate, endDate: plan.endDate },
  })

  return plan
}

export async function updatePlan(id: string, input: UpdateInput, userId: string) {
  const plan = await prisma.planPlan.update({
    where: { id },
    data: {
      ...input,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      reviewDate: input.reviewDate ? new Date(input.reviewDate) : undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'plan.updated',
    resource: 'plan',
    resourceId: id,
    after: { status: plan.status },
  })

  return plan
}

/** Get budget summary with spending percentages */
export async function getPlanBudgetSummary(planId: string) {
  const lines = await prisma.planBudgetLine.findMany({
    where: { planId },
    orderBy: { categoryCode: 'asc' },
  })

  return lines.map((line) => ({
    ...line,
    availableCents: line.allocatedCents - line.spentCents - line.reservedCents,
    usedPercent: line.allocatedCents > 0
      ? Math.round(((line.spentCents + line.reservedCents) / line.allocatedCents) * 100)
      : 0,
  }))
}
