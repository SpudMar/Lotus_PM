/**
 * POST /api/claims/bulk-generate — Generate monthly claims for approved invoices
 *
 * Finds all approved invoices within a date range that don't yet have claims,
 * then calls generateClaimBatch() to create claims for each.
 * Optionally groups claims into a batch via createBatch().
 *
 * RBAC: claims:write — PLAN_MANAGER and GLOBAL_ADMIN
 *
 * Request body:
 *   {
 *     startDate: string (ISO),
 *     endDate: string (ISO),
 *     participantIds?: string[],
 *     autoBatch?: boolean
 *   }
 *
 * Response:
 *   { claimsGenerated: number, batchId?: string, skipped: number }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { generateClaimBatch } from '@/lib/modules/claims/claim-generation'
import { createBatch } from '@/lib/modules/claims/claims'
import { createAuditLog } from '@/lib/modules/core/audit'
import { prisma } from '@/lib/db'

// ─── Validation ──────────────────────────────────────────────────────────────

const bulkGenerateSchema = z.object({
  startDate: z.string().datetime({ message: 'startDate must be a valid ISO date string' }),
  endDate: z.string().datetime({ message: 'endDate must be a valid ISO date string' }),
  participantIds: z.array(z.string()).optional(),
  autoBatch: z.boolean().optional().default(false),
})

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('claims:write')
    const body = await request.json()
    const input = bulkGenerateSchema.parse(body)

    const startDate = new Date(input.startDate)
    const endDate = new Date(input.endDate)

    // Validate date range
    if (startDate >= endDate) {
      return NextResponse.json(
        { error: 'startDate must be before endDate', code: 'BAD_REQUEST' },
        { status: 400 },
      )
    }

    // Find all approved invoices in the date range that don't have existing claims
    const whereClause: Record<string, unknown> = {
      status: 'APPROVED',
      deletedAt: null,
      invoiceDate: {
        gte: startDate,
        lte: endDate,
      },
      // Exclude invoices that already have claims
      claims: {
        none: {},
      },
    }

    // Optional participant filter
    if (input.participantIds && input.participantIds.length > 0) {
      whereClause.participantId = { in: input.participantIds }
    }

    const eligibleInvoices = await prisma.invInvoice.findMany({
      where: whereClause,
      select: { id: true },
    })

    const invoiceIds = eligibleInvoices.map((inv) => inv.id)
    let claimsGenerated = 0
    let skipped = 0
    let batchId: string | undefined

    if (invoiceIds.length === 0) {
      // No eligible invoices — everything was already claimed or none in range
      skipped = 0
    } else {
      // Generate claims for all eligible invoices
      const result = await generateClaimBatch(invoiceIds, session.user.id)
      claimsGenerated = result.claims.length

      // Optionally group claims into a batch
      if (input.autoBatch && result.claims.length > 0) {
        const claimIds = result.claims.map((c) => c.claimId)
        const batch = await createBatch(claimIds, `Monthly claim batch ${input.startDate} to ${input.endDate}`, session.user.id)
        batchId = batch.id
      }
    }

    // Count how many were skipped (already had claims)
    const totalApproved = await prisma.invInvoice.count({
      where: {
        status: { in: ['APPROVED', 'CLAIMED'] },
        deletedAt: null,
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
        ...(input.participantIds && input.participantIds.length > 0
          ? { participantId: { in: input.participantIds } }
          : {}),
      },
    })
    skipped = totalApproved - claimsGenerated

    // Audit log — no PII (REQ-017)
    await createAuditLog({
      userId: session.user.id,
      action: 'claims.bulk-generated',
      resource: 'claims',
      resourceId: batchId ?? 'bulk',
      after: {
        startDate: input.startDate,
        endDate: input.endDate,
        claimsGenerated,
        skipped,
        autoBatch: input.autoBatch,
        batchId,
        participantFilter: input.participantIds?.length ?? 0,
      },
    })

    return NextResponse.json({
      data: {
        claimsGenerated,
        skipped,
        ...(batchId !== undefined && { batchId }),
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
    if (error instanceof Error && error.message.includes('Invoice')) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
