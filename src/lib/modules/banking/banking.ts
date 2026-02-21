import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { z } from 'zod'
import type { createPaymentSchema } from './validation'

type CreatePaymentInput = z.infer<typeof createPaymentSchema>

// ─── Payments ─────────────────────────────────────────────

export async function listPayments(params: {
  page: number
  pageSize: number
  status?: string
  abaFileId?: string
}) {
  const { page, pageSize, status, abaFileId } = params
  const where = {
    ...(status ? { status: status as 'PENDING' | 'IN_ABA_FILE' } : {}),
    ...(abaFileId ? { abaFileId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.bnkPayment.findMany({
      where,
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
        abaFile: { select: { id: true, filename: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bnkPayment.count({ where }),
  ])

  return { data, total }
}

export async function createPayment(input: CreatePaymentInput, userId: string) {
  // Verify claim exists and is approved/partial
  const claim = await prisma.clmClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, status: true, approvedCents: true },
  })

  if (!claim) {
    throw new Error('Claim not found')
  }

  if (!['APPROVED', 'PARTIAL'].includes(claim.status)) {
    throw new Error('Claim must be approved before creating a payment')
  }

  // Normalise BSB — strip dash if present
  const bsb = input.bsb.replace('-', '')

  const payment = await prisma.bnkPayment.create({
    data: {
      claimId: input.claimId,
      amountCents: input.amountCents,
      bsb,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      reference: input.reference,
    },
  })

  await createAuditLog({
    userId,
    action: 'payment.created',
    resource: 'payment',
    resourceId: payment.id,
    after: { claimId: input.claimId, amountCents: input.amountCents },
  })

  return payment
}

/** Bulk-create payments from approved claims with provider bank details */
export async function createPaymentsFromClaims(
  claimIds: string[],
  userId: string,
) {
  const claims = await prisma.clmClaim.findMany({
    where: { id: { in: claimIds }, status: { in: ['APPROVED', 'PARTIAL'] } },
    include: {
      invoice: {
        select: {
          provider: {
            select: { id: true, name: true, bankBsb: true, bankAccount: true, bankAccountName: true },
          },
        },
      },
    },
  })

  const created: string[] = []

  for (const claim of claims) {
    const provider = claim.invoice.provider

    if (!provider.bankBsb || !provider.bankAccount || !provider.bankAccountName) {
      continue // Skip claims where provider has no bank details
    }

    const existing = await prisma.bnkPayment.findFirst({
      where: { claimId: claim.id },
    })

    if (existing) {
      continue // Skip if payment already exists
    }

    const payment = await prisma.bnkPayment.create({
      data: {
        claimId: claim.id,
        amountCents: claim.approvedCents,
        bsb: provider.bankBsb.replace('-', ''),
        accountNumber: provider.bankAccount,
        accountName: provider.bankAccountName.slice(0, 32),
        reference: claim.claimReference,
      },
    })

    created.push(payment.id)
  }

  if (created.length > 0) {
    await createAuditLog({
      userId,
      action: 'payment.bulk-created',
      resource: 'payment',
      resourceId: created[0] ?? 'bulk',
      after: { count: created.length, claimIds },
    })
  }

  return created
}

// ─── ABA File Generation ──────────────────────────────────

/**
 * Generate an ABA (Australian Bankers Association) file for CBA.
 * Format: https://www.cemtexaba.com/aba-format/cemtex-aba-file-format-details
 *
 * This generates the file content string. Upload to S3 is handled by the caller.
 * The bank submission is manual via CBA CommBiz portal until API is available.
 */
export async function generateAbaFile(paymentIds: string[], userId: string) {
  const payments = await prisma.bnkPayment.findMany({
    where: { id: { in: paymentIds }, status: 'PENDING' },
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
  })

  if (payments.length === 0) {
    throw new Error('No pending payments found for the given IDs')
  }

  const now = new Date()
  const dateStr = formatAbaDate(now)
  const seqNum = await getNextAbaSequence()
  const filename = `ABA-${dateStr}-${String(seqNum).padStart(3, '0')}.aba`

  // Build ABA file content
  const lines: string[] = []

  // Record Type 0 — Descriptive Record (header)
  lines.push(buildAbaHeader(dateStr, seqNum))

  // Record Type 1 — Detail Records
  let totalCents = 0
  for (const payment of payments) {
    lines.push(buildAbaDetail(payment))
    totalCents += payment.amountCents
  }

  // Record Type 7 — File Total Record
  lines.push(buildAbaFooter(payments.length, totalCents))

  const abaContent = lines.join('\r\n') + '\r\n'

  // Store the S3 key placeholder — actual S3 upload done by caller
  const s3Key = `aba-files/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`

  const abaFile = await prisma.bnkAbaFile.create({
    data: {
      filename,
      s3Key,
      totalCents,
      paymentCount: payments.length,
      payments: {
        connect: paymentIds.map((id) => ({ id })),
      },
    },
  })

  // Update payment statuses
  await prisma.bnkPayment.updateMany({
    where: { id: { in: paymentIds } },
    data: { status: 'IN_ABA_FILE', abaFileId: abaFile.id },
  })

  await createAuditLog({
    userId,
    action: 'aba.generated',
    resource: 'aba_file',
    resourceId: abaFile.id,
    after: { filename, paymentCount: payments.length, totalCents },
  })

  return { abaFile, abaContent, filename }
}

/** Mark an ABA file as submitted to the bank */
export async function markAbaSubmitted(id: string, bankReference: string, userId: string) {
  const abaFile = await prisma.bnkAbaFile.update({
    where: { id },
    data: {
      bankReference,
      submittedAt: new Date(),
    },
  })

  await prisma.bnkPayment.updateMany({
    where: { abaFileId: id },
    data: { status: 'SUBMITTED_TO_BANK' },
  })

  await createAuditLog({
    userId,
    action: 'aba.submitted',
    resource: 'aba_file',
    resourceId: id,
    after: { bankReference },
  })

  return abaFile
}

/** Reconcile payments — mark as cleared */
export async function reconcilePayments(paymentIds: string[], userId: string) {
  const now = new Date()

  await prisma.bnkPayment.updateMany({
    where: { id: { in: paymentIds } },
    data: { status: 'CLEARED', processedAt: now },
  })

  // Update related claims to PAID
  const payments = await prisma.bnkPayment.findMany({
    where: { id: { in: paymentIds } },
    select: { claimId: true },
  })

  const claimIds = [...new Set(payments.map((p) => p.claimId))]
  await prisma.clmClaim.updateMany({
    where: { id: { in: claimIds } },
    data: { status: 'PAID' },
  })

  // Update invoices to PAID
  const claims = await prisma.clmClaim.findMany({
    where: { id: { in: claimIds } },
    select: { invoiceId: true },
  })

  const invoiceIds = [...new Set(claims.map((c) => c.invoiceId))]
  await prisma.invInvoice.updateMany({
    where: { id: { in: invoiceIds } },
    data: { status: 'PAID' },
  })

  await createAuditLog({
    userId,
    action: 'payment.reconciled',
    resource: 'payment',
    resourceId: paymentIds[0] ?? 'bulk',
    after: { paymentIds, claimIds },
  })

  return { reconciled: paymentIds.length }
}

// ─── ABA File Building Helpers ────────────────────────────

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

/**
 * ABA Header Record (Type 0)
 * CBA-specific: BSB 062-000, user ID from business
 */
function buildAbaHeader(dateStr: string, seqNum: number): string {
  // Field positions are fixed-width in ABA format
  const fields = [
    '0',                                    // Record type (1 char)
    ' '.repeat(17),                         // Blank (17 chars)
    padLeft(String(seqNum), 2, '0'),        // Reel sequence (2 chars)
    'CBA',                                  // Bank name (3 chars)
    ' '.repeat(7),                          // Blank (7 chars)
    padRight('Lotus Plan Management', 26),  // User name (26 chars)
    padRight('301500', 6),                  // APCA user ID (6 chars) — placeholder
    padRight('Claims Payment', 12),         // Description (12 chars)
    dateStr,                                // Date DDMMYY (6 chars)
    ' '.repeat(40),                         // Blank (40 chars)
  ]
  return fields.join('')
}

/**
 * ABA Detail Record (Type 1)
 * Credit transaction to provider
 */
function buildAbaDetail(payment: {
  bsb: string
  accountNumber: string
  accountName: string
  amountCents: number
  reference?: string | null
  claim: { claimReference: string; invoice: { provider: { name: string } } }
}): string {
  const bsbFormatted = payment.bsb.slice(0, 3) + '-' + payment.bsb.slice(3, 6)

  const fields = [
    '1',                                              // Record type
    bsbFormatted,                                     // BSB (7 chars with dash)
    padRight(payment.accountNumber, 9),               // Account number (9 chars)
    ' ',                                              // Indicator (1 char — blank for general)
    '50',                                             // Transaction code: 50 = credit
    padLeft(String(payment.amountCents), 10, '0'),    // Amount in cents (10 chars)
    padRight(payment.accountName, 32),                // Account name (32 chars)
    padRight(payment.reference ?? payment.claim.claimReference, 18), // Lodgement ref (18 chars)
    '062-000',                                        // Trace BSB (our bank BSB) (7 chars)
    padRight('000000000', 9),                         // Trace account (our account) (9 chars)
    padRight('Lotus PM', 16),                         // Remitter name (16 chars)
    padLeft('0', 8, '0'),                             // Withholding tax (8 chars)
  ]
  return fields.join('')
}

/**
 * ABA Footer Record (Type 7)
 */
function buildAbaFooter(recordCount: number, totalCents: number): string {
  const fields = [
    '7',                                              // Record type
    '999-999',                                        // BSB (7 chars)
    ' '.repeat(12),                                   // Blank (12 chars)
    padLeft(String(totalCents), 10, '0'),             // Net total (10 chars)
    padLeft(String(totalCents), 10, '0'),             // Credit total (10 chars)
    padLeft('0', 10, '0'),                            // Debit total (10 chars)
    ' '.repeat(24),                                   // Blank (24 chars)
    padLeft(String(recordCount), 6, '0'),             // Record count (6 chars)
    ' '.repeat(40),                                   // Blank (40 chars)
  ]
  return fields.join('')
}

function padRight(str: string, length: number, fill = ' '): string {
  return str.slice(0, length).padEnd(length, fill)
}

function padLeft(str: string, length: number, fill = ' '): string {
  return str.slice(0, length).padStart(length, fill)
}

// ─── ABA File Listing ─────────────────────────────────────

export async function listAbaFiles(params: {
  page: number
  pageSize: number
}) {
  const { page, pageSize } = params

  const [data, total] = await Promise.all([
    prisma.bnkAbaFile.findMany({
      include: {
        _count: { select: { payments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bnkAbaFile.count(),
  ])

  return { data, total }
}

export async function getAbaFile(id: string) {
  return prisma.bnkAbaFile.findUnique({
    where: { id },
    include: {
      payments: {
        include: {
          claim: {
            select: {
              claimReference: true,
              invoice: {
                select: {
                  invoiceNumber: true,
                  provider: { select: { name: true } },
                  participant: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
    },
  })
}

/** Get payment status counts for dashboard */
export async function getPaymentStatusCounts() {
  const counts = await prisma.bnkPayment.groupBy({
    by: ['status'],
    _count: true,
  })
  return Object.fromEntries(counts.map((c) => [c.status, c._count]))
}
