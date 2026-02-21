import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import type { z } from 'zod'
import type { createInvoiceSchema, updateInvoiceSchema } from './validation'

type CreateInput = z.infer<typeof createInvoiceSchema>
type UpdateInput = z.infer<typeof updateInvoiceSchema>

type InvStatusValue = 'RECEIVED' | 'PROCESSING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLAIMED' | 'PAID'

export async function listInvoices(params: {
  page: number
  pageSize: number
  status?: string
  /** Multiple statuses — takes precedence over the single `status` field */
  statusIn?: string[]
  participantId?: string
  providerId?: string
  ingestSource?: string
  search?: string
}) {
  const { page, pageSize, status, statusIn, participantId, providerId, ingestSource, search } = params

  // statusIn (array) takes precedence over single status
  const statusFilter =
    statusIn && statusIn.length > 0
      ? { status: { in: statusIn as InvStatusValue[] } }
      : status
        ? { status: status as InvStatusValue }
        : {}

  const where = {
    deletedAt: null,
    ...statusFilter,
    ...(participantId ? { participantId } : {}),
    ...(providerId ? { providerId } : {}),
    ...(ingestSource ? { ingestSource: ingestSource as 'EMAIL' | 'MANUAL' | 'API' } : {}),
    ...(search ? {
      OR: [
        { invoiceNumber: { contains: search, mode: 'insensitive' as const } },
        { sourceEmail: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.invInvoice.findMany({
      where,
      include: {
        participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
        provider: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invInvoice.count({ where }),
  ])

  return { data, total }
}

export async function getInvoice(id: string) {
  return prisma.invInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      participant: true,
      provider: true,
      plan: { include: { budgetLines: true } },
      lines: { include: { budgetLine: true } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      claims: true,
    },
  })
}

export async function createInvoice(input: CreateInput, userId: string) {
  const invoice = await prisma.invInvoice.create({
    data: {
      participantId: input.participantId,
      providerId: input.providerId,
      planId: input.planId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: new Date(input.invoiceDate),
      subtotalCents: input.subtotalCents,
      gstCents: input.gstCents,
      totalCents: input.totalCents,
      lines: input.lines
        ? {
            create: input.lines.map((line) => ({
              supportItemCode: line.supportItemCode,
              supportItemName: line.supportItemName,
              categoryCode: line.categoryCode,
              serviceDate: new Date(line.serviceDate),
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              totalCents: line.totalCents,
              gstCents: line.gstCents,
              budgetLineId: line.budgetLineId,
            })),
          }
        : undefined,
    },
    include: { lines: true },
  })

  await createAuditLog({
    userId,
    action: 'invoice.created',
    resource: 'invoice',
    resourceId: invoice.id,
    after: { invoiceNumber: invoice.invoiceNumber, totalCents: invoice.totalCents },
  })

  return invoice
}

/**
 * Update a draft invoice (RECEIVED or PENDING_REVIEW only).
 * Replaces all invoice lines if provided.
 * When participantId/providerId change, updates linked CrmCorrespondence entries.
 */
export async function updateInvoice(id: string, input: UpdateInput, userId: string) {
  // Guard: only allow updates on drafts not yet approved/claimed
  const current = await prisma.invInvoice.findFirst({
    where: { id, deletedAt: null },
    select: { status: true, invoiceNumber: true, totalCents: true },
  })

  if (!current) {
    throw new Error('NOT_FOUND')
  }

  if (current.status !== 'RECEIVED' && current.status !== 'PENDING_REVIEW') {
    throw new Error('INVALID_STATUS')
  }

  // Replace lines if provided
  if (input.lines !== undefined) {
    await prisma.invInvoiceLine.deleteMany({ where: { invoiceId: id } })
    if (input.lines.length > 0) {
      await prisma.invInvoiceLine.createMany({
        data: input.lines.map((line) => ({
          invoiceId: id,
          supportItemCode: line.supportItemCode,
          supportItemName: line.supportItemName,
          categoryCode: line.categoryCode,
          serviceDate: new Date(line.serviceDate),
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
          gstCents: line.gstCents ?? 0,
          budgetLineId: line.budgetLineId ?? undefined,
        })),
      })
    }
  }

  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
      ...(input.invoiceDate !== undefined ? { invoiceDate: new Date(input.invoiceDate) } : {}),
      ...(input.subtotalCents !== undefined ? { subtotalCents: input.subtotalCents } : {}),
      ...(input.gstCents !== undefined ? { gstCents: input.gstCents } : {}),
      ...(input.totalCents !== undefined ? { totalCents: input.totalCents } : {}),
      ...(input.participantId !== undefined ? { participantId: input.participantId } : {}),
      ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
    },
    include: { lines: true },
  })

  // Update linked CrmCorrespondence entries when participant/provider are newly linked
  if (input.participantId !== undefined) {
    await prisma.crmCorrespondence.updateMany({
      where: { invoiceId: id, participantId: null },
      data: { participantId: input.participantId },
    })
  }
  if (input.providerId !== undefined) {
    await prisma.crmCorrespondence.updateMany({
      where: { invoiceId: id, providerId: null },
      data: { providerId: input.providerId },
    })
  }

  await createAuditLog({
    userId,
    action: 'invoice.updated',
    resource: 'invoice',
    resourceId: id,
    before: { invoiceNumber: current.invoiceNumber, totalCents: current.totalCents },
    after: {
      invoiceNumber: invoice.invoiceNumber,
      totalCents: invoice.totalCents,
      participantId: invoice.participantId,
      providerId: invoice.providerId,
    },
  })

  return invoice
}

export async function approveInvoice(id: string, userId: string, planId?: string) {
  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      planId: planId ?? undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'invoice.approved',
    resource: 'invoice',
    resourceId: id,
    after: { status: 'APPROVED' },
  })

  // Fire-and-forget: trigger automation rules for invoice approval
  void processEvent('lotus-pm.invoices.approved', {
    invoiceId: id,
    approvedBy: userId,
    amountCents: invoice.totalCents,
    status: 'APPROVED',
  }).catch(() => {
    // Automation failures should not block invoice operations
  })

  return invoice
}

export async function rejectInvoice(id: string, userId: string, reason: string) {
  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectedById: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  })

  await createAuditLog({
    userId,
    action: 'invoice.rejected',
    resource: 'invoice',
    resourceId: id,
    after: { status: 'REJECTED', reason },
  })

  // Fire-and-forget: trigger automation rules for invoice rejection
  void processEvent('lotus-pm.invoices.rejected', {
    invoiceId: id,
    rejectedBy: userId,
    reason,
    status: 'REJECTED',
  }).catch(() => {
    // Automation failures should not block invoice operations
  })

  return invoice
}

/** Get counts by status for dashboard */
export async function getInvoiceStatusCounts() {
  const counts = await prisma.invInvoice.groupBy({
    by: ['status'],
    where: { deletedAt: null },
    _count: true,
  })

  return Object.fromEntries(counts.map((c) => [c.status, c._count]))
}
