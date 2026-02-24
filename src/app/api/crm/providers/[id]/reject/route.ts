/**
 * POST /api/crm/providers/[id]/reject
 *
 * Reject a provider — sets providerStatus back to DRAFT and clears invite token.
 * Requires providers:approve permission.
 *
 * Body: { reason?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { rejectProvider } from '@/lib/modules/crm/provider-onboarding'
import { z } from 'zod'

const bodySchema = z.object({
  reason: z.string().max(500).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('providers:approve')
    const { id } = await params

    const body = await request.json() as unknown
    const { reason } = bodySchema.parse(body)

    await rejectProvider(id, reason, session.user.id)

    return NextResponse.json({ data: { status: 'DRAFT' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Provider not found') {
      return NextResponse.json({ error: 'Provider not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
