import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getCoordinator, updateCoordinator, deactivateCoordinator } from '@/lib/modules/crm/coordinators'
import { UpdateCoordinatorSchema } from '@/lib/modules/crm/coordinators.validation'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('coordinator:read')
    const { id } = await params
    const coordinator = await getCoordinator(id)
    return NextResponse.json(coordinator)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Coordinator not found') {
      return NextResponse.json({ error: 'Coordinator not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('coordinator:write')
    const { id } = await params
    const body: unknown = await req.json()
    const parsed = UpdateCoordinatorSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.errors },
        { status: 400 }
      )
    }
    const coordinator = await updateCoordinator(id, parsed.data, session.user.id)
    return NextResponse.json(coordinator)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Coordinator not found') {
      return NextResponse.json({ error: 'Coordinator not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'Email already in use') {
      return NextResponse.json({ error: 'Email already in use', code: 'CONFLICT' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('coordinator:write')
    const { id } = await params
    const result = await deactivateCoordinator(id, session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Coordinator not found') {
      return NextResponse.json({ error: 'Coordinator not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
