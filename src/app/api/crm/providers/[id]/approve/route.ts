/**
 * POST /api/crm/providers/[id]/approve
 *
 * Approve a provider — sets providerStatus to ACTIVE.
 * Requires providers:approve permission.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { approveProvider } from '@/lib/modules/crm/provider-onboarding'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('providers:approve')
    const { id } = await params

    await approveProvider(id, session.user.id)

    return NextResponse.json({ data: { status: 'ACTIVE' } })
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
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
