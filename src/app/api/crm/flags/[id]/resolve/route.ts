/**
 * PUT /api/crm/flags/[id]/resolve — resolve a flag
 *
 * Auth: PLAN_MANAGER+ (flags:approve)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { resolveFlag } from '@/lib/modules/crm/flags'
import { ResolveFlagSchema } from '@/lib/modules/crm/flags-validation'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('flags:approve')
    const { id } = await params
    const body: unknown = await request.json()
    const input = ResolveFlagSchema.parse(body)
    const flag = await resolveFlag(id, input.note, session.user.id)
    return NextResponse.json({ flag })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
