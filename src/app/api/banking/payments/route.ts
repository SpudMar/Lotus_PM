import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listPayments, createPayment, createPaymentsFromClaims } from '@/lib/modules/banking/banking'
import { createPaymentSchema } from '@/lib/modules/banking/validation'
import { paginationSchema, paginatedResponse } from '@/lib/modules/core/validation'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('banking:read')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const { page, pageSize } = paginationSchema.parse(searchParams)
    const status = request.nextUrl.searchParams.get('status') ?? undefined
    const abaFileId = request.nextUrl.searchParams.get('abaFileId') ?? undefined

    const { data, total } = await listPayments({ page, pageSize, status, abaFileId })
    return NextResponse.json(paginatedResponse(data, total, page, pageSize))
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:write')
    const body = await request.json()

    // Bulk creation from claim IDs
    if (body.action === 'bulk-create') {
      const claimIds = body.claimIds as string[]
      if (!Array.isArray(claimIds) || claimIds.length === 0) {
        return NextResponse.json({ error: 'claimIds array is required', code: 'BAD_REQUEST' }, { status: 400 })
      }
      const created = await createPaymentsFromClaims(claimIds, session.user.id)
      return NextResponse.json({ data: { created: created.length, paymentIds: created } }, { status: 201 })
    }

    // Single payment creation
    const input = createPaymentSchema.parse(body)
    const payment = await createPayment(input, session.user.id)
    return NextResponse.json({ data: payment }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message.includes('Claim')) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
