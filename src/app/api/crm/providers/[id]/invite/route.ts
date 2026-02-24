/**
 * POST /api/crm/providers/[id]/invite
 *
 * Send a portal invite to a provider.
 * Generates a 32-byte token valid for 7 days, emails it to the provider,
 * and sets providerStatus to INVITED.
 *
 * Requires providers:write permission.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { sendProviderInvite } from '@/lib/modules/crm/provider-onboarding'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('providers:write')
    const { id } = await params

    const result = await sendProviderInvite(id, session.user.id)

    return NextResponse.json({
      data: { expiresAt: result.expiresAt.toISOString() },
    })
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
    if (
      error instanceof Error &&
      error.message === 'Provider has no email address — cannot send invite'
    ) {
      return NextResponse.json(
        { error: 'Provider has no email address', code: 'NO_EMAIL' },
        { status: 422 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
