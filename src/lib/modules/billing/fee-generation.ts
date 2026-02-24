/**
 * PM Fee Generation — monthly billing logic for plan management fees.
 *
 * Generates PmFeeCharge records for all active participants with active plans,
 * based on active MONTHLY fee schedules. Idempotent: skips if charge already
 * exists for a given schedule + participant + period.
 *
 * Also supports generating ClmClaim records from PENDING charges.
 *
 * All amounts in cents (integers) — REQ: never floats for money.
 * REQ-017: No PII in audit logs.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonthlyFeeResult {
  chargesCreated: number
  skipped: number
  participants: number
}

export interface ClaimGenerationResult {
  claimsGenerated: number
}

// ─── Claim Reference ─────────────────────────────────────────────────────────

/** Generate next sequential claim reference in CLM-YYYYMMDD-XXXX format. */
async function nextFeeClaimReference(): Promise<string> {
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

// ─── Monthly Fee Generation ──────────────────────────────────────────────────

/**
 * Generate monthly fee charges for all active participants with active plans.
 *
 * For each active MONTHLY fee schedule:
 *   - Find all active participants with at least one ACTIVE plan
 *   - Skip if a charge already exists for this period (idempotent)
 *   - Check for participant override rate, else use schedule default
 *   - Create PmFeeCharge record
 *
 * @param month  1-12
 * @param year   e.g. 2026
 * @param userId Staff user ID for audit log
 */
export async function generateMonthlyFees(
  month: number,
  year: number,
  userId: string
): Promise<MonthlyFeeResult> {
  // Calculate period boundaries
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999) // last day of month

  // Find all active MONTHLY fee schedules
  const schedules = await prisma.pmFeeSchedule.findMany({
    where: {
      isActive: true,
      frequency: 'MONTHLY',
      deletedAt: null,
    },
    include: {
      overrides: {
        where: { deletedAt: null },
        select: { participantId: true, rateCents: true },
      },
    },
  })

  if (schedules.length === 0) {
    return { chargesCreated: 0, skipped: 0, participants: 0 }
  }

  // Find all active participants who have at least one ACTIVE plan
  const participants = await prisma.crmParticipant.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      plans: {
        some: { status: 'ACTIVE' },
      },
    },
    select: { id: true },
  })

  if (participants.length === 0) {
    return { chargesCreated: 0, skipped: 0, participants: 0 }
  }

  let chargesCreated = 0
  let skipped = 0

  for (const schedule of schedules) {
    // Build override lookup for this schedule
    const overrideMap = new Map<string, number>()
    for (const ov of schedule.overrides) {
      overrideMap.set(ov.participantId, ov.rateCents)
    }

    for (const participant of participants) {
      // Check if charge already exists for this period (idempotent)
      const existing = await prisma.pmFeeCharge.findUnique({
        where: {
          feeScheduleId_participantId_periodStart: {
            feeScheduleId: schedule.id,
            participantId: participant.id,
            periodStart,
          },
        },
        select: { id: true },
      })

      if (existing) {
        skipped++
        continue
      }

      // Determine rate: override > schedule default
      const rateCents = overrideMap.get(participant.id) ?? schedule.rateCents

      await prisma.pmFeeCharge.create({
        data: {
          feeScheduleId: schedule.id,
          participantId: participant.id,
          periodStart,
          periodEnd,
          amountCents: rateCents,
          generatedById: userId,
        },
      })

      chargesCreated++
    }
  }

  // Audit log — no PII (REQ-017)
  await createAuditLog({
    userId,
    action: 'billing.monthly-fees-generated',
    resource: 'billing',
    resourceId: `${year}-${String(month).padStart(2, '0')}`,
    after: {
      month,
      year,
      chargesCreated,
      skipped,
      participantCount: participants.length,
      scheduleCount: schedules.length,
    },
  })

  return {
    chargesCreated,
    skipped,
    participants: participants.length,
  }
}

// ─── Claim Generation from Fees ──────────────────────────────────────────────

/**
 * Generate ClmClaim for each PENDING charge.
 *
 * For each charge:
 *   - Create a ClmClaim with a single line for the PM fee
 *   - Update charge status to CLAIMED and set claimId
 *
 * Note: PM fee claims use the fee schedule supportItemCode as the claim line
 * support item. The invoiceId on ClmClaim is set to the charge ID as a
 * reference since PM fees do not originate from a traditional invoice.
 *
 * @param chargeIds IDs of PmFeeCharge records to generate claims for
 * @param userId    Staff user ID for audit log
 */
export async function generateClaimsForFees(
  chargeIds: string[],
  userId: string
): Promise<ClaimGenerationResult> {
  if (chargeIds.length === 0) {
    return { claimsGenerated: 0 }
  }

  // Load all charges with schedule info
  const charges = await prisma.pmFeeCharge.findMany({
    where: {
      id: { in: chargeIds },
      status: 'PENDING',
      deletedAt: null,
    },
    include: {
      feeSchedule: {
        select: { name: true, supportItemCode: true },
      },
    },
  })

  let claimsGenerated = 0

  for (const charge of charges) {
    const claimReference = await nextFeeClaimReference()

    // Create claim with a single line for the PM fee
    const claim = await prisma.clmClaim.create({
      data: {
        claimReference,
        invoiceId: charge.id, // reference to fee charge (no traditional invoice)
        participantId: charge.participantId,
        claimedCents: charge.amountCents,
        lines: {
          create: [
            {
              supportItemCode: charge.feeSchedule.supportItemCode,
              supportItemName: charge.feeSchedule.name,
              categoryCode: '14', // Plan Management category
              serviceDate: charge.periodStart,
              quantity: 1,
              unitPriceCents: charge.amountCents,
              totalCents: charge.amountCents,
              gstCents: 0,
            },
          ],
        },
      },
      select: { id: true },
    })

    // Update charge: mark as CLAIMED, link to claim
    await prisma.pmFeeCharge.update({
      where: { id: charge.id },
      data: {
        status: 'CLAIMED',
        claimId: claim.id,
      },
    })

    // Audit log — no PII (REQ-017)
    await createAuditLog({
      userId,
      action: 'billing.fee-claim-generated',
      resource: 'claim',
      resourceId: claim.id,
      after: {
        claimReference,
        chargeId: charge.id,
        amountCents: charge.amountCents,
        supportItemCode: charge.feeSchedule.supportItemCode,
      },
    })

    claimsGenerated++
  }

  return { claimsGenerated }
}
