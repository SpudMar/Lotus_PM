/**
 * Bulk Claim Generation — creates NDIS claims from a batch of approved invoices.
 *
 * Generates one ClmClaim per invoice. Each ClmClaimLine links back to the source
 * InvInvoiceLine via invoiceLineId and to the source InvInvoice via sourceInvoiceId.
 *
 * After generation, all source invoices are updated to status CLAIMED.
 *
 * This is the automated path; individual claim creation is handled by
 * createClaimFromInvoice() in claims.ts.
 *
 * REQ-011: All DB queries use ap-southeast-2.
 * REQ-017: No PII in audit logs.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClaimBatchResult {
  claims: ClaimBatchEntry[]
  invoicesProcessed: number
}

export interface ClaimBatchEntry {
  claimId: string
  claimReference: string
  participantName: string
  totalCents: number
  lineCount: number
}

export interface ClaimGenerationError {
  invoiceId: string
  error: string
}

// ── Claim reference generation ─────────────────────────────────────────────────

/**
 * Generate the next sequential claim reference in CLM-YYYYMMDD-XXXX format.
 * Sequences reset per day (the YYYYMMDD prefix changes each day).
 */
async function nextBatchClaimReference(): Promise<string> {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const prefix = `CLM-${y}${m}${d}-`

  const latest = await prisma.clmClaim.findFirst({
    where: { claimReference: { startsWith: prefix } },
    orderBy: { claimReference: 'desc' },
    select: { claimReference: true },
  })

  if (!latest) return `${prefix}0001`
  const seq = parseInt(latest.claimReference.slice(prefix.length), 10)
  return `${prefix}${String(seq + 1).padStart(4, '0')}`
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Generate claims for a list of approved invoice IDs.
 *
 * Validates that every invoice exists and is in APPROVED status before
 * processing. Throws immediately with a descriptive error for validation
 * failures; use the partial-success wrapper in the bulk API route for
 * per-invoice error handling.
 *
 * @param invoiceIds - IDs of approved invoices to generate claims for
 * @param userId     - Staff user ID for audit log
 * @throws If any invoice is not found or not in APPROVED status
 */
export async function generateClaimBatch(
  invoiceIds: string[],
  userId: string
): Promise<ClaimBatchResult> {
  if (invoiceIds.length === 0) {
    return { claims: [], invoicesProcessed: 0 }
  }

  // Load all invoices with lines and participant data
  const invoices = await prisma.invInvoice.findMany({
    where: { id: { in: invoiceIds }, deletedAt: null },
    include: {
      lines: true,
      participant: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  // Validate: all requested IDs were found
  const foundIds = new Set(invoices.map((inv) => inv.id))
  const notFound = invoiceIds.filter((id) => !foundIds.has(id))
  if (notFound.length > 0) {
    throw new Error(`Invoice not found: ${notFound[0]}`)
  }

  // Validate: all must be in APPROVED status
  const notApproved = invoices.filter((inv) => inv.status !== 'APPROVED')
  if (notApproved.length > 0) {
    throw new Error(
      `Invoice is not in APPROVED status (current: ${notApproved[0]!.status})`
    )
  }

  const results: ClaimBatchEntry[] = []

  for (const invoice of invoices) {
    const claimReference = await nextBatchClaimReference()
    // Sum of all line totals — use invoice.totalCents as fallback if no lines
    const claimedCents =
      invoice.lines.length > 0
        ? invoice.lines.reduce((sum, l) => sum + l.totalCents, 0)
        : invoice.totalCents

    const claim = await prisma.clmClaim.create({
      data: {
        claimReference,
        invoiceId: invoice.id,
        participantId: invoice.participantId,
        claimedCents,
        lines: {
          create: invoice.lines.map((line) => ({
            invoiceLineId: line.id,
            sourceInvoiceId: invoice.id,
            supportItemCode: line.supportItemCode,
            supportItemName: line.supportItemName,
            categoryCode: line.categoryCode,
            serviceDate: line.serviceDate,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            gstCents: line.gstCents,
          })),
        },
      },
      select: { id: true },
    })

    // Update invoice to CLAIMED
    await prisma.invInvoice.update({
      where: { id: invoice.id },
      data: { status: 'CLAIMED' },
    })

    // REQ-017: Audit log — no PII
    await createAuditLog({
      userId,
      action: 'claim.batch-generated',
      resource: 'claim',
      resourceId: claim.id,
      after: { claimReference, invoiceId: invoice.id, claimedCents },
    })

    // Fire-and-forget: automation rules (e.g. notify staff)
    void processEvent('lotus-pm.claims.created', {
      claimId: claim.id,
      invoiceId: invoice.id,
      participantId: invoice.participantId,
      claimedCents,
    }).catch(() => {
      // Automation failures must not block claim generation
    })

    const participantName = invoice.participant
      ? `${invoice.participant.firstName} ${invoice.participant.lastName}`
      : 'Unknown participant'

    results.push({
      claimId: claim.id,
      claimReference,
      participantName,
      totalCents: claimedCents,
      lineCount: invoice.lines.length,
    })
  }

  return { claims: results, invoicesProcessed: invoices.length }
}
