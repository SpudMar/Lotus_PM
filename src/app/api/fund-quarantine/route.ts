import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listQuarantines, createQuarantine } from '@/lib/modules/fund-quarantine/fund-quarantine'
import { listQuarantinesSchema, createQuarantineSchema } from '@/lib/modules/fund-quarantine/validation'
import { ZodError } from 'zod'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const filters = listQuarantinesSchema.parse({
      budgetLineId: searchParams.budgetLineId,
      providerId: searchParams.providerId,
      serviceAgreementId: searchParams.serviceAgreementId,
      status: searchParams.status,
    })
    const quarantines = await listQuarantines(filters)
    return NextResponse.json({ data: quarantines })
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
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const body = await request.json()
    const input = createQuarantineSchema.parse(body)
    const quarantine = await createQuarantine(input, session.user.id)
    return NextResponse.json({ data: quarantine }, { status: 201 })
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
    if (error instanceof Error && error.message === 'INSUFFICIENT_BUDGET_CAPACITY') {
      return NextResponse.json({ error: 'Insufficient budget capacity', code: 'INSUFFICIENT_BUDGET_CAPACITY' }, { status: 422 })
    }
    if (error instanceof Error && error.message === 'BUDGET_LINE_NOT_FOUND') {
      return NextResponse.json({ error: 'Budget line not found', code: 'BUDGET_LINE_NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
