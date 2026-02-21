import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getBatch, submitBatch } from '@/lib/modules/claims/claims'
import { submitBatchSchema } from '@/lib/modules/claims/validation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('claims:read')
    const { id } = await params
    const batch = await getBatch(id)

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ data: batch })
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
    const { id } = await params
    const body = await request.json()
    const action = body.action as string

    if (action === 'submit') {
      const session = await requirePermission('claims:submit')
      const input = submitBatchSchema.parse(body)
      const batch = await submitBatch(id, input, session.user.id)
      return NextResponse.json({ data: batch })
    }

    return NextResponse.json({ error: 'Invalid action', code: 'BAD_REQUEST' }, { status: 400 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && (error.message.includes('Batch') || error.message.includes('Only'))) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
