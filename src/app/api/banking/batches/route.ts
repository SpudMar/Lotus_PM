import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listPaymentBatches, createPaymentBatch } from '@/lib/modules/banking/payment-batches'
import { createBatchSchema, batchStatusSchema } from '@/lib/modules/banking/payment-batches-validation'
import { paginationSchema, paginatedResponse } from '@/lib/modules/core/validation'
import { ZodError } from 'zod'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('banking:read')

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const { page, pageSize } = paginationSchema.parse(searchParams)
    const status = batchStatusSchema.parse(request.nextUrl.searchParams.get('status') ?? undefined)

    const { data, total } = await listPaymentBatches({ page, pageSize, status })
    return NextResponse.json(paginatedResponse(data, total, page, pageSize))
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
    const session = await requirePermission('banking:write')
    const body = await request.json()
    const input = createBatchSchema.parse(body)

    const scheduledDate = input.scheduledDate ? new Date(input.scheduledDate) : undefined

    const batch = await createPaymentBatch(
      { description: input.description, scheduledDate },
      session.user.id,
    )

    return NextResponse.json({ data: batch }, { status: 201 })
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
