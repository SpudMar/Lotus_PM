import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { BnkPaymentBatch } from '@prisma/client'
import { notifyProvidersRemittance } from '@/lib/modules/notifications/provider-notifications'

// ─── Status Derivation ────────────────────────────────────

type BatchStatus = 'PENDING' | 'ABA_GENERATED' | 'UPLOADED' | 'CONFIRMED'

function deriveBatchStatus(batch: {
  generatedAt: Date | null
  uploadedAt: Date | null
  confirmedAt: Date | null
}): BatchStatus {
  if (batch.confirmedAt) return 'CONFIRMED'
  if (batch.uploadedAt) return 'UPLOADED'
  if (batch.generatedAt) return 'ABA_GENERATED'
  return 'PENDING'
}

// ─── Batch CRUD ───────────────────────────────────────────

export async function createPaymentBatch(
  input: { description?: string; scheduledDate?: Date },
  userId: string,
): Promise<BnkPaymentBatch> {
  const batch = await prisma.bnkPaymentBatch.create({
    data: {
      description: input.description,
      scheduledDate: input.scheduledDate,
      createdById: userId,
    },
  })

  await createAuditLog({
    userId,
    action: 'payment_batch.created',
    resource: 'payment_batch',
    resourceId: batch.id,
    after: { description: input.description, scheduledDate: input.scheduledDate },
  })

  return batch
}

export async function addPaymentsToBatch(
  batchId: string,
  paymentIds: string[],
  userId: string,
): Promise<void> {
  const batch = await prisma.bnkPaymentBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error('NOT_FOUND')

  // Can only add payments to a batch that hasn't been generated yet
  if (batch.generatedAt) throw new Error('INVALID_STATUS')

  // Verify all payments exist and are in PENDING status (not already in a batch)
  const payments = await prisma.bnkPayment.findMany({
    where: { id: { in: paymentIds } },
    select: { id: true, status: true, batchId: true },
  })

  if (payments.length !== paymentIds.length) {
    throw new Error('PAYMENTS_NOT_FOUND')
  }

  const alreadyBatched = payments.filter((p) => p.batchId !== null && p.batchId !== batchId)
  if (alreadyBatched.length > 0) {
    throw new Error('PAYMENTS_ALREADY_BATCHED')
  }

  const invalidStatus = payments.filter(
    (p) => p.status !== 'PENDING' && p.status !== 'IN_ABA_FILE',
  )
  if (invalidStatus.length > 0) {
    throw new Error('INVALID_PAYMENT_STATUS')
  }

  await prisma.bnkPayment.updateMany({
    where: { id: { in: paymentIds } },
    data: { batchId },
  })

  await createAuditLog({
    userId,
    action: 'payment_batch.payments_added',
    resource: 'payment_batch',
    resourceId: batchId,
    after: { paymentIds, count: paymentIds.length },
  })
}

export async function removePaymentFromBatch(
  batchId: string,
  paymentId: string,
  userId: string,
): Promise<void> {
  const batch = await prisma.bnkPaymentBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error('NOT_FOUND')

  if (batch.generatedAt) throw new Error('INVALID_STATUS')

  const payment = await prisma.bnkPayment.findFirst({
    where: { id: paymentId, batchId },
  })
  if (!payment) throw new Error('PAYMENT_NOT_IN_BATCH')

  await prisma.bnkPayment.update({
    where: { id: paymentId },
    data: { batchId: null },
  })

  await createAuditLog({
    userId,
    action: 'payment_batch.payment_removed',
    resource: 'payment_batch',
    resourceId: batchId,
    after: { paymentId },
  })
}

// ─── ABA Generation ───────────────────────────────────────

export async function generateBatchAba(
  batchId: string,
  userId: string,
): Promise<{ abaContent: string; filename: string }> {
  const batch = await prisma.bnkPaymentBatch.findUnique({
    where: { id: batchId },
    include: {
      payments: {
        include: {
          claim: {
            select: {
              claimReference: true,
              invoice: {
                select: { provider: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  })

  if (!batch) throw new Error('NOT_FOUND')
  if (batch.generatedAt) throw new Error('ABA_ALREADY_GENERATED')

  const payments = batch.payments.filter((p) => p.status === 'PENDING')
  if (payments.length === 0) throw new Error('NO_PENDING_PAYMENTS')

  const now = new Date()
  const dateStr = formatAbaDate(now)
  const seqNum = await getNextAbaSequence()
  const filename = `ABA-BATCH-${batchId.slice(-8)}-${dateStr}-${String(seqNum).padStart(3, '0')}.aba`

  // Build ABA file content
  const lines: string[] = []
  lines.push(buildAbaHeader(dateStr, seqNum))

  let totalCents = 0
  for (const payment of payments) {
    lines.push(buildAbaDetail(payment))
    totalCents += payment.amountCents
  }
  lines.push(buildAbaFooter(payments.length, totalCents))

  const abaContent = lines.join('\r\n') + '\r\n'

  const s3Key = `aba-files/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`

  // Create ABA file record linked to this batch
  const abaFile = await prisma.bnkAbaFile.create({
    data: {
      filename,
      s3Key,
      totalCents,
      paymentCount: payments.length,
      batchId,
      payments: {
        connect: payments.map((p) => ({ id: p.id })),
      },
    },
  })

  // Update payment statuses and link to ABA file
  await prisma.bnkPayment.updateMany({
    where: { id: { in: payments.map((p) => p.id) } },
    data: { status: 'IN_ABA_FILE', abaFileId: abaFile.id },
  })

  // Mark batch as generated
  await prisma.bnkPaymentBatch.update({
    where: { id: batchId },
    data: { generatedAt: now },
  })

  await createAuditLog({
    userId,
    action: 'payment_batch.aba_generated',
    resource: 'payment_batch',
    resourceId: batchId,
    after: { filename, paymentCount: payments.length, totalCents, abaFileId: abaFile.id },
  })

  return { abaContent, filename }
}

// ─── Lifecycle State Transitions ─────────────────────────

export async function markBatchUploaded(
  batchId: string,
  userId: string,
): Promise<BnkPaymentBatch> {
  const batch = await prisma.bnkPaymentBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error('NOT_FOUND')
  if (!batch.generatedAt) throw new Error('INVALID_STATUS')
  if (batch.uploadedAt) throw new Error('ALREADY_UPLOADED')

  const updated = await prisma.bnkPaymentBatch.update({
    where: { id: batchId },
    data: { uploadedAt: new Date() },
  })

  await createAuditLog({
    userId,
    action: 'payment_batch.uploaded',
    resource: 'payment_batch',
    resourceId: batchId,
    after: { uploadedAt: updated.uploadedAt },
  })

  return updated
}

export async function markBatchConfirmed(
  batchId: string,
  userId: string,
): Promise<BnkPaymentBatch> {
  const batch = await prisma.bnkPaymentBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error('NOT_FOUND')
  if (!batch.uploadedAt) throw new Error('INVALID_STATUS')
  if (batch.confirmedAt) throw new Error('ALREADY_CONFIRMED')

  const updated = await prisma.bnkPaymentBatch.update({
    where: { id: batchId },
    data: { confirmedAt: new Date() },
  })

  await createAuditLog({
    userId,
    action: 'payment_batch.confirmed',
    resource: 'payment_batch',
    resourceId: batchId,
    after: { confirmedAt: updated.confirmedAt },
  })

  // Fire-and-forget: send remittance advice emails to all providers in the batch
  void notifyProvidersRemittance({ batchId }).catch((err) => {
    console.error('[payment-batches] remittance notification failed for batch:', batchId, err)
  })

  return updated
}

// ─── Queries ──────────────────────────────────────────────

export async function listPaymentBatches(params: {
  page: number
  pageSize: number
  status?: BatchStatus
}): Promise<{ data: BnkPaymentBatch[]; total: number }> {
  const { page, pageSize, status } = params

  // Build status-based where clause
  let where: {
    generatedAt?: { not: null } | null
    uploadedAt?: { not: null } | null
    confirmedAt?: { not: null } | null
  } = {}

  if (status === 'PENDING') {
    where = { generatedAt: null }
  } else if (status === 'ABA_GENERATED') {
    where = { generatedAt: { not: null }, uploadedAt: null }
  } else if (status === 'UPLOADED') {
    where = { uploadedAt: { not: null }, confirmedAt: null }
  } else if (status === 'CONFIRMED') {
    where = { confirmedAt: { not: null } }
  }

  const [data, total] = await Promise.all([
    prisma.bnkPaymentBatch.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { payments: true, abaFiles: true } },
        payments: { select: { amountCents: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bnkPaymentBatch.count({ where }),
  ])

  return { data, total }
}

export async function getPaymentBatch(id: string): Promise<BnkPaymentBatch | null> {
  return prisma.bnkPaymentBatch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      abaFiles: { select: { id: true, filename: true, totalCents: true, paymentCount: true, createdAt: true } },
      payments: {
        include: {
          claim: {
            select: {
              id: true,
              claimReference: true,
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  provider: { select: { id: true, name: true } },
                  participant: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  }) as Promise<BnkPaymentBatch | null>
}

export { deriveBatchStatus }
export type { BatchStatus }

// ─── ABA Building Helpers (shared with banking.ts pattern) ───

function formatAbaDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  return `${dd}${mm}${yy}`
}

async function getNextAbaSequence(): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const count = await prisma.bnkAbaFile.count({
    where: { createdAt: { gte: today } },
  })
  return count + 1
}

function buildAbaHeader(dateStr: string, seqNum: number): string {
  const fields = [
    '0',
    ' '.repeat(17),
    padLeft(String(seqNum), 2, '0'),
    'CBA',
    ' '.repeat(7),
    padRight('Lotus Plan Management', 26),
    padRight('301500', 6),
    padRight('Claims Payment', 12),
    dateStr,
    ' '.repeat(40),
  ]
  return fields.join('')
}

function buildAbaDetail(payment: {
  bsb: string
  accountNumber: string
  accountName: string
  amountCents: number
  reference?: string | null
  claim: { claimReference: string; invoice: { provider: { name: string } | null } }
}): string {
  const bsbFormatted = payment.bsb.slice(0, 3) + '-' + payment.bsb.slice(3, 6)
  const fields = [
    '1',
    bsbFormatted,
    padRight(payment.accountNumber, 9),
    ' ',
    '50',
    padLeft(String(payment.amountCents), 10, '0'),
    padRight(payment.accountName, 32),
    padRight(payment.reference ?? payment.claim.claimReference, 18),
    '062-000',
    padRight('000000000', 9),
    padRight('Lotus PM', 16),
    padLeft('0', 8, '0'),
  ]
  return fields.join('')
}

function buildAbaFooter(recordCount: number, totalCents: number): string {
  const fields = [
    '7',
    '999-999',
    ' '.repeat(12),
    padLeft(String(totalCents), 10, '0'),
    padLeft(String(totalCents), 10, '0'),
    padLeft('0', 10, '0'),
    ' '.repeat(24),
    padLeft(String(recordCount), 6, '0'),
    ' '.repeat(40),
  ]
  return fields.join('')
}

function padRight(str: string, length: number, fill = ' '): string {
  return str.slice(0, length).padEnd(length, fill)
}

function padLeft(str: string, length: number, fill = ' '): string {
  return str.slice(0, length).padStart(length, fill)
}
