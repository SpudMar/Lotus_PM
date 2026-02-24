import { prisma } from '@/lib/db'
import { recordStatusTransition, recordInvoiceCreated } from './status-history'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import { validateInvoiceForApproval } from './invoice-validation'
import type { InvoiceValidationResult } from './invoice-validation'
import type { z } from 'zod'
import type { createInvoiceSchema, updateInvoiceSchema } from './validation'

type CreateInput = z.infer<typeof createInvoiceSchema>
type UpdateInput = z.infer<typeof updateInvoiceSchema>

type InvStatusValue = 'RECEIVED' | 'PROCESSING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLAIMED' | 'PAID'

export async function listInvoices(params: {
  page: number
  pageSize: number
  status?: string
  statusIn?: string[]
  participantId?: string
  providerId?: string
  ingestSource?: string
  search?: string
  /** Filter by AI processing category (NEEDS_CODES, NEEDS_REVIEW, AUTO_APPROVED, AUTO_REJECTED, PARTICIPANT_APPROVAL) */
  processingCategory?: string
}) {
  const { page, pageSize, status, statusIn, participantId, providerId, ingestSource, search, processingCategory } = params

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
    ...(processingCategory !== undefined
      ? processingCategory === 'UNPROCESSED'
        ? { processingCategory: null }
        : { processingCategory }
      : {}),
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
        lines: {
          select: {
            id: true,
            supportItemCode: true,
            supportItemName: true,
            categoryCode: true,
            totalCents: true,
            aiSuggestedCode: true,
            aiCodeConfidence: true,
          },
        },
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
      ...(input.s3Key ? { s3Key: input.s3Key } : {}),
      ...(input.s3Bucket ? { s3Bucket: input.s3Bucket } : {}),
      ...(input.ingestSource ? { ingestSource: input.ingestSource } : {}),
      ...(input.status ? { status: input.status } : {}),
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

  void recordInvoiceCreated(invoice.id)

  return invoice
}

export async function updateInvoice(id: string, input: UpdateInput, userId: string) {
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

export class ValidationFailedError extends Error {
  code = 'VALIDATION_FAILED' as const
  validation: InvoiceValidationResult

  constructor(validation: InvoiceValidationResult) {
    super('Invoice failed validation')
    this.name = 'ValidationFailedError'
    this.validation = validation
  }
}

// ── Per-line decision types -- Wave 3 ─────────────────────────────────────

export interface LineDecision {
  lineId: string
  decision: 'APPROVE' | 'REJECT' | 'ADJUST'
  reason?: string              // required for REJECT
  adjustedAmountCents?: number // required for ADJUST
}

export async function approveInvoice(
  id: string,
  userId: string,
  planId?: string,
  force?: boolean,
  lineDecisions?: LineDecision[]
): Promise<ReturnType<typeof prisma.invInvoice.update>> {
  // Run all validation checks before approving
  const validationResult = await validateInvoiceForApproval(id)

  if (validationResult.errors.length > 0 && force !== true) {
    throw new ValidationFailedError(validationResult)
  }

  // Apply per-line decisions when provided
  if (lineDecisions && lineDecisions.length > 0) {
    // Persist each line decision
    for (const ld of lineDecisions) {
      await prisma.invInvoiceLine.update({
        where: { id: ld.lineId },
        data: {
          lineStatus: ld.decision,
          ...(ld.decision === 'REJECT' ? { rejectionReason: ld.reason ?? null } : {}),
          ...(ld.decision === 'ADJUST' ? { adjustedAmountCents: ld.adjustedAmountCents ?? null } : {}),
        },
      })
    }

    // If every decision is REJECT, reject the whole invoice
    const allRejected = lineDecisions.every((ld) => ld.decision === 'REJECT')

    if (allRejected) {
      const currentStatusForPartialReject = await prisma.invInvoice.findFirst({
        where: { id },
        select: { status: true },
      })
      const rejectedInvoice = await prisma.invInvoice.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedById: userId,
          rejectedAt: new Date(),
          rejectionReason: 'All line items rejected',
          planId: planId ?? undefined,
        },
        include: {
          lines: { include: { budgetLine: true } },
        },
      })

      void recordStatusTransition({
        invoiceId: id,
        fromStatus: currentStatusForPartialReject?.status ?? null,
        toStatus: 'REJECTED',
        changedBy: userId,
        holdCategory: 'OTHER',
        holdReason: 'All line items rejected via per-line decisions',
      })

      await createAuditLog({
        userId,
        action: 'invoice.rejected',
        resource: 'invoice',
        resourceId: id,
        after: {
          status: 'REJECTED',
          reason: 'All line items rejected via per-line decisions',
          lineDecisionCount: lineDecisions.length,
        },
      })

      void processEvent('lotus-pm.invoices.rejected', {
        invoiceId: id,
        rejectedBy: userId,
        reason: 'All line items rejected',
      }).catch(() => {/* automation failures must not affect main flow */})

      return rejectedInvoice
    }

    // Build lookup: lineId to decision
    const decisionByLineId = new Map(lineDecisions.map((ld) => [ld.lineId, ld]))

    // Re-fetch lines to compute approved total
    const updatedLines = await prisma.invInvoiceLine.findMany({
      where: { invoiceId: id },
      include: { budgetLine: true },
    })

    // Approved subtotal: sum effective amounts for non-rejected lines with a decision
    let approvedSubtotalCents = 0
    for (const line of updatedLines) {
      const ld = decisionByLineId.get(line.id)
      if (!ld || ld.decision === 'REJECT') continue
      const effectiveCents =
        ld.decision === 'ADJUST' ? (ld.adjustedAmountCents ?? line.totalCents) : line.totalCents
      approvedSubtotalCents += effectiveCents
    }

    const currentStatusBeforePartialApprove = await prisma.invInvoice.findFirst({
      where: { id },
      select: { status: true },
    })
    const invoice = await prisma.invInvoice.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
        planId: planId ?? undefined,
        subtotalCents: approvedSubtotalCents,
      },
      include: {
        lines: { include: { budgetLine: true } },
      },
    })

    void recordStatusTransition({
      invoiceId: id,
      fromStatus: currentStatusBeforePartialApprove?.status ?? null,
      toStatus: 'APPROVED',
      changedBy: userId,
    })

    // Increment budget line spent -- only for approved/adjusted lines
    const budgetLineUpdatesPartial = new Map<string, number>()
    for (const line of updatedLines) {
      const ld = decisionByLineId.get(line.id)
      if (!ld || ld.decision === 'REJECT') continue
      if (line.budgetLineId !== null) {
        const effectiveCents =
          ld.decision === 'ADJUST' ? (ld.adjustedAmountCents ?? line.totalCents) : line.totalCents
        const current = budgetLineUpdatesPartial.get(line.budgetLineId) ?? 0
        budgetLineUpdatesPartial.set(line.budgetLineId, current + effectiveCents)
      }
    }

    for (const [budgetLineId, amountCents] of budgetLineUpdatesPartial) {
      await prisma.planBudgetLine.update({
        where: { id: budgetLineId },
        data: { spentCents: { increment: amountCents } },
      })
    }

    await createAuditLog({
      userId,
      action: 'invoice.approved',
      resource: 'invoice',
      resourceId: id,
      after: {
        status: 'APPROVED',
        approvedSubtotalCents,
        ...(force === true ? { forced: true } : {}),
        validationWarnings: validationResult.warnings.map((w) => w.code),
        lineDecisionCount: lineDecisions.length,
        rejectedLineCount: lineDecisions.filter((ld) => ld.decision === 'REJECT').length,
        adjustedLineCount: lineDecisions.filter((ld) => ld.decision === 'ADJUST').length,
      },
    })

    void processEvent('lotus-pm.invoices.approved', {
      invoiceId: id,
      amountCents: approvedSubtotalCents,
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    }).catch(() => {/* automation failures must not affect main flow */})

    return invoice
  }

  // Standard approval (no per-line decisions)

  const currentStatusBeforeApprove = await prisma.invInvoice.findFirst({
    where: { id },
    select: { status: true },
  })
  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      planId: planId ?? undefined,
    },
    include: {
      lines: { include: { budgetLine: true } },
    },
  })

  void recordStatusTransition({
    invoiceId: id,
    fromStatus: currentStatusBeforeApprove?.status ?? null,
    toStatus: 'APPROVED',
    changedBy: userId,
  })

  // Increment spentCents on budget lines for all approved invoice lines
  const budgetLineUpdates = new Map<string, number>()
  for (const line of invoice.lines) {
    if (line.budgetLineId !== null) {
      const current = budgetLineUpdates.get(line.budgetLineId) ?? 0
      budgetLineUpdates.set(line.budgetLineId, current + line.totalCents)
    }
  }

  for (const [budgetLineId, amountCents] of budgetLineUpdates) {
    await prisma.planBudgetLine.update({
      where: { id: budgetLineId },
      data: { spentCents: { increment: amountCents } },
    })
  }

  await createAuditLog({
    userId,
    action: 'invoice.approved',
    resource: 'invoice',
    resourceId: id,
    after: {
      status: 'APPROVED',
      ...(force === true ? { forced: true } : {}),
      validationWarnings: validationResult.warnings.map((w) => w.code),
    },
  })

  // Fire-and-forget: don't block the caller on automation failures
  void processEvent('lotus-pm.invoices.approved', {
    invoiceId: id,
    amountCents: invoice.totalCents,
    approvedBy: userId,
    approvedAt: new Date().toISOString(),
  }).catch(() => {/* automation failures must not affect main flow */})

  return invoice
}

export async function rejectInvoice(id: string, userId: string, reason: string) {
  const currentInvoice = await prisma.invInvoice.findFirst({
    where: { id },
    select: { status: true },
  })
  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectedById: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  })

  void recordStatusTransition({
    invoiceId: id,
    fromStatus: currentInvoice?.status ?? null,
    toStatus: 'REJECTED',
    changedBy: userId,
    holdCategory: 'OTHER',
    holdReason: reason,
  })

  await createAuditLog({
    userId,
    action: 'invoice.rejected',
    resource: 'invoice',
    resourceId: id,
    after: { status: 'REJECTED', reason },
  })

  // Fire-and-forget: don't block the caller on automation failures
  void processEvent('lotus-pm.invoices.rejected', {
    invoiceId: id,
    rejectedBy: userId,
    reason,
  }).catch(() => {/* automation failures must not affect main flow */})

  return invoice
}


// --- Replace PDF ---

export async function replacePdf(
  invoiceId: string,
  newS3Key: string,
  newS3Bucket: string,
  userId: string,
): Promise<ReturnType<typeof prisma.invInvoice.update>> {
  const invoice = await prisma.invInvoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: { id: true, s3Key: true, s3Bucket: true },
  })

  if (!invoice) {
    throw new Error('NOT_FOUND')
  }

  const oldS3Key = invoice.s3Key
  const oldS3Bucket = invoice.s3Bucket

  const updated = await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      s3Key: newS3Key,
      s3Bucket: newS3Bucket,
      processingCategory: null,
    },
  })

  await createAuditLog({
    userId,
    action: 'invoice.pdf_replaced',
    resource: 'invoice',
    resourceId: invoiceId,
    before: { s3Key: oldS3Key, s3Bucket: oldS3Bucket },
    after: { s3Key: newS3Key, s3Bucket: newS3Bucket },
  })

  return updated
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
