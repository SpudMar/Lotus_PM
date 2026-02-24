/**
 * Participant API JWT auth helper.
 * REQ-016: Token-based auth for the participant mobile app.
 * REQ-018: Separate participant-facing mobile app auth.
 *
 * Decodes and verifies a JWT token from the Authorization: Bearer header.
 * All participant API routes call this before doing any business logic.
 */

import jwt from 'jsonwebtoken'
import type { NextRequest } from 'next/server'

export interface ParticipantTokenPayload {
  participantId: string
  ndisNumber: string
  role: 'PARTICIPANT'
}

/**
 * Extracts and verifies the participant JWT from the Authorization header.
 * Returns the decoded payload if valid, or null if missing/invalid.
 */
export function getParticipantFromToken(
  request: NextRequest
): ParticipantTokenPayload | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  const secret = process.env['NEXTAUTH_SECRET']
  if (!secret) {
    return null
  }

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & ParticipantTokenPayload
    if (decoded.role !== 'PARTICIPANT' || !decoded.participantId || !decoded.ndisNumber) {
      return null
    }
    return {
      participantId: decoded.participantId,
      ndisNumber: decoded.ndisNumber,
      role: 'PARTICIPANT',
    }
  } catch {
    return null
  }
}

/**
 * Generates a signed JWT for a participant.
 * Token expires in 30 days.
 */
export function generateParticipantToken(payload: {
  participantId: string
  ndisNumber: string
}): string {
  const secret = process.env['NEXTAUTH_SECRET']
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set')
  }

  return jwt.sign(
    {
      participantId: payload.participantId,
      ndisNumber: payload.ndisNumber,
      role: 'PARTICIPANT',
    },
    secret,
    { expiresIn: '30d' }
  )
}
