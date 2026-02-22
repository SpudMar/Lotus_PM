/**
 * Fund Quarantine module — business logic.
 * WS2: Earmarks money from a budget category for a specific provider.
 *
 * Amount can be set manually or auto-derived from service agreement rate lines.
 * All mutations are audit-logged (REQ-017).
 * Events emitted via processEvent() (automation engine).
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import type { CreateQuarantineInput, UpdateQuarantineInput, ListQuarantinesInput } from './validation'

// ── List ───────────────────────────────────────────────────────────────────

/**
 * List quarantines with optional filters.
 * Includes provider name, SA reference, and budget line name for display.
 */
export async function listQuarantines(filters: ListQuarantinesInput = {}) {
  const where = {
    ...(filters.budgetLineId ? { budgetLineId: filters.budgetLineId } : {}),
    ...(filters.providerId ? { providerId: filters.providerId } : {}),
    ...(filters.serviceAgreementId ? { serviceAgreementId: filters.serviceAgreementId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  }

  return prisma.fqQuarantine.findMany({
    where,
    include: {
      provider: { select: { id: true, name: true } },
      serviceAgreement: { select: { id: true, agreementRef: true } },
      budgetLine: { select: { id: true, categoryCode: true, categoryName: true, allocatedCents: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Get ────────────────────────────────────────────────────────────────────

/** Get a single quarantine or throw NOT_FOUND. */
export async function getQuarantine(id: string) {
  const quarantine = await prisma.fqQuarantine.findUnique({
    where: { id },
    include: {
      provider: { select: { id: true, name: true, abn: true } },
      serviceAgreement: { select: { id: true, agreementRef: true, participantId: true } },
      budgetLine: { select: { id: true, categoryCode: true, categoryName: true, allocatedCents: true, planId: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  if (!quarantine) {
    throw new Error('NOT_FOUND')
  }

  return quarantine
}

// ── Capacity check helper ─────────────────────────────────────────────────

/**
 * Validate that there is enough remaining capacity on a budget line
 * to accommodate the requested quarantine amount.
 *
 * Capacity = allocatedCents - spentCents (from invoice lines) - existing active quarantine total
 */
async function assertBudgetCapacity(
  budgetLineId: string,
  quarantinedCents: number,
  excludeQuarantineId?: string,
): Promise<void> {
  const budgetLine = await prisma.planBudgetLine.findUnique({
    where: { id: budgetLineId },
    select: { allocatedCents: true, spentCents: true },
  })

  if (!budgetLine) {
    throw new Error('BUDGET_LINE_NOT_FOUND')
  }

  // Sum all active quarantines on this budget line (excluding self on update)
  const activeQuarantines = await prisma.fqQuarantine.aggregate({
    where: {
      budgetLineId,
      status: 'ACTIVE',
      ...(excludeQuarantineId ? { id: { not: excludeQuarantineId } } : {}),
    },
    _sum: { quarantinedCents: true },
  })

  const existingQuarantineTotal = activeQuarantines._sum.quarantinedCents ?? 0
  const available = budgetLine.allocatedCents - budgetLine.spentCents - existingQuarantineTotal

  if (available < quarantinedCents) {
    throw new Error('INSUFFICIENT_BUDGET_CAPACITY')
  }
}

// ── Create ─────────────────────────────────────────────────────────────────

/** Create a new fund quarantine after validating budget capacity. */
export async function createQuarantine(data: CreateQuarantineInput, createdById: string) {
  await assertBudgetCapacity(data.budgetLineId, data.quarantinedCents)

  const quarantine = await prisma.fqQuarantine.create({
    data: {
      serviceAgreementId: data.serviceAgreementId,
      budgetLineId: data.budgetLineId,
      providerId: data.providerId,
      supportItemCode: data.supportItemCode,
      quarantinedCents: data.quarantinedCents,
      fundingPeriodId: data.fundingPeriodId,
      notes: data.notes,
      createdById,
    },
  })

  await createAuditLog({
    userId: createdById,
    action: 'fund-quarantine.created',
    resource: 'fund-quarantine',
    resourceId: quarantine.id,
    after: {
      budgetLineId: quarantine.budgetLineId,
      providerId: quarantine.providerId,
      quarantinedCents: quarantine.quarantinedCents,
      serviceAgreementId: quarantine.serviceAgreementId,
    },
  })

  void processEvent('lotus-pm.fund-quarantine.created', {
    quarantineId: quarantine.id,
    budgetLineId: quarantine.budgetLineId,
    providerId: quarantine.providerId,
    quarantinedCents: quarantine.quarantinedCents,
    serviceAgreementId: quarantine.serviceAgreementId ?? undefined,
  }).catch(() => {
    // Automation failures must not block core operations
  })

  return quarantine
}

// ── Update ─────────────────────────────────────────────────────────────────

/**
 * Update notes, supportItemCode, or quarantinedCents.
 * If quarantinedCents changes, re-validates budget capacity.
 */
export async function updateQuarantine(id: string, data: UpdateQuarantineInput, userId: string) {
  const current = await prisma.fqQuarantine.findUnique({
    where: { id },
    select: { budgetLineId: true, quarantinedCents: true, status: true },
  })

  if (!current) {
    throw new Error('NOT_FOUND')
  }

  if (current.status !== 'ACTIVE') {
    throw new Error('QUARANTINE_NOT_ACTIVE')
  }

  if (data.quarantinedCents !== undefined && data.quarantinedCents !== current.quarantinedCents) {
    await assertBudgetCapacity(current.budgetLineId, data.quarantinedCents, id)
  }

  const updated = await prisma.fqQuarantine.update({
    where: { id },
    data: {
      ...(data.supportItemCode !== undefined ? { supportItemCode: data.supportItemCode } : {}),
      ...(data.quarantinedCents !== undefined ? { quarantinedCents: data.quarantinedCents } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  })

  await createAuditLog({
    userId,
    action: 'fund-quarantine.updated',
    resource: 'fund-quarantine',
    resourceId: id,
    before: { quarantinedCents: current.quarantinedCents },
    after: { quarantinedCents: updated.quarantinedCents },
  })

  return updated
}

// ── Release ────────────────────────────────────────────────────────────────

/** Release a quarantine — sets status to RELEASED and frees the earmarked amount. */
export async function releaseQuarantine(id: string, userId: string) {
  const current = await prisma.fqQuarantine.findUnique({
    where: { id },
    select: { status: true, budgetLineId: true, providerId: true },
  })

  if (!current) {
    throw new Error('NOT_FOUND')
  }

  if (current.status !== 'ACTIVE') {
    throw new Error('QUARANTINE_NOT_ACTIVE')
  }

  const released = await prisma.fqQuarantine.update({
    where: { id },
    data: { status: 'RELEASED' },
  })

  await createAuditLog({
    userId,
    action: 'fund-quarantine.released',
    resource: 'fund-quarantine',
    resourceId: id,
    after: { status: 'RELEASED' },
  })

  void processEvent('lotus-pm.fund-quarantine.released', {
    quarantineId: id,
    budgetLineId: current.budgetLineId,
    providerId: current.providerId,
  }).catch(() => {
    // Automation failures must not block core operations
  })

  return released
}

// ── Draw Down ──────────────────────────────────────────────────────────────

/**
 * Increment usedCents on a quarantine (called when an invoice is approved).
 * Rejects if the draw-down would exceed quarantinedCents.
 */
export async function drawDown(quarantineId: string, amountCents: number, userId: string) {
  const quarantine = await prisma.fqQuarantine.findUnique({
    where: { id: quarantineId },
    select: { quarantinedCents: true, usedCents: true, status: true, budgetLineId: true, providerId: true },
  })

  if (!quarantine) {
    throw new Error('NOT_FOUND')
  }

  if (quarantine.status !== 'ACTIVE') {
    throw new Error('QUARANTINE_NOT_ACTIVE')
  }

  const newUsed = quarantine.usedCents + amountCents

  if (newUsed > quarantine.quarantinedCents) {
    throw new Error('DRAW_DOWN_EXCEEDS_QUARANTINE')
  }

  const updated = await prisma.fqQuarantine.update({
    where: { id: quarantineId },
    data: { usedCents: newUsed },
  })

  await createAuditLog({
    userId,
    action: 'fund-quarantine.draw-down',
    resource: 'fund-quarantine',
    resourceId: quarantineId,
    before: { usedCents: quarantine.usedCents },
    after: { usedCents: newUsed },
  })

  // Emit threshold event if usage reaches 80% or more
  const usedPercent = Math.round((newUsed / quarantine.quarantinedCents) * 100)
  if (usedPercent >= 80) {
    void processEvent('lotus-pm.fund-quarantine.threshold-reached', {
      quarantineId,
      budgetLineId: quarantine.budgetLineId,
      providerId: quarantine.providerId,
      usedPercent,
    }).catch(() => {
      // Automation failures must not block core operations
    })
  }

  return updated
}

// ── Auto-create from Service Agreement ────────────────────────────────────

/**
 * Reads SA rate lines and creates one FqQuarantine per rate line.
 * Matches rate line categoryCode to a PlanBudgetLine in the given plan.
 * Amount = maxQuantity * agreedRateCents (if maxQuantity set), else agreedRateCents as placeholder.
 *
 * Returns the array of created quarantines (skips lines where no matching budget line exists).
 */
export async function autoCreateFromServiceAgreement(
  serviceAgreementId: string,
  planId: string,
  userId: string,
) {
  const sa = await prisma.saServiceAgreement.findUnique({
    where: { id: serviceAgreementId },
    include: { rateLines: true },
  })

  if (!sa) {
    throw new Error('SERVICE_AGREEMENT_NOT_FOUND')
  }

  const created: Awaited<ReturnType<typeof prisma.fqQuarantine.create>>[] = []

  for (const rateLine of sa.rateLines) {
    // Find matching budget line by categoryCode in the given plan
    const budgetLine = await prisma.planBudgetLine.findUnique({
      where: { planId_categoryCode: { planId, categoryCode: rateLine.categoryCode } },
      select: { id: true, allocatedCents: true, spentCents: true },
    })

    if (!budgetLine) {
      // No matching budget line for this category — skip
      continue
    }

    // Calculate amount: maxQuantity * agreedRateCents, or agreedRateCents as placeholder
    const maxQty = rateLine.maxQuantity ? Number(rateLine.maxQuantity) : 1
    const quarantinedCents = Math.round(maxQty * rateLine.agreedRateCents)

    // Check capacity; if insufficient, skip rather than fail the whole batch
    const activeQuarantines = await prisma.fqQuarantine.aggregate({
      where: { budgetLineId: budgetLine.id, status: 'ACTIVE' },
      _sum: { quarantinedCents: true },
    })
    const existingTotal = activeQuarantines._sum.quarantinedCents ?? 0
    const available = budgetLine.allocatedCents - budgetLine.spentCents - existingTotal

    if (available < quarantinedCents) {
      continue
    }

    const quarantine = await prisma.fqQuarantine.create({
      data: {
        serviceAgreementId,
        budgetLineId: budgetLine.id,
        providerId: sa.providerId,
        supportItemCode: rateLine.supportItemCode === null ? undefined : rateLine.supportItemCode,
        quarantinedCents,
        createdById: userId,
      },
    })

    await createAuditLog({
      userId,
      action: 'fund-quarantine.auto-created',
      resource: 'fund-quarantine',
      resourceId: quarantine.id,
      after: {
        serviceAgreementId,
        budgetLineId: budgetLine.id,
        providerId: sa.providerId,
        quarantinedCents,
        source: 'auto-create-from-sa',
      },
    })

    void processEvent('lotus-pm.fund-quarantine.created', {
      quarantineId: quarantine.id,
      budgetLineId: quarantine.budgetLineId,
      providerId: quarantine.providerId,
      quarantinedCents: quarantine.quarantinedCents,
      serviceAgreementId,
    }).catch(() => {
      // Automation failures must not block core operations
    })

    created.push(quarantine)
  }

  return created
}
