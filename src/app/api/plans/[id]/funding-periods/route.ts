import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listFundingPeriods, createFundingPeriod, createFundingPeriodSchema } from '@/lib/modules/plans/funding-periods'
import { ZodError } from 'zod'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')
    const { id: planId } = await params
    const periods = await listFundingPeriods(planId)
    return NextResponse.json({ data: periods })
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
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id: planId } = await params
    const body = await request.json()
    const input = createFundingPeriodSchema.parse({ ...body, planId })

    const period = await createFundingPeriod(input, session.user.id)
    return NextResponse.json({ data: period }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    if (error instanceof Error && (
      error.message === 'Plan not found' ||
      error.message === 'Funding period dates must fall within the plan date range' ||
      error.message === 'Funding period overlaps with an existing period for this plan'
    )) {
      return NextResponse.json({ error: error.message, code: 'BUSINESS_RULE_VIOLATION' }, { status: 422 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
