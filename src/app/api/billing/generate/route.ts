/**
 * POST /api/billing/generate — Trigger monthly fee generation
 *
 * Generates PmFeeCharge records for all active participants with active plans.
 * Optionally generates ClmClaim records for all newly created charges.
 *
 * RBAC: billing:write — PLAN_MANAGER and GLOBAL_ADMIN
 *
 * Request body:
 *   { month: number (1-12), year: number, autoGenerateClaims?: boolean }
 *
 * Response:
 *   { chargesCreated: number, skipped: number, participants: number, claimsGenerated?: number }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { generateMonthlyFees, generateClaimsForFees } from '@/lib/modules/billing/fee-generation'
import { createAuditLog } from '@/lib/modules/core/audit'
import { prisma } from '@/lib/db'

// ─── Validation ──────────────────────────────────────────────────────────────

const generateFeesSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  autoGenerateClaims: z.boolean().optional().default(false),
})

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('billing:write')
    const body = await request.json()
    const input = generateFeesSchema.parse(body)

    // Generate monthly fee charges
    const feeResult = await generateMonthlyFees(input.month, input.year, session.user.id)

    let claimsGenerated: number | undefined

    // Optionally generate claims for newly created charges
    if (input.autoGenerateClaims && feeResult.chargesCreated > 0) {
      // Fetch the PENDING charges we just created for this period
      const periodStart = new Date(input.year, input.month - 1, 1)
      const pendingCharges = await prisma.pmFeeCharge.findMany({
        where: {
          status: 'PENDING',
          periodStart,
          deletedAt: null,
        },
        select: { id: true },
      })

      if (pendingCharges.length > 0) {
        const claimResult = await generateClaimsForFees(
          pendingCharges.map((c) => c.id),
          session.user.id
        )
        claimsGenerated = claimResult.claimsGenerated
      }
    }

    // Audit log — no PII (REQ-017)
    await createAuditLog({
      userId: session.user.id,
      action: 'billing.generate-triggered',
      resource: 'billing',
      resourceId: `${input.year}-${String(input.month).padStart(2, '0')}`,
      after: {
        month: input.month,
        year: input.year,
        autoGenerateClaims: input.autoGenerateClaims,
        chargesCreated: feeResult.chargesCreated,
        skipped: feeResult.skipped,
        participants: feeResult.participants,
        claimsGenerated,
      },
    })

    return NextResponse.json({
      data: {
        chargesCreated: feeResult.chargesCreated,
        skipped: feeResult.skipped,
        participants: feeResult.participants,
        ...(claimsGenerated !== undefined && { claimsGenerated }),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
