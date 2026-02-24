/**
 * Bulk Claim Generation -- creates NDIS claims from a batch of approved invoices.
 *
 * Generates one ClmClaim per invoice. Each ClmClaimLine links back to the source
 * InvInvoiceLine via invoiceLineId and to the source InvInvoice via sourceInvoiceId.
 *
 * After generation, all source invoices are updated to status CLAIMED.
 *
 * This is the automated path; individual claim creation is handled by
 * createClaimFromInvoice() in claims.ts.
 *
 * Wave 3: respects per-line decisions --
 *   - Lines with lineStatus = 'REJECTED' are skipped entirely.
 *   - Lines with lineStatus = 'ADJUSTED' use adjustedAmountCents instead of totalCents.
 *   - Lines with lineStatus = 'APPROVED' or null/PENDING use totalCents.
 *
 * REQ-011: All DB queries use ap-southeast-2.
 * REQ-017: No PII in audit logs.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import { getCumulativeReleasedBudget } from '@/lib/modules/plans/funding-periods'
import { recordStatusTransition } from '@/lib/modules/invoices/status-history'

// Types

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

export interface ClaimPeriodBudgetValidation {
  valid: boolean
  message?: string
}

// Claim reference generation

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

// Main function

/**
 * Generate claims for a list of approved invoice IDs.
 *
 * Validates that every invoice exists and is in APPROVED status before
 * processing. Throws immediately with a descriptive error for validation
 * failures; use the partial-success wrapper in the bulk API route for
 * per-invoice error handling.
 *
 * Wave 3 per-line partial payments:
 *   - Lines with lineStatus='REJECTED' are excluded from the claim.
 *   - Lines with lineStatus='ADJUSTED' have their totalCents overridden by adjustedAmountCents.
 *   - Lines with lineStatus='APPROVED', 'PENDING', or null are included at face value.
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

    // Wave 3: filter out REJECTED lines; use adjustedAmountCents for ADJUSTED lines
    const claimableLines = invoice.lines.filter((l) => l.lineStatus !== 'REJECTED')

    // Calculate total from claimable lines only
    const claimedCents =
      claimableLines.length > 0
        ? claimableLines.reduce((sum, l) => {
            const effectiveCents =
              l.lineStatus === 'ADJUSTED' && l.adjustedAmountCents !== null
                ? l.adjustedAmountCents
                : l.totalCents
            return sum + effectiveCents
          }, 0)
        : invoice.totalCents

    const claim = await prisma.clmClaim.create({
      data: {
        claimReference,
        invoiceId: invoice.id,
        participantId: invoice.participantId,
        claimedCents,
        lines: {
          create: claimableLines.map((line) => {
            const effectiveCents =
              line.lineStatus === 'ADJUSTED' && line.adjustedAmountCents !== null
                ? line.adjustedAmountCents
                : line.totalCents
            return {
              invoiceLineId: line.id,
              sourceInvoiceId: invoice.id,
              supportItemCode: line.supportItemCode,
              supportItemName: line.supportItemName,
              categoryCode: line.categoryCode,
              serviceDate: line.serviceDate,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              totalCents: effectiveCents,
              gstCents: line.gstCents,
            }
          }),
        },
      },
      select: { id: true },
    })

    // Update invoice to CLAIMED
    await prisma.invInvoice.update({
      where: { id: invoice.id },
      data: { status: 'CLAIMED' },
    })

    void recordStatusTransition({
      invoiceId: invoice.id,
      fromStatus: 'APPROVED',
      toStatus: 'CLAIMED',
    })

    // REQ-017: Audit log -- no PII
    await createAuditLog({
      userId,
      action: 'claim.batch-generated',
      resource: 'claim',
      resourceId: claim.id,
      after: {
        claimReference,
        invoiceId: invoice.id,
        claimedCents,
        includedLines: claimableLines.length,
        skippedLines: invoice.lines.length - claimableLines.length,
      },
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
      lineCount: claimableLines.length,
    })
  }

  return { claims: results, invoicesProcessed: invoices.length }
}

// ── Period Budget Validation for Claims (Wave 3) ──────────────────────────────

/**
 * Check whether a claim amount fits within the cumulative released period
 * budget for the invoice's service date categories.
 *
 * This is an advisory check -- it does NOT block claim generation.
 * Consumers can call this before generating claims to surface warnings.
 *
 * @param invoiceId - The invoice to validate against period budgets
 * @returns { valid: boolean, message?: string }
 */
export async function validateClaimAgainstPeriodBudget(
  invoiceId: string
): Promise<ClaimPeriodBudgetValidation> {
  const invoice = await prisma.invInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      planId: true,
      totalCents: true,
      lines: {
        select: {
          categoryCode: true,
          serviceDate: true,
          totalCents: true,
        },
      },
    },
  })

  if (!invoice || !invoice.planId) {
    return { valid: true }
  }

  // Group line totals by category code
  const categoryTotals = new Map<string, { totalCents: number; serviceDate: Date }>()
  for (const line of invoice.lines) {
    const existing = categoryTotals.get(line.categoryCode)
    if (existing) {
      existing.totalCents += line.totalCents
    } else {
      categoryTotals.set(line.categoryCode, {
        totalCents: line.totalCents,
        serviceDate: line.serviceDate,
      })
    }
  }

  // Check each category against cumulative released budget
  for (const [categoryCode, data] of categoryTotals) {
    const releasedBudget = await getCumulativeReleasedBudget(
      invoice.planId,
      categoryCode,
      data.serviceDate,
    )

    // If no period budgets exist for this category, skip (periods not set up)
    if (releasedBudget === 0) continue

    // Sum existing claimed amounts for this category and plan
    const existingClaimed = await prisma.clmClaimLine.aggregate({
      where: {
        categoryCode,
        claim: {
          invoice: {
            planId: invoice.planId,
            deletedAt: null,
          },
          status: { not: 'REJECTED' },
        },
      },
      _sum: { totalCents: true },
    })

    const existingSpent = existingClaimed._sum.totalCents ?? 0

    if (existingSpent + data.totalCents > releasedBudget) {
      return {
        valid: false,
        message: `Claim amount $${(data.totalCents / 100).toFixed(2)} for category ${categoryCode} would exceed cumulative released period budget of $${(releasedBudget / 100).toFixed(2)} (already claimed: $${(existingSpent / 100).toFixed(2)})`,
      }
    }
  }

  return { valid: true }
}
