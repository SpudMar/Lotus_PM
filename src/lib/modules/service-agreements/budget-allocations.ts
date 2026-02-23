/**
 * SA Budget Allocation service - WS-F6.
 *
 * Internal tracking of budget committed from plan lines to service agreements.
 * Under PACE, service bookings are deprecated - these allocations are PM-internal only.
 *
 * Design rules:
 *   - One budget line can be split across multiple SAs (partial allocations)
 *   - One SA can draw from multiple budget lines
 *   - Total committed across all SAs for a line must not exceed (allocatedCents - spentCents)
 *   - Allocations are soft reserves - separate from spentCents
 *
 * All mutations are audit-logged (REQ-017).
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { SaBudgetAllocation } from '@prisma/client'

export type { SaBudgetAllocation }

// -- getAvailableCents -------------------------------------------------------

/**
 * Get available (uncommitted) cents for a budget line.
 * = allocatedCents - spentCents - sum(all SA allocations except excludeServiceAgreementId)
 *
 * @param excludeServiceAgreementId - exclude this SA own allocation (for update validation)
 */
export async function getAvailableCents(
  budgetLineId: string,
  excludeServiceAgreementId?: string
): Promise<number> {
  const budgetLine = await prisma.planBudgetLine.findUnique({
    where: { id: budgetLineId },
    select: { allocatedCents: true, spentCents: true },
  })

  if (!budgetLine) {
    throw new Error('NOT_FOUND')
  }

  const committed = await prisma.saBudgetAllocation.aggregate({
    where: {
      budgetLineId,
      ...(excludeServiceAgreementId
        ? { serviceAgreementId: { not: excludeServiceAgreementId } }
        : {}),
    },
    _sum: { allocatedCents: true },
  })

  const totalCommitted = committed._sum.allocatedCents ?? 0
  return budgetLine.allocatedCents - budgetLine.spentCents - totalCommitted
}

// -- allocateBudget ---------------------------------------------------------

/**
 * Create or update (upsert) a budget allocation for a service agreement.
 * Validates that the new total committed across all SAs does not exceed available.
 *
 * Throws Error('ALLOCATION_EXCEEDS_AVAILABLE') if over budget.
 * Throws Error('NOT_FOUND') if budgetLine or serviceAgreement does not exist.
 */
export async function allocateBudget(
  input: {
    serviceAgreementId: string
    budgetLineId: string
    allocatedCents: number
    note?: string
  },
  userId: string
): Promise<SaBudgetAllocation> {
  // Verify service agreement exists
  const sa = await prisma.saServiceAgreement.findFirst({
    where: { id: input.serviceAgreementId, deletedAt: null },
    select: { id: true },
  })
  if (!sa) {
    throw new Error('NOT_FOUND')
  }

  // Check available (excluding any existing allocation for this SA)
  const available = await getAvailableCents(input.budgetLineId, input.serviceAgreementId)

  if (input.allocatedCents > available) {
    throw new Error('ALLOCATION_EXCEEDS_AVAILABLE')
  }

  const allocation = await prisma.saBudgetAllocation.upsert({
    where: {
      serviceAgreementId_budgetLineId: {
        serviceAgreementId: input.serviceAgreementId,
        budgetLineId: input.budgetLineId,
      },
    },
    create: {
      serviceAgreementId: input.serviceAgreementId,
      budgetLineId: input.budgetLineId,
      allocatedCents: input.allocatedCents,
      note: input.note ?? null,
      createdById: userId,
    },
    update: {
      allocatedCents: input.allocatedCents,
      note: input.note ?? null,
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.budget-allocation.upserted',
    resource: 'sa-budget-allocation',
    resourceId: allocation.id,
    after: {
      serviceAgreementId: input.serviceAgreementId,
      budgetLineId: input.budgetLineId,
      allocatedCents: input.allocatedCents,
    },
  })

  return allocation
}

// -- getAllocations ----------------------------------------------------------

/**
 * Get all budget allocations for a service agreement, including budget line details.
 */
export async function getAllocations(
  serviceAgreementId: string
): Promise<(SaBudgetAllocation & {
  budgetLine: { id: string; categoryCode: string; categoryName: string; allocatedCents: number; spentCents: number }
  createdBy: { id: string; name: string }
})[]> {
  return prisma.saBudgetAllocation.findMany({
    where: { serviceAgreementId },
    include: {
      budgetLine: {
        select: {
          id: true,
          categoryCode: true,
          categoryName: true,
          allocatedCents: true,
          spentCents: true,
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

// -- getBudgetLineCommitment ------------------------------------------------

/**
 * Get the total amount committed to SAs for a specific budget line,
 * along with all individual allocations.
 */
export async function getBudgetLineCommitment(budgetLineId: string): Promise<{
  totalCommittedCents: number
  allocations: (SaBudgetAllocation & {
    serviceAgreement: { id: string; agreementRef: string }
  })[]
}> {
  const allocations = await prisma.saBudgetAllocation.findMany({
    where: { budgetLineId },
    include: {
      serviceAgreement: {
        select: { id: true, agreementRef: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const totalCommittedCents = allocations.reduce(
    (sum, a) => sum + a.allocatedCents,
    0
  )

  return { totalCommittedCents, allocations }
}

// -- removeAllocation -------------------------------------------------------

/**
 * Remove a budget allocation by ID.
 * Throws Error('NOT_FOUND') if allocation does not exist.
 */
export async function removeAllocation(id: string, userId: string): Promise<void> {
  const existing = await prisma.saBudgetAllocation.findUnique({
    where: { id },
    select: { id: true, serviceAgreementId: true, budgetLineId: true, allocatedCents: true },
  })

  if (!existing) {
    throw new Error('NOT_FOUND')
  }

  await prisma.saBudgetAllocation.delete({ where: { id } })

  await createAuditLog({
    userId,
    action: 'service-agreement.budget-allocation.removed',
    resource: 'sa-budget-allocation',
    resourceId: id,
    before: {
      serviceAgreementId: existing.serviceAgreementId,
      budgetLineId: existing.budgetLineId,
      allocatedCents: existing.allocatedCents,
    },
  })
}
