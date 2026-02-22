/**
 * S33 Funding Periods — Schema Stub (WS3)
 *
 * REQ-035: S33 plans have non-standard funding periods — schema must support
 * split periods within a plan year.
 *
 * DEC-003 OPEN: Full S33-specific business logic is deferred until Nicole
 * confirms whether all plans or only S33 plans are affected, and what PACE
 * shows. This module provides only basic CRUD stubs.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { z } from 'zod'

// ── Validation schemas ─────────────────────────────────────────────────────

export const createFundingPeriodSchema = z.object({
  planId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  label: z.string().min(1).max(255).optional(),
  isActive: z.boolean().default(true),
}).refine((data) => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
})

export const addPeriodBudgetSchema = z.object({
  fundingPeriodId: z.string().cuid(),
  budgetLineId: z.string().cuid(),
  allocatedCents: z.number().int().min(0),
})

export const updatePeriodBudgetSchema = z.object({
  allocatedCents: z.number().int().min(0),
})

export type CreateFundingPeriodInput = z.infer<typeof createFundingPeriodSchema>

// ── List ───────────────────────────────────────────────────────────────────

/** List all funding periods for a plan, ordered by start date. */
export async function listFundingPeriods(planId: string) {
  return prisma.planFundingPeriod.findMany({
    where: { planId },
    include: {
      periodBudgets: {
        include: {
          budgetLine: {
            select: { id: true, categoryCode: true, categoryName: true, allocatedCents: true },
          },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  })
}

// ── Create ─────────────────────────────────────────────────────────────────

/** Create a funding period. Validates that:
 *  1. The period falls within the plan's startDate/endDate.
 *  2. It does not overlap with an existing period for the same plan.
 */
export async function createFundingPeriod(
  input: CreateFundingPeriodInput,
  userId: string,
) {
  const plan = await prisma.planPlan.findUnique({
    where: { id: input.planId },
    select: { id: true, startDate: true, endDate: true },
  })
  if (!plan) {
    throw new Error('Plan not found')
  }

  // Period must be within the plan's date range
  if (input.startDate < plan.startDate || input.endDate > plan.endDate) {
    throw new Error('Funding period dates must fall within the plan date range')
  }

  // No overlapping periods for the same plan
  const overlapping = await prisma.planFundingPeriod.findFirst({
    where: {
      planId: input.planId,
      AND: [
        { startDate: { lt: input.endDate } },
        { endDate: { gt: input.startDate } },
      ],
    },
  })
  if (overlapping) {
    throw new Error('Funding period overlaps with an existing period for this plan')
  }

  const period = await prisma.planFundingPeriod.create({
    data: {
      planId: input.planId,
      startDate: input.startDate,
      endDate: input.endDate,
      label: input.label,
      isActive: input.isActive,
    },
  })

  await createAuditLog({
    userId,
    action: 'funding_period.created',
    resource: 'plan_funding_period',
    resourceId: period.id,
    after: { planId: period.planId, startDate: period.startDate, endDate: period.endDate },
  })

  return period
}

// ── Delete ─────────────────────────────────────────────────────────────────

/** Delete a funding period. Cascade deletes all period budgets. */
export async function deleteFundingPeriod(id: string, userId: string): Promise<void> {
  const period = await prisma.planFundingPeriod.findUnique({
    where: { id },
    select: { id: true, planId: true },
  })
  if (!period) {
    throw new Error('Funding period not found')
  }

  // Cascade is defined in the schema (onDelete: Cascade on PlanPeriodBudget).
  // Deleting the period automatically removes its budgets.
  await prisma.planFundingPeriod.delete({ where: { id } })

  await createAuditLog({
    userId,
    action: 'funding_period.deleted',
    resource: 'plan_funding_period',
    resourceId: id,
    before: { planId: period.planId },
  })
}

// ── Period Budgets ─────────────────────────────────────────────────────────

/** Add a budget allocation to a funding period.
 *  Validates that the allocated amount does not exceed the budget line total.
 */
export async function addPeriodBudget(
  fundingPeriodId: string,
  budgetLineId: string,
  allocatedCents: number,
  userId: string,
) {
  // Validate budget line exists and check allocation is within line total
  const budgetLine = await prisma.planBudgetLine.findUnique({
    where: { id: budgetLineId },
    select: { id: true, allocatedCents: true },
  })
  if (!budgetLine) {
    throw new Error('Budget line not found')
  }
  if (allocatedCents > budgetLine.allocatedCents) {
    throw new Error('Period budget allocation cannot exceed the budget line total')
  }

  const periodBudget = await prisma.planPeriodBudget.create({
    data: { fundingPeriodId, budgetLineId, allocatedCents },
  })

  await createAuditLog({
    userId,
    action: 'period_budget.created',
    resource: 'plan_period_budget',
    resourceId: periodBudget.id,
    after: { fundingPeriodId, budgetLineId, allocatedCents },
  })

  return periodBudget
}

/** Update the allocation amount of an existing period budget. */
export async function updatePeriodBudget(
  id: string,
  allocatedCents: number,
  userId: string,
) {
  // Verify record exists
  const existing = await prisma.planPeriodBudget.findUnique({
    where: { id },
    include: { budgetLine: { select: { allocatedCents: true } } },
  })
  if (!existing) {
    throw new Error('Period budget not found')
  }
  if (allocatedCents > existing.budgetLine.allocatedCents) {
    throw new Error('Period budget allocation cannot exceed the budget line total')
  }

  const updated = await prisma.planPeriodBudget.update({
    where: { id },
    data: { allocatedCents },
  })

  await createAuditLog({
    userId,
    action: 'period_budget.updated',
    resource: 'plan_period_budget',
    resourceId: id,
    before: { allocatedCents: existing.allocatedCents },
    after: { allocatedCents },
  })

  return updated
}
