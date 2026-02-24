import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { cancelClaim } from '@/lib/modules/claims/claims'
import { z, ZodError } from 'zod'

const cancelClaimSchema = z.object({
  reason: z.string().max(500).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('claims:write')
    const { id } = await params
    const body = await request.json()
    const input = cancelClaimSchema.parse(body)

    const claim = await cancelClaim(id, session.user.id, input.reason)

    return NextResponse.json({ data: claim })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Claim not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json(
        { error: 'Only pending or submitted claims can be cancelled', code: 'INVALID_STATUS' },
        { status: 409 },
      )
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
