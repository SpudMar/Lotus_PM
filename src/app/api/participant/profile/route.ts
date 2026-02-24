/**
 * GET /api/participant/profile
 * Returns the authenticated participant's own profile information.
 *
 * REQ-018: Participant app — own data only, scoped by JWT.
 * Returns basic contact info and plan manager name.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getParticipantFromToken } from '@/lib/modules/participant-api/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate
  const participant = getParticipantFromToken(req)
  if (!participant) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // 2. Fetch participant profile with assigned plan manager
  const profile = await prisma.crmParticipant.findFirst({
    where: {
      id: participant.participantId,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      ndisNumber: true,
      email: true,
      phone: true,
      assignedTo: {
        select: {
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  })

  if (!profile) {
    return NextResponse.json(
      { error: 'Participant not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      ndisNumber: profile.ndisNumber,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      planManager: profile.assignedTo
        ? {
            name: profile.assignedTo.name,
            email: profile.assignedTo.email ?? null,
            phone: profile.assignedTo.phone ?? null,
          }
        : null,
    },
  })
}
