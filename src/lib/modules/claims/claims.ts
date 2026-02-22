import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import type { z } from 'zod'
import type {
  createClaimSchema,
  recordOutcomeSchema,
  submitClaimSchema,
} from './validation'

type CreateInput = z.infer<typeof createClaimSchema>
type SubmitInput = z.infer<typeof submitClaimSchema>
type OutcomeInput = z.infer<typeof recordOutcomeSchema>

/** Generate next sequential claim reference */
async function nextClaimReference(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `CLM-${year}-`

  const latest = await prisma.clmClaim.findFirst({
    where: { claimReference: { startsWith: prefix } },
    orderBy: { claimReference: 'desc' },
    select: { claimReference: true },
  })

  if (!latest) {
    return `${prefix}0001`
  }

  const seq = parseInt(latest.claimReference.slice(prefix.length), 10)
  return `${prefix}${String(seq + 1).padStart(4, '0')}`
}

/** Generate next sequential batch number */
async function nextBatchNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `BATCH-${year}-`

  const latest = await prisma.clmBatch.findFirst({
    where: { batchNumber: { startsWith: prefix } },
    orderBy: { batchNumber: 'desc' },
    select: { batchNumber: true },
  })

  if (!latest) {
    return `${prefix}0001`
  }

  const seq = parseInt(latest.batchNumber.slice(prefix.length), 10)
  return `${prefix}${String(seq + 1).padStart(4, '0')}`
}

// ─── List & Get ───────────────────────────────────────────

export async function listClaims(params: {
  page: number
  pageSize: number
  status?: string
  participantId?: string
  batchId?: string
}) {
  const { page, pageSize, status, participantId, batchId } = params
  const where = {
    ...(status ? { status: status as 'PENDING' | 'SUBMITTED' | 'APPROVED' } : {}),
    ...(participantId ? { participantId } : {}),
    ...(batchId ? { batchId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.clmClaim.findMany({
      where,
      include: {
        participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
        invoice: { select: { id: true, invoiceNumber: true, provider: { select: { id: true, name: true } } } },
        batch: { select: { id: true, batchNumber: true } },
        submittedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.clmClaim.count({ where }),
  ])

  return { data, total }
}

export async function getClaim(id: string) {
  return prisma.clmClaim.findUnique({
    where: { id },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      invoice: {
        include: {
          provider: true,
          lines: true,
        },
      },
      lines: {
        include: {
          invoiceLine: { select: { id: true, supportItemCode: true, supportItemName: true } },
        },
      },
      batch: { select: { id: true, batchNumber: true, status: true } },
      submittedBy: { select: { id: true, name: true } },
      outcomeBy: { select: { id: true, name: true } },
      payments: true,
    },
  })
}

/** Get status counts for dashboard */
export async function getClaimStatusCounts() {
  const counts = await prisma.clmClaim.groupBy({
    by: ['status'],
    _count: true,
  })
  return Object.fromEntries(counts.map((c) => [c.status, c._count]))
}

// ─── Create ───────────────────────────────────────────────

export async function createClaimFromInvoice(input: CreateInput, userId: string) {
  // Verify invoice exists and is approved
  const invoice = await prisma.invInvoice.findUnique({
    where: { id: input.invoiceId },
    select: { id: true, status: true, participantId: true, totalCents: true },
  })

  if (!invoice) {
    throw new Error('Invoice not found')
  }

  if (invoice.status !== 'APPROVED') {
    throw new Error('Invoice must be approved before creating a claim')
  }

  // Check no existing claim for this invoice
  const existing = await prisma.clmClaim.findFirst({
    where: { invoiceId: input.invoiceId },
  })

  if (existing) {
    throw new Error('A claim already exists for this invoice')
  }

  const claimReference = await nextClaimReference()
  const claimedCents = input.lines.reduce((sum, l) => sum + l.totalCents, 0)

  const claim = await prisma.clmClaim.create({
    data: {
      claimReference,
      invoiceId: input.invoiceId,
      participantId: invoice.participantId,
      claimedCents,
      lines: {
        create: input.lines.map((line) => ({
          invoiceLineId: line.invoiceLineId,
          supportItemCode: line.supportItemCode,
          supportItemName: line.supportItemName,
          categoryCode: line.categoryCode,
          serviceDate: new Date(line.serviceDate),
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
          gstCents: line.gstCents,
        })),
      },
    },
    include: { lines: true },
  })

  // Update invoice status to CLAIMED
  await prisma.invInvoice.update({
    where: { id: input.invoiceId },
    data: { status: 'CLAIMED' },
  })

  await createAuditLog({
    userId,
    action: 'claim.created',
    resource: 'claim',
    resourceId: claim.id,
    after: { claimReference, invoiceId: input.invoiceId, claimedCents },
  })

  return claim
}

// ─── Submit ───────────────────────────────────────────────

export async function submitClaim(id: string, input: SubmitInput, userId: string) {
  const claim = await prisma.clmClaim.findUnique({
    where: { id },
    select: { id: true, status: true, invoiceId: true, claimedCents: true },
  })

  if (!claim) {
    throw new Error('Claim not found')
  }

  if (claim.status !== 'PENDING') {
    throw new Error('Only pending claims can be submitted')
  }

  const updated = await prisma.clmClaim.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      submittedById: userId,
      submittedAt: new Date(),
      prodaReference: input.prodaReference,
    },
  })

  await createAuditLog({
    userId,
    action: 'claim.submitted',
    resource: 'claim',
    resourceId: id,
    after: { status: 'SUBMITTED', prodaReference: input.prodaReference },
  })

  // Fire-and-forget: don't block the caller on automation failures
  void processEvent('lotus-pm.claims.submitted', {
    claimId: id,
    invoiceId: claim.invoiceId ?? '',
    amountCents: claim.claimedCents,
    submittedAt: new Date().toISOString(),
  }).catch(() => {/* automation failures must not affect main flow */})

  return updated
}

// ─── Record Outcome ───────────────────────────────────────

export async function recordClaimOutcome(id: string, input: OutcomeInput, userId: string) {
  const claim = await prisma.clmClaim.findUnique({
    where: { id },
    select: { id: true, status: true, invoiceId: true },
  })

  if (!claim) {
    throw new Error('Claim not found')
  }

  if (claim.status !== 'SUBMITTED') {
    throw new Error('Only submitted claims can have outcomes recorded')
  }

  const clmStatus = input.outcome === 'APPROVED'
    ? 'APPROVED' as const
    : input.outcome === 'REJECTED'
      ? 'REJECTED' as const
      : 'PARTIAL' as const

  const updated = await prisma.clmClaim.update({
    where: { id },
    data: {
      status: clmStatus,
      approvedCents: input.approvedCents,
      outcomeAt: new Date(),
      outcomeNotes: input.outcomeNotes,
      outcomeById: userId,
    },
  })

  // Update individual line outcomes if provided
  if (input.lineOutcomes) {
    for (const lineOutcome of input.lineOutcomes) {
      await prisma.clmClaimLine.update({
        where: { id: lineOutcome.claimLineId },
        data: {
          status: lineOutcome.status,
          approvedCents: lineOutcome.approvedCents,
          outcomeNotes: lineOutcome.outcomeNotes,
        },
      })
    }
  }

  await createAuditLog({
    userId,
    action: 'claim.outcome',
    resource: 'claim',
    resourceId: id,
    after: { status: clmStatus, approvedCents: input.approvedCents, outcome: input.outcome },
  })

  // Fire-and-forget: don't block the caller on automation failures
  void processEvent('lotus-pm.claims.outcome-received', {
    claimId: id,
    outcome: input.outcome,
    paidAmountCents: input.approvedCents ?? 0,
    receivedAt: new Date().toISOString(),
  }).catch(() => {/* automation failures must not affect main flow */})

  return updated
}

// ─── Batch Operations ─────────────────────────────────────

export async function listBatches(params: {
  page: number
  pageSize: number
  status?: string
}) {
  const { page, pageSize, status } = params
  const where = status ? { status: status as 'DRAFT' | 'SUBMITTED' } : {}

  const [data, total] = await Promise.all([
    prisma.clmBatch.findMany({
      where,
      include: {
        claims: {
          select: { id: true, claimReference: true, status: true, claimedCents: true },
        },
        _count: { select: { claims: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.clmBatch.count({ where }),
  ])

  return { data, total }
}

export async function getBatch(id: string) {
  return prisma.clmBatch.findUnique({
    where: { id },
    include: {
      claims: {
        include: {
          participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
          invoice: { select: { id: true, invoiceNumber: true, provider: { select: { id: true, name: true } } } },
        },
      },
    },
  })
}

export async function createBatch(claimIds: string[], notes: string | undefined, userId: string) {
  // Verify all claims are PENDING
  const claims = await prisma.clmClaim.findMany({
    where: { id: { in: claimIds } },
    select: { id: true, status: true, claimedCents: true },
  })

  if (claims.length !== claimIds.length) {
    throw new Error('One or more claims not found')
  }

  const nonPending = claims.filter((c) => c.status !== 'PENDING')
  if (nonPending.length > 0) {
    throw new Error('All claims must be in PENDING status to add to a batch')
  }

  const totalCents = claims.reduce((sum, c) => sum + c.claimedCents, 0)
  const batchNumber = await nextBatchNumber()

  const batch = await prisma.clmBatch.create({
    data: {
      batchNumber,
      claimCount: claims.length,
      totalCents,
      notes,
      claims: {
        connect: claimIds.map((id) => ({ id })),
      },
    },
    include: {
      claims: { select: { id: true, claimReference: true } },
    },
  })

  await createAuditLog({
    userId,
    action: 'batch.created',
    resource: 'batch',
    resourceId: batch.id,
    after: { batchNumber, claimCount: claims.length, totalCents },
  })

  return batch
}

export async function submitBatch(
  id: string,
  input: { prodaBatchId?: string; notes?: string },
  userId: string,
) {
  const batch = await prisma.clmBatch.findUnique({
    where: { id },
    include: { claims: { select: { id: true, status: true } } },
  })

  if (!batch) {
    throw new Error('Batch not found')
  }

  if (batch.status !== 'DRAFT') {
    throw new Error('Only draft batches can be submitted')
  }

  // Mark all claims in batch as SUBMITTED
  await prisma.clmClaim.updateMany({
    where: { batchId: id, status: 'PENDING' },
    data: {
      status: 'SUBMITTED',
      submittedById: userId,
      submittedAt: new Date(),
    },
  })

  const updated = await prisma.clmBatch.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      submittedById: userId,
      submittedAt: new Date(),
      prodaBatchId: input.prodaBatchId,
      notes: input.notes ?? batch.notes,
    },
  })

  await createAuditLog({
    userId,
    action: 'batch.submitted',
    resource: 'batch',
    resourceId: id,
    after: { status: 'SUBMITTED', claimCount: batch.claims.length },
  })

  return updated
}

/** Get claims that are approved but not yet paid — ready for payment */
export async function getClaimsReadyForPayment() {
  return prisma.clmClaim.findMany({
    where: {
      status: { in: ['APPROVED', 'PARTIAL'] },
      approvedCents: { gt: 0 },
      payments: { none: {} },
    },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          provider: {
            select: { id: true, name: true, bankBsb: true, bankAccount: true, bankAccountName: true },
          },
        },
      },
    },
    orderBy: { outcomeAt: 'asc' },
  })
}
