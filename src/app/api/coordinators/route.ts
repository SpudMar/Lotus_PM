import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listCoordinators, createCoordinator } from '@/lib/modules/crm/coordinators'
import { CreateCoordinatorSchema } from '@/lib/modules/crm/coordinators.validation'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('coordinator:read')
    const coordinators = await listCoordinators()
    return NextResponse.json(coordinators)
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

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await requirePermission('coordinator:write')
    const body: unknown = await req.json()
    const parsed = CreateCoordinatorSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.errors },
        { status: 400 }
      )
    }
    const coordinator = await createCoordinator(parsed.data, session.user.id)
    return NextResponse.json(coordinator, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Email already in use') {
      return NextResponse.json({ error: 'Email already in use', code: 'CONFLICT' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
