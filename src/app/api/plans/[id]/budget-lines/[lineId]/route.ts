/**
 * PUT /api/plans/[id]/budget-lines/[lineId] — update a budget line
 * DELETE /api/plans/[id]/budget-lines/[lineId] — delete a budget line
 *
 * PLAN_MANAGER+ write access.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { updateBudgetLineSchema } from '@/lib/modules/plans/validation'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id, lineId } = await params
    const body = await request.json()
    const input = updateBudgetLineSchema.parse(body)

    // Verify the line belongs to the plan
    const existing = await prisma.planBudgetLine.findFirst({
      where: { id: lineId, planId: id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Budget line not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const line = await prisma.planBudgetLine.update({
      where: { id: lineId },
      data: input,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'budget_line.updated',
      resource: 'budget_line',
      resourceId: lineId,
      before: { allocatedCents: existing.allocatedCents },
      after: { allocatedCents: line.allocatedCents },
    })

    return NextResponse.json({ data: line })
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id, lineId } = await params

    // Verify the line belongs to the plan
    const existing = await prisma.planBudgetLine.findFirst({
      where: { id: lineId, planId: id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Budget line not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Check if the line has any spending or linked records
    if (existing.spentCents > 0 || existing.reservedCents > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a budget line with existing spending or reservations', code: 'HAS_SPENDING' },
        { status: 409 }
      )
    }

    await prisma.planBudgetLine.delete({
      where: { id: lineId },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'budget_line.deleted',
      resource: 'budget_line',
      resourceId: lineId,
      before: { categoryCode: existing.categoryCode, allocatedCents: existing.allocatedCents },
    })

    return NextResponse.json({ data: null, message: 'Budget line deleted' })
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
