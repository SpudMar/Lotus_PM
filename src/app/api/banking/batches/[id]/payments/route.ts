import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { addPaymentsToBatch, removePaymentFromBatch } from '@/lib/modules/banking/payment-batches'
import { addPaymentsSchema, removePaymentSchema } from '@/lib/modules/banking/payment-batches-validation'
import { ZodError } from 'zod'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:write')
    const { id } = await params
    const body = await request.json()
    const input = addPaymentsSchema.parse(body)

    await addPaymentsToBatch(id, input.paymentIds, session.user.id)

    return NextResponse.json({ data: { added: input.paymentIds.length } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Payment batch not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json({ error: 'Batch ABA already generated — cannot add payments', code: 'INVALID_STATUS' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'PAYMENTS_ALREADY_BATCHED') {
      return NextResponse.json({ error: 'One or more payments are already in another batch', code: 'PAYMENTS_ALREADY_BATCHED' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'PAYMENTS_NOT_FOUND') {
      return NextResponse.json({ error: 'One or more payments not found', code: 'PAYMENTS_NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_PAYMENT_STATUS') {
      return NextResponse.json({ error: 'One or more payments are not in an eligible status', code: 'INVALID_PAYMENT_STATUS' }, { status: 409 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('banking:write')
    const { id } = await params
    const body = await request.json()
    const input = removePaymentSchema.parse(body)

    await removePaymentFromBatch(id, input.paymentId, session.user.id)

    return NextResponse.json({ data: { removed: true } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Payment batch not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json({ error: 'Batch ABA already generated — cannot remove payments', code: 'INVALID_STATUS' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'PAYMENT_NOT_IN_BATCH') {
      return NextResponse.json({ error: 'Payment is not in this batch', code: 'PAYMENT_NOT_IN_BATCH' }, { status: 404 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
