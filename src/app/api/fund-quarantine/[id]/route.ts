import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getQuarantine, updateQuarantine, releaseQuarantine } from '@/lib/modules/fund-quarantine/fund-quarantine'
import { updateQuarantineSchema } from '@/lib/modules/fund-quarantine/validation'
import { ZodError } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')
    const { id } = await params
    const quarantine = await getQuarantine(id)
    return NextResponse.json({ data: quarantine })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Quarantine not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id } = await params
    const body = await request.json()
    const input = updateQuarantineSchema.parse(body)
    const updated = await updateQuarantine(id, input, session.user.id)
    return NextResponse.json({ data: updated })
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
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Quarantine not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'QUARANTINE_NOT_ACTIVE') {
      return NextResponse.json({ error: 'Quarantine is not active', code: 'QUARANTINE_NOT_ACTIVE' }, { status: 422 })
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_BUDGET_CAPACITY') {
      return NextResponse.json({ error: 'Insufficient budget capacity', code: 'INSUFFICIENT_BUDGET_CAPACITY' }, { status: 422 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const { id } = await params
    const released = await releaseQuarantine(id, session.user.id)
    return NextResponse.json({ data: released })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Quarantine not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'QUARANTINE_NOT_ACTIVE') {
      return NextResponse.json({ error: 'Quarantine is not active', code: 'QUARANTINE_NOT_ACTIVE' }, { status: 422 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
