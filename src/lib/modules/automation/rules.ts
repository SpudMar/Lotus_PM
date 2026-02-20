import { prisma } from '@/lib/db'
import type { CreateRuleInput, UpdateRuleInput } from './validation'

/** List all automation rules (excluding soft-deleted) */
export async function listRules() {
  return prisma.autoRule.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      triggerType: true,
      triggerEvent: true,
      cronExpression: true,
      conditions: true,
      actions: true,
      lastTriggeredAt: true,
      executionCount: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

/** Get a single rule by ID */
export async function getRuleById(id: string) {
  return prisma.autoRule.findFirst({
    where: { id, deletedAt: null },
    include: {
      executions: {
        orderBy: { executedAt: 'desc' },
        take: 10,
      },
    },
  })
}

/** Create a new automation rule */
export async function createRule(input: CreateRuleInput): Promise<{ id: string; name: string }> {
  const rule = await prisma.autoRule.create({
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? true,
      triggerType: input.triggerType,
      triggerEvent: input.triggerType === 'EVENT' ? input.triggerEvent : null,
      cronExpression: input.triggerType === 'SCHEDULE' ? input.cronExpression : null,
      conditions: input.conditions,
      actions: input.actions,
    },
    select: { id: true, name: true },
  })
  return rule
}

/** Update an existing rule */
export async function updateRule(id: string, input: UpdateRuleInput): Promise<{ id: string; name: string } | null> {
  const existing = await prisma.autoRule.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return null

  const rule = await prisma.autoRule.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.triggerType !== undefined && { triggerType: input.triggerType }),
      ...(input.triggerEvent !== undefined && { triggerEvent: input.triggerEvent }),
      ...(input.cronExpression !== undefined && { cronExpression: input.cronExpression }),
      ...(input.conditions !== undefined && { conditions: input.conditions }),
      ...(input.actions !== undefined && { actions: input.actions }),
    },
    select: { id: true, name: true },
  })
  return rule
}

/** Soft-delete a rule */
export async function deleteRule(id: string): Promise<boolean> {
  const existing = await prisma.autoRule.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return false

  await prisma.autoRule.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
  return true
}

/** Find active rules that match a given event type */
export async function findRulesForEvent(eventType: string) {
  return prisma.autoRule.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      triggerType: 'EVENT',
      triggerEvent: eventType,
    },
  })
}

/** Find all active scheduled rules */
export async function findScheduledRules() {
  return prisma.autoRule.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      triggerType: 'SCHEDULE',
    },
  })
}
