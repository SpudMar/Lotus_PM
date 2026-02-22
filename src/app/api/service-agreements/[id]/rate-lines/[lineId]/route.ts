import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { updateRateLine, deleteRateLine } from '@/lib/modules/service-agreements/service-agreements'
import { updateRateLineSchema } from '@/lib/modules/service-agreements/validation'
import { ZodError } from 'zod'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const { lineId } = await params
    const body = await request.json()
    const input = updateRateLineSchema.parse(body)
    const updated = await updateRateLine(lineId, input, session.user.id)
    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Rate line not found') {
      return NextResponse.json({ error: 'Rate line not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const { lineId } = await params
    await deleteRateLine(lineId, session.user.id)
    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Rate line not found') {
      return NextResponse.json({ error: 'Rate line not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
