import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getPlan, updatePlan, getPlanBudgetSummary } from '@/lib/modules/plans/plans'
import { updatePlanSchema } from '@/lib/modules/plans/validation'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')
    const { id } = await params
    const includeBudget = request.nextUrl.searchParams.get('includeBudget') === 'true'

    const plan = await getPlan(id)
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (includeBudget) {
      const budgetSummary = await getPlanBudgetSummary(id)
      return NextResponse.json({ data: { ...plan, budgetSummary } })
    }

    return NextResponse.json({ data: plan })
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id } = await params
    const body = await request.json()
    const input = updatePlanSchema.parse(body)

    const plan = await updatePlan(id, input, session.user.id)
    return NextResponse.json({ data: plan })
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
