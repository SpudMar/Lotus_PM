/**
 * POST /api/crm/participants/[id]/activate-onboarding
 *
 * Activates a DRAFT participant who was ingested via the WordPress webhook.
 * Sets isActive: true and onboardingStatus: COMPLETE.
 *
 * Requires: participants:write permission.
 * REQ-WS6: WordPress webhook onboarding completion.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('participants:write')
    const { id } = await params

    const participant = await prisma.crmParticipant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, onboardingStatus: true, isActive: true },
    })

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (participant.onboardingStatus !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Participant is not in DRAFT onboarding status', code: 'INVALID_STATUS' },
        { status: 422 }
      )
    }

    const updated = await prisma.crmParticipant.update({
      where: { id },
      data: {
        isActive: true,
        onboardingStatus: 'COMPLETE',
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'participant.onboarding.activated',
      resource: 'participant',
      resourceId: id,
      before: { onboardingStatus: 'DRAFT', isActive: false },
      after: { onboardingStatus: 'COMPLETE', isActive: true },
    })

    return NextResponse.json({ data: updated }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
