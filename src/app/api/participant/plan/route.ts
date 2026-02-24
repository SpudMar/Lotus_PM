/**
 * GET /api/participant/plan
 * Returns the authenticated participant's active NDIS plan with budget summary.
 *
 * REQ-018: Participant app — own data only, scoped by JWT.
 * All amounts in cents per project conventions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getParticipantFromToken } from '@/lib/modules/participant-api/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate
  const participant = getParticipantFromToken(req)
  if (!participant) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // 2. Query active plan with budget lines
  const plan = await prisma.planPlan.findFirst({
    where: {
      participantId: participant.participantId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      reviewDate: true,
      status: true,
      budgetLines: {
        select: {
          id: true,
          categoryCode: true,
          categoryName: true,
          allocatedCents: true,
          spentCents: true,
          reservedCents: true,
        },
        orderBy: { categoryCode: 'asc' },
      },
    },
  })

  if (!plan) {
    return NextResponse.json(
      { error: 'No active plan found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  // 3. Compute derived fields
  const budgetLines = plan.budgetLines.map((line) => {
    const availableCents = line.allocatedCents - line.spentCents - line.reservedCents
    const usedPercent =
      line.allocatedCents > 0
        ? Math.round((line.spentCents / line.allocatedCents) * 100)
        : 0

    return {
      id: line.id,
      categoryCode: line.categoryCode,
      categoryName: line.categoryName,
      allocatedCents: line.allocatedCents,
      spentCents: line.spentCents,
      reservedCents: line.reservedCents,
      availableCents: Math.max(0, availableCents),
      usedPercent,
    }
  })

  return NextResponse.json({
    data: {
      id: plan.id,
      startDate: plan.startDate.toISOString(),
      endDate: plan.endDate.toISOString(),
      reviewDate: plan.reviewDate?.toISOString() ?? null,
      status: plan.status,
      budgetLines,
    },
  })
}
