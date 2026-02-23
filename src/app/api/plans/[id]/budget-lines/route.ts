/**
 * GET /api/plans/[id]/budget-lines
 *
 * Returns budget lines for a plan with saCommittedCents - total committed to SAs per line.
 * WS-F6: Used to display the "Committed (SA)" column in plan budget summaries.
 *
 * PLAN_MANAGER+ read access.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')
    const { id } = await params

    const plan = await prisma.planPlan.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const budgetLines = await prisma.planBudgetLine.findMany({
      where: { planId: id },
      include: {
        saAllocations: {
          select: { allocatedCents: true },
        },
      },
      orderBy: { categoryCode: 'asc' },
    })

    const data = budgetLines.map((line) => {
      const saCommittedCents = line.saAllocations.reduce(
        (sum, a) => sum + a.allocatedCents,
        0
      )
      const remainingCents = line.allocatedCents - line.spentCents - saCommittedCents

      return {
        id: line.id,
        categoryCode: line.categoryCode,
        categoryName: line.categoryName,
        allocatedCents: line.allocatedCents,
        spentCents: line.spentCents,
        reservedCents: line.reservedCents,
        saCommittedCents,
        remainingCents,
      }
    })

    return NextResponse.json({ data })
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
