/**
 * GET /api/plans/[id]/budget-lines — list with SA committed totals
 * POST /api/plans/[id]/budget-lines — create a new budget line
 *
 * WS-F6: Used to display the "Committed (SA)" column in plan budget summaries.
 * PLAN_MANAGER+ access.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { createAuditLog } from '@/lib/modules/core/audit'

const createBudgetLineSchema = z.object({
  categoryCode: z.string().min(1).max(10),
  categoryName: z.string().min(1).max(200),
  allocatedCents: z.number().int().min(0),
})

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id } = await params
    const body = await request.json()
    const input = createBudgetLineSchema.parse(body)

    const plan = await prisma.planPlan.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const line = await prisma.planBudgetLine.create({
      data: {
        planId: id,
        categoryCode: input.categoryCode,
        categoryName: input.categoryName,
        allocatedCents: input.allocatedCents,
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'budget_line.created',
      resource: 'budget_line',
      resourceId: line.id,
      after: { planId: id, categoryCode: line.categoryCode, allocatedCents: line.allocatedCents },
    })

    return NextResponse.json({ data: line }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
