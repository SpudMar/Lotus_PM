/**
 * POST /api/participant/auth
 * Participant login via NDIS number + date of birth.
 *
 * REQ-016: Credentials only transmitted over HTTPS.
 * REQ-018: Participant app auth — scoped tokens, 30-day expiry.
 *
 * Pattern: Zod validate → lookup → verify DOB → sign JWT → return.
 * Returns 401 on any failure (no enumeration of NDIS numbers).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { generateParticipantToken } from '@/lib/modules/participant-api/auth'

const LoginSchema = z.object({
  ndisNumber: z.string().min(1, 'NDIS number is required'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD format'),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse + validate input
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'INVALID_INPUT' },
      { status: 400 }
    )
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'NDIS number and date of birth are required', code: 'INVALID_INPUT' },
      { status: 400 }
    )
  }

  const { ndisNumber, dateOfBirth } = parsed.data

  // 2. Look up participant (not soft-deleted)
  const participant = await prisma.crmParticipant.findFirst({
    where: {
      ndisNumber,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      ndisNumber: true,
      dateOfBirth: true,
    },
  })

  if (!participant) {
    return NextResponse.json(
      { error: 'Invalid NDIS number or date of birth', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // 3. Verify date of birth — compare UTC date strings to avoid timezone drift
  const storedDob = participant.dateOfBirth
  const storedDobStr = storedDob.toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  const dobMatches = dateOfBirth === storedDobStr

  if (!dobMatches) {
    return NextResponse.json(
      { error: 'Invalid NDIS number or date of birth', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // 4. Generate JWT
  const token = generateParticipantToken({
    participantId: participant.id,
    ndisNumber: participant.ndisNumber,
  })

  // 5. Return token + basic participant info
  return NextResponse.json({
    token,
    participant: {
      id: participant.id,
      firstName: participant.firstName,
      lastName: participant.lastName,
      ndisNumber: participant.ndisNumber,
    },
  })
}
