import { prisma } from '@/lib/db'
import type { InvStatus, InvHoldCategory } from '@prisma/client'

export interface RecordStatusTransitionParams {
  invoiceId: string
  fromStatus: InvStatus | null
  toStatus: InvStatus
  changedBy?: string
  holdCategory?: InvHoldCategory
  holdReason?: string
  metadata?: Record<string, unknown>
}

/**
 * Record an invoice status transition for analytics.
 * Calculates time since last transition and writes to InvStatusHistory.
 * Also updates denormalised fields on the invoice.
 *
 * IMPORTANT: This function never throws — analytics must not break invoice processing.
 */
export async function recordStatusTransition(
  params: RecordStatusTransitionParams
): Promise<void> {
  try {
    // Get previous history record to calculate duration
    const prev = await prisma.invStatusHistory.findFirst({
      where: { invoiceId: params.invoiceId },
      orderBy: { changedAt: 'desc' },
    })
    const durationMs = prev ? Date.now() - prev.changedAt.getTime() : null

    // Write history record
    await prisma.invStatusHistory.create({
      data: {
        invoiceId: params.invoiceId,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus,
        changedBy: params.changedBy ?? null,
        holdCategory: params.holdCategory ?? null,
        holdReason: params.holdReason ?? null,
        metadata: params.metadata ? (params.metadata as unknown as import('@prisma/client').Prisma.InputJsonValue) : undefined,
        durationMs,
      },
    })

    // Update denormalised fields on invoice
    if (params.toStatus === 'APPROVED') {
      await prisma.invInvoice.updateMany({
        where: { id: params.invoiceId, firstApprovedAt: null },
        data: { firstApprovedAt: new Date() },
      })
    }
    if (params.toStatus === 'REJECTED') {
      await prisma.invInvoice.updateMany({
        where: { id: params.invoiceId, firstRejectedAt: null },
        data: { firstRejectedAt: new Date() },
      })
    }
    if (params.toStatus === 'PAID') {
      const invoice = await prisma.invInvoice.findUnique({
        where: { id: params.invoiceId },
        select: { receivedAt: true },
      })
      if (invoice) {
        await prisma.invInvoice.update({
          where: { id: params.invoiceId },
          data: { totalProcessingMs: Date.now() - invoice.receivedAt.getTime() },
        })
      }
    }
  } catch (err) {
    // Analytics must never break invoice processing
    console.error('[status-history] Failed to record status transition:', err)
  }
}

/**
 * Convenience: record the initial RECEIVED transition when an invoice is created.
 */
export async function recordInvoiceCreated(invoiceId: string): Promise<void> {
  return recordStatusTransition({
    invoiceId,
    fromStatus: null,
    toStatus: 'RECEIVED',
  })
}
