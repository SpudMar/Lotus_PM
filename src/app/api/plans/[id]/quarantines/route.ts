import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { listQuarantinesSchema } from '@/lib/modules/fund-quarantine/validation'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/plans/[id]/quarantines
 * Returns all quarantines for budget lines belonging to a given plan, grouped by provider.
 *
 * We query via budgetLines on the plan to avoid the planId mismatch —
 * the listQuarantines include only selects a subset of BudgetLine fields.
 */
export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')
    const { id: planId } = await params

    const statusParam = request.nextUrl.searchParams.get('status') as
      | 'ACTIVE'
      | 'RELEASED'
      | 'EXPIRED'
      | null

    const statusFilter = listQuarantinesSchema.shape.status.optional().parse(statusParam ?? undefined)

    // Fetch quarantines scoped to this plan's budget lines directly via Prisma
    const quarantines = await prisma.fqQuarantine.findMany({
      where: {
        budgetLine: { planId },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        provider: { select: { id: true, name: true } },
        serviceAgreement: { select: { id: true, agreementRef: true } },
        budgetLine: { select: { id: true, categoryCode: true, categoryName: true, allocatedCents: true, planId: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Group by providerId
    const grouped = quarantines.reduce<Record<string, typeof quarantines>>((acc, q) => {
      const key = q.providerId
      if (!acc[key]) acc[key] = []
      acc[key].push(q)
      return acc
    }, {})

    return NextResponse.json({ data: grouped })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
