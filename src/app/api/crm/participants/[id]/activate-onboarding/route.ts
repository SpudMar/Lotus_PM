import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

/**
 * POST /api/crm/participants/[id]/activate-onboarding
 *
 * Activates a DRAFT participant created by WordPress webhook.
 * Sets onboardingStatus = ACTIVE, isActive = true.
 * Requires PLAN_MANAGER role.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
        { status: 404 },
      )
    }

    if (participant.onboardingStatus !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Participant is not in DRAFT status', code: 'INVALID_STATUS' },
        { status: 400 },
      )
    }

    const before = { onboardingStatus: participant.onboardingStatus, isActive: participant.isActive }

    const updated = await prisma.crmParticipant.update({
      where: { id },
      data: {
        onboardingStatus: 'COMPLETE',
        isActive: true,
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'participant.onboarding.activated',
      resource: 'participant',
      resourceId: id,
      before,
      after: { onboardingStatus: updated.onboardingStatus, isActive: updated.isActive },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
