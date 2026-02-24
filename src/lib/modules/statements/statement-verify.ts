/**
 * Statement Verification Module
 *
 * Handles DOB-gated access for SMS statement delivery.
 * Participants receive a link via SMS. Before viewing the statement,
 * they must verify their date of birth. After 3 failed attempts,
 * access is locked for 1 hour.
 *
 * JWT token pattern follows participant-approval.ts.
 */

import { createHmac, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

// ─── Secret ──────────────────────────────────────────────────────────────────

const SECRET =
  process.env['STATEMENT_TOKEN_SECRET'] ?? 'dev-statement-secret-change-in-prod'

// ─── Token Types ─────────────────────────────────────────────────────────────

export interface StatementTokenPayload {
  statementId: string
  participantId: string
  jti: string
  exp: number
  iat: number
}

// ─── Rate Limiting Store (in-memory) ─────────────────────────────────────────

interface AttemptRecord {
  count: number
  firstAttemptAt: number
  lockedUntil: number | null
}

const verificationAttempts = new Map<string, AttemptRecord>()

const MAX_ATTEMPTS = 3
const LOCK_DURATION_MS = 60 * 60 * 1000 // 1 hour

// ─── JWT Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a verification token for a statement.
 * Token is valid for 7 days.
 */
export function createVerificationToken(
  statementId: string,
  participantId: string
): string {
  const payload: StatementTokenPayload = {
    statementId,
    participantId,
    jti: randomBytes(16).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
    iat: Math.floor(Date.now() / 1000),
  }

  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')

  return `${header}.${body}.${sig}`
}

/**
 * Verify and decode a statement verification token.
 * Throws if the token is malformed, tampered, or expired.
 */
export function verifyToken(token: string): StatementTokenPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')
  const [header, body, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')
  if (sig !== expected) throw new Error('Invalid token signature')
  const payload = JSON.parse(
    Buffer.from(body, 'base64url').toString()
  ) as StatementTokenPayload
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  return payload
}

// ─── DOB Verification ────────────────────────────────────────────────────────

export interface VerifyDobResult {
  success: boolean
  downloadUrl?: string
  errorMessage?: string
  locked?: boolean
  remainingAttempts?: number
}

/**
 * Verify a participant's date of birth to access their statement.
 * After 3 failed attempts, locks access for 1 hour.
 *
 * @param statementId - The statement to access
 * @param dobInput - Date of birth in YYYY-MM-DD format
 */
export async function verifyDob(
  statementId: string,
  dobInput: string
): Promise<VerifyDobResult> {
  const key = `verify:${statementId}`
  const now = Date.now()

  // Check for existing lock
  const record = verificationAttempts.get(key)
  if (record?.lockedUntil && now < record.lockedUntil) {
    const remainingMs = record.lockedUntil - now
    const remainingMin = Math.ceil(remainingMs / 60000)
    return {
      success: false,
      locked: true,
      errorMessage: `Too many failed attempts. Try again in ${remainingMin} minutes.`,
    }
  }

  // If lock has expired, reset the record
  if (record?.lockedUntil && now >= record.lockedUntil) {
    verificationAttempts.delete(key)
  }

  // Fetch statement with participant DOB
  const statement = await prisma.participantStatement.findFirst({
    where: { id: statementId, deletedAt: null },
    include: {
      participant: {
        select: { id: true, dateOfBirth: true },
      },
    },
  })

  if (!statement) {
    return { success: false, errorMessage: 'Statement not found' }
  }

  // Compare DOBs (input is YYYY-MM-DD, stored as DateTime)
  const participantDob = statement.participant.dateOfBirth
  const inputDate = new Date(dobInput)

  const dobMatch =
    participantDob.getUTCFullYear() === inputDate.getUTCFullYear() &&
    participantDob.getUTCMonth() === inputDate.getUTCMonth() &&
    participantDob.getUTCDate() === inputDate.getUTCDate()

  if (!dobMatch) {
    // Track failed attempt
    const current = verificationAttempts.get(key) ?? {
      count: 0,
      firstAttemptAt: now,
      lockedUntil: null,
    }
    current.count += 1

    if (current.count >= MAX_ATTEMPTS) {
      current.lockedUntil = now + LOCK_DURATION_MS
      verificationAttempts.set(key, current)
      return {
        success: false,
        locked: true,
        errorMessage: 'Too many failed attempts. Access locked for 1 hour.',
        remainingAttempts: 0,
      }
    }

    verificationAttempts.set(key, current)
    return {
      success: false,
      errorMessage: 'Date of birth does not match our records.',
      remainingAttempts: MAX_ATTEMPTS - current.count,
    }
  }

  // DOB matches — clear any attempt records and return the statement HTML URL
  verificationAttempts.delete(key)

  // Generate a short-lived token for viewing the statement
  const viewToken = createVerificationToken(statementId, statement.participant.id)
  const baseUrl = process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'
  const downloadUrl = `${baseUrl}/api/statements/${statementId}/view?token=${viewToken}`

  return { success: true, downloadUrl }
}

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Reset all verification attempts. Used in tests only. */
export function resetVerificationAttempts(): void {
  verificationAttempts.clear()
}
