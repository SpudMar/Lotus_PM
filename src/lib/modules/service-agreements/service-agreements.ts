/**
 * Service Agreements module — business logic.
 * WS1: CRUD + activate/terminate lifecycle + rate line management.
 *
 * agreementRef format: SA-YYYYMMDD-XXXX
 * Events emitted via processEvent() (automation engine).
 * All mutations are audit-logged (REQ-017).
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import type {
  CreateServiceAgreementInput,
  UpdateServiceAgreementInput,
  ListServiceAgreementsInput,
  CreateRateLineInput,
  UpdateRateLineInput,
} from './validation'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate a unique agreement reference in SA-YYYYMMDD-XXXX format. */
function generateAgreementRef(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const random = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `SA-${dateStr}-${random}`
}

/** Generate a ref and retry if a collision occurs (max 5 attempts). */
async function generateUniqueRef(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = generateAgreementRef()
    const existing = await prisma.saServiceAgreement.findUnique({
      where: { agreementRef: ref },
      select: { id: true },
    })
    if (!existing) return ref
  }
  throw new Error('Failed to generate a unique agreement reference — please retry')
}

// ── List ───────────────────────────────────────────────────────────────────

/** List service agreements, excluding soft-deleted records. */
export async function listServiceAgreements(filters: ListServiceAgreementsInput = {}) {
  const where = {
    deletedAt: null,
    ...(filters.participantId ? { participantId: filters.participantId } : {}),
    ...(filters.providerId ? { providerId: filters.providerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  }

  return prisma.saServiceAgreement.findMany({
    where,
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true } },
      managedBy: { select: { id: true, name: true } },
      rateLines: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Get ────────────────────────────────────────────────────────────────────

/** Get a single service agreement with rate lines. Throws if not found or deleted. */
export async function getServiceAgreement(id: string) {
  const agreement = await prisma.saServiceAgreement.findFirst({
    where: { id, deletedAt: null },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true } },
      managedBy: { select: { id: true, name: true } },
      rateLines: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!agreement) {
    throw new Error('Service agreement not found')
  }

  return agreement
}

// ── Create ─────────────────────────────────────────────────────────────────

/** Create a new service agreement in DRAFT status. */
export async function createServiceAgreement(
  data: CreateServiceAgreementInput,
  userId: string
) {
  const agreementRef = await generateUniqueRef()

  const agreement = await prisma.saServiceAgreement.create({
    data: {
      agreementRef,
      participantId: data.participantId,
      providerId: data.providerId,
      startDate: data.startDate,
      endDate: data.endDate,
      reviewDate: data.reviewDate ?? null,
      notes: data.notes ?? null,
      managedById: data.managedById,
      status: 'DRAFT',
    },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true } },
      managedBy: { select: { id: true, name: true } },
      rateLines: true,
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.created',
    resource: 'service-agreement',
    resourceId: agreement.id,
    after: { agreementRef, status: 'DRAFT', participantId: data.participantId, providerId: data.providerId },
  })

  void processEvent('lotus-pm.service-agreements.created', {
    agreementId: agreement.id,
    agreementRef,
    participantId: data.participantId,
    providerId: data.providerId,
    createdAt: agreement.createdAt.toISOString(),
  }).catch(() => {
    // Automation failures must not block core operations
  })

  return agreement
}

// ── Update ─────────────────────────────────────────────────────────────────

/** Update a service agreement's details. */
export async function updateServiceAgreement(
  id: string,
  data: UpdateServiceAgreementInput,
  userId: string
) {
  const existing = await getServiceAgreement(id)

  const updated = await prisma.saServiceAgreement.update({
    where: { id },
    data: {
      ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
      ...(data.reviewDate !== undefined ? { reviewDate: data.reviewDate } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.managedById !== undefined ? { managedById: data.managedById } : {}),
    },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true } },
      managedBy: { select: { id: true, name: true } },
      rateLines: { orderBy: { createdAt: 'asc' } },
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.updated',
    resource: 'service-agreement',
    resourceId: id,
    before: { status: existing.status },
    after: data,
  })

  return updated
}

// ── Delete (soft) ──────────────────────────────────────────────────────────

/** Soft-delete a service agreement. Rejects if the agreement is ACTIVE. */
export async function deleteServiceAgreement(id: string, userId: string) {
  const existing = await getServiceAgreement(id)

  if (existing.status === 'ACTIVE') {
    throw new Error('Cannot delete an ACTIVE service agreement — terminate it first')
  }

  await prisma.saServiceAgreement.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.deleted',
    resource: 'service-agreement',
    resourceId: id,
    before: { status: existing.status },
    after: { deletedAt: new Date().toISOString() },
  })
}

// ── Activate ───────────────────────────────────────────────────────────────

/** Transition a service agreement from DRAFT → ACTIVE. */
export async function activateServiceAgreement(id: string, userId: string) {
  const existing = await getServiceAgreement(id)

  if (existing.status !== 'DRAFT') {
    throw new Error(`Cannot activate a service agreement with status ${existing.status} — only DRAFT agreements can be activated`)
  }

  const updated = await prisma.saServiceAgreement.update({
    where: { id },
    data: { status: 'ACTIVE' },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true } },
      managedBy: { select: { id: true, name: true } },
      rateLines: { orderBy: { createdAt: 'asc' } },
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.activated',
    resource: 'service-agreement',
    resourceId: id,
    before: { status: 'DRAFT' },
    after: { status: 'ACTIVE' },
  })

  void processEvent('lotus-pm.service-agreements.activated', {
    agreementId: id,
    agreementRef: existing.agreementRef,
    participantId: existing.participantId,
    providerId: existing.providerId,
    activatedAt: new Date().toISOString(),
  }).catch(() => {})

  return updated
}

// ── Terminate ──────────────────────────────────────────────────────────────

/** Transition a service agreement from ACTIVE → TERMINATED. */
export async function terminateServiceAgreement(id: string, userId: string) {
  const existing = await getServiceAgreement(id)

  if (existing.status !== 'ACTIVE') {
    throw new Error(`Cannot terminate a service agreement with status ${existing.status} — only ACTIVE agreements can be terminated`)
  }

  const updated = await prisma.saServiceAgreement.update({
    where: { id },
    data: { status: 'TERMINATED' },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true } },
      managedBy: { select: { id: true, name: true } },
      rateLines: { orderBy: { createdAt: 'asc' } },
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.terminated',
    resource: 'service-agreement',
    resourceId: id,
    before: { status: 'ACTIVE' },
    after: { status: 'TERMINATED' },
  })

  void processEvent('lotus-pm.service-agreements.terminated', {
    agreementId: id,
    agreementRef: existing.agreementRef,
    participantId: existing.participantId,
    providerId: existing.providerId,
    terminatedAt: new Date().toISOString(),
  }).catch(() => {})

  return updated
}

// ── Rate Lines ─────────────────────────────────────────────────────────────

/** Add a rate line to a DRAFT service agreement. */
export async function addRateLine(
  agreementId: string,
  data: CreateRateLineInput,
  userId: string
) {
  const agreement = await getServiceAgreement(agreementId)

  if (agreement.status !== 'DRAFT') {
    throw new Error('Rate lines can only be added to DRAFT service agreements')
  }

  const rateLine = await prisma.saRateLine.create({
    data: {
      agreementId,
      categoryCode: data.categoryCode,
      categoryName: data.categoryName,
      supportItemCode: data.supportItemCode ?? null,
      supportItemName: data.supportItemName ?? null,
      agreedRateCents: data.agreedRateCents,
      maxQuantity: data.maxQuantity ?? null,
      unitType: data.unitType ?? null,
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.rate-line.added',
    resource: 'service-agreement',
    resourceId: agreementId,
    after: { rateLineId: rateLine.id, categoryCode: data.categoryCode, agreedRateCents: data.agreedRateCents },
  })

  return rateLine
}

/** Update a rate line. */
export async function updateRateLine(
  id: string,
  data: UpdateRateLineInput,
  userId: string
) {
  const rateLine = await prisma.saRateLine.findUnique({ where: { id } })
  if (!rateLine) {
    throw new Error('Rate line not found')
  }

  const updated = await prisma.saRateLine.update({
    where: { id },
    data: {
      ...(data.categoryCode !== undefined ? { categoryCode: data.categoryCode } : {}),
      ...(data.categoryName !== undefined ? { categoryName: data.categoryName } : {}),
      ...(data.supportItemCode !== undefined ? { supportItemCode: data.supportItemCode } : {}),
      ...(data.supportItemName !== undefined ? { supportItemName: data.supportItemName } : {}),
      ...(data.agreedRateCents !== undefined ? { agreedRateCents: data.agreedRateCents } : {}),
      ...(data.maxQuantity !== undefined ? { maxQuantity: data.maxQuantity } : {}),
      ...(data.unitType !== undefined ? { unitType: data.unitType } : {}),
    },
  })

  await createAuditLog({
    userId,
    action: 'service-agreement.rate-line.updated',
    resource: 'service-agreement',
    resourceId: rateLine.agreementId,
    after: { rateLineId: id, ...data },
  })

  return updated
}

/** Delete a rate line. */
export async function deleteRateLine(id: string, userId: string) {
  const rateLine = await prisma.saRateLine.findUnique({ where: { id } })
  if (!rateLine) {
    throw new Error('Rate line not found')
  }

  await prisma.saRateLine.delete({ where: { id } })

  await createAuditLog({
    userId,
    action: 'service-agreement.rate-line.deleted',
    resource: 'service-agreement',
    resourceId: rateLine.agreementId,
    before: { rateLineId: id },
  })
}
