/**
 * Invoice Validation Engine -- WS-F2 + WS-F6
 *
 * Runs automated checks before invoice approval.
 * Returns structured errors and warnings.
 * Errors block approval (unless force=true). Warnings are informational only.
 *
 * Checks:
 *   1. PARTICIPANT_INACTIVE  -- participant must be active
 *   2. PROVIDER_INACTIVE     -- provider must be active
 *   3. BLOCKING_FLAG         -- unresolved BLOCKING flags on participant/provider
 *   4. INSUFFICIENT_BUDGET   -- invoice total must not exceed budget line balance
 *   5. CATEGORY_MISMATCH     -- invoice line category should match budget line category (warn)
 *   6. PRICE_EXCEEDED        -- line item price must not exceed NDIS price guide cap
 *   7. DUPLICATE_INVOICE     -- same invoice number + provider must not already exist
 *   8. ADVISORY_FLAG         -- ADVISORY flags on participant/provider (warn only)
 *   9. SA_COMPLIANCE         -- advisory: ITEM_NOT_IN_SA, PRICE_ABOVE_SA_RATE, SA_BUDGET_EXCEEDED (warn only)
 */

import { prisma } from '@/lib/db'
import { validateLineItemPrice } from '@/lib/modules/price-guide/price-guide'
import { getActiveFlags, FlagSeverity } from '@/lib/modules/crm/flags'

// -- Public Types -----------------------------------------------------------

export interface ValidationWarning {
  code: string
  message: string
  lineId?: string
}

export interface ValidationError {
  code: string
  message: string
  lineId?: string
}

export interface InvoiceValidationResult {
  valid: boolean
  warnings: ValidationWarning[]
  errors: ValidationError[]
}

// -- Internal helpers -------------------------------------------------------

type PricingRegion = 'NON_REMOTE' | 'REMOTE' | 'VERY_REMOTE'

// -- Main validation function -----------------------------------------------

/**
 * Run all validation checks against an invoice before approval.
 * Returns valid=true only when there are zero errors.
 * All checks are run independently so we collect ALL issues at once.
 */
export async function validateInvoiceForApproval(
  invoiceId: string
): Promise<InvoiceValidationResult> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Fetch full invoice with all required relations
  const invoice = await prisma.invInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      lines: {
        include: {
          budgetLine: true,
        },
      },
      participant: true,
      provider: true,
    },
  })

  // -- Check 1: Participant active -------------------------------------------
  if (invoice.participant !== null && invoice.participant.isActive === false) {
    errors.push({
      code: 'PARTICIPANT_INACTIVE',
      message: `Participant ${invoice.participant.firstName} ${invoice.participant.lastName} is not active`,
    })
  }

  // -- Check 2: Provider active ----------------------------------------------
  if (invoice.provider !== null && invoice.provider.isActive === false) {
    errors.push({
      code: 'PROVIDER_INACTIVE',
      message: `Provider ${invoice.provider.name} is not active`,
    })
  }

  // -- Checks 3 & 8: Flags (BLOCKING errors + ADVISORY warnings) ------------
  try {
    const activeFlags = await getActiveFlags({
      participantId: invoice.participantId ?? undefined,
      providerId: invoice.providerId ?? undefined,
    })

    for (const flag of activeFlags) {
      if (flag.severity === FlagSeverity.BLOCKING) {
        errors.push({
          code: 'BLOCKING_FLAG',
          message: flag.reason,
        })
      } else if (flag.severity === FlagSeverity.ADVISORY) {
        warnings.push({
          code: 'ADVISORY_FLAG',
          message: flag.reason,
        })
      }
    }
  } catch {
    // Flag service failure should not block approval
    warnings.push({
      code: 'ADVISORY_FLAG',
      message: 'Unable to retrieve active flags -- manual review recommended',
    })
  }

  // -- Check 4: Budget availability -----------------------------------------
  const lineBudgetGroups = new Map<
    string,
    { allocatedCents: number; spentCents: number; lineTotal: number }
  >()

  for (const line of invoice.lines) {
    if (line.budgetLine !== null && line.budgetLineId !== null) {
      const existing = lineBudgetGroups.get(line.budgetLineId)
      if (existing !== undefined) {
        existing.lineTotal += line.totalCents
      } else {
        lineBudgetGroups.set(line.budgetLineId, {
          allocatedCents: line.budgetLine.allocatedCents,
          spentCents: line.budgetLine.spentCents,
          lineTotal: line.totalCents,
        })
      }
    }
  }

  for (const [budgetLineId, budget] of lineBudgetGroups) {
    const remainingCents = budget.allocatedCents - budget.spentCents
    if (budget.lineTotal > remainingCents) {
      errors.push({
        code: 'INSUFFICIENT_BUDGET',
        message: `Invoice lines totalling $${(budget.lineTotal / 100).toFixed(2)} exceed available budget of $${(remainingCents / 100).toFixed(2)} on budget line ${budgetLineId}`,
      })
    }
  }

  // -- Check 5: Category alignment ------------------------------------------
  for (const line of invoice.lines) {
    if (line.budgetLine !== null && line.categoryCode !== line.budgetLine.categoryCode) {
      warnings.push({
        code: 'CATEGORY_MISMATCH',
        message: `Invoice line category "${line.categoryCode}" does not match budget line category "${line.budgetLine.categoryCode}"`,
        lineId: line.id,
      })
    }
  }

  // -- Checks 6 (PRICE_EXCEEDED) + PRICE_GUIDE_UNAVAILABLE ------------------
  const pricingRegion: PricingRegion =
    (invoice.participant?.pricingRegion as PricingRegion | undefined) ?? 'NON_REMOTE'

  for (const line of invoice.lines) {
    if (!line.supportItemCode || line.supportItemCode.trim() === '') {
      continue
    }

    try {
      const result = await validateLineItemPrice(
        line.supportItemCode,
        line.serviceDate,
        line.unitPriceCents,
        pricingRegion
      )

      if (!result.valid) {
        const capStr =
          result.capCents !== null
            ? ` (cap: $${(result.capCents / 100).toFixed(2)})`
            : ''
        errors.push({
          code: 'PRICE_EXCEEDED',
          message: result.message ?? `Line item ${line.supportItemCode} exceeds price guide cap${capStr}`,
          lineId: line.id,
        })
      }
    } catch {
      warnings.push({
        code: 'PRICE_GUIDE_UNAVAILABLE',
        message: `Price guide unavailable -- could not validate line item ${line.supportItemCode}. Import the NDIS Price Guide in Settings to enable price validation.`,
        lineId: line.id,
      })
      break
    }
  }

  // -- Check 7: Duplicate invoice -------------------------------------------
  if (invoice.providerId !== null) {
    const duplicate = await prisma.invInvoice.findFirst({
      where: {
        id: { not: invoiceId },
        invoiceNumber: invoice.invoiceNumber,
        providerId: invoice.providerId,
        status: { not: 'REJECTED' },
        deletedAt: null,
      },
      select: { id: true, status: true },
    })

    if (duplicate !== null) {
      errors.push({
        code: 'DUPLICATE_INVOICE',
        message: `Invoice number "${invoice.invoiceNumber}" from this provider already exists (status: ${duplicate.status})`,
      })
    }
  }

  // -- Check 9: Service Agreement compliance (advisory warnings) ------------
  // If an active SA exists for this provider + participant, check compliance.
  // All failures here are ADVISORY (not blocking) -- rates can change informally.
  if (invoice.participantId !== null && invoice.providerId !== null) {
    try {
      const activeAgreement = await prisma.saServiceAgreement.findFirst({
        where: {
          participantId: invoice.participantId,
          providerId: invoice.providerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          rateLines: true,
          budgetAllocations: {
            select: { allocatedCents: true },
          },
        },
      })

      if (activeAgreement !== null) {
        // Check each invoice line against SA rate lines
        for (const line of invoice.lines) {
          if (!line.supportItemCode) continue

          const matchingRateLine = activeAgreement.rateLines.find(
            (rl) => rl.supportItemCode === line.supportItemCode
          )

          if (matchingRateLine === undefined) {
            warnings.push({
              code: 'ITEM_NOT_IN_SA',
              message: `Support item ${line.supportItemCode} is not listed in the active service agreement (${activeAgreement.agreementRef})`,
              lineId: line.id,
            })
          } else if (line.unitPriceCents > matchingRateLine.agreedRateCents) {
            warnings.push({
              code: 'PRICE_ABOVE_SA_RATE',
              message: `Unit price $${(line.unitPriceCents / 100).toFixed(2)} exceeds agreed SA rate of $${(matchingRateLine.agreedRateCents / 100).toFixed(2)} for item ${line.supportItemCode} (SA: ${activeAgreement.agreementRef})`,
              lineId: line.id,
            })
          }
        }

        // Check if invoice total would exceed SA budget allocations
        const totalSaAllocatedCents = activeAgreement.budgetAllocations.reduce(
          (sum, a) => sum + a.allocatedCents,
          0
        )

        if (totalSaAllocatedCents > 0) {
          const existingTotal = await prisma.invInvoice.aggregate({
            where: {
              participantId: invoice.participantId,
              providerId: invoice.providerId,
              status: { in: ['APPROVED', 'CLAIMED'] },
              id: { not: invoiceId },
              deletedAt: null,
            },
            _sum: { totalCents: true },
          })

          const existingSpend = existingTotal._sum.totalCents ?? 0
          const invoiceTotal = invoice.lines.reduce((sum, l) => sum + l.totalCents, 0)

          if (existingSpend + invoiceTotal > totalSaAllocatedCents) {
            warnings.push({
              code: 'SA_BUDGET_EXCEEDED',
              message: `Invoice would bring total spend ($${((existingSpend + invoiceTotal) / 100).toFixed(2)}) above SA budget allocation of $${(totalSaAllocatedCents / 100).toFixed(2)} for agreement ${activeAgreement.agreementRef}`,
            })
          }
        }
      }
    } catch {
      // SA compliance check failure must not block invoice approval
      warnings.push({
        code: 'ADVISORY_FLAG',
        message: 'Unable to check service agreement compliance -- manual review recommended',
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
