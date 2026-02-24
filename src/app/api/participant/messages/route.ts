/**
 * GET /api/participant/messages
 * Returns the authenticated participant's communication log entries.
 *
 * REQ-018: Participant app — own data only, scoped by JWT.
 * Uses CrmCommLog.participantId to scope.
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

  // 2. Query comm logs for this participant
  const commLogs = await prisma.crmCommLog.findMany({
    where: {
      participantId: participant.participantId,
    },
    select: {
      id: true,
      type: true,
      direction: true,
      subject: true,
      body: true,
      occurredAt: true,
      createdAt: true,
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  })

  const data = commLogs.map((log) => ({
    id: log.id,
    type: log.type,
    direction: log.direction,
    subject: log.subject ?? '',
    body: log.body,
    createdAt: log.occurredAt.toISOString(),
  }))

  return NextResponse.json({ data })
}
