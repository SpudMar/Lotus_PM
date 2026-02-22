/**
 * POST /api/webhooks/service-agreement
 *
 * WordPress "Start your journey" webhook.
 * Receives form submission from WP → creates DRAFT CrmParticipant + DRAFT SaServiceAgreement.
 *
 * Authentication: Bearer token (WORDPRESS_WEBHOOK_SECRET env var).
 * This is a public webhook — NO session auth, NOT in middleware matcher.
 *
 * Returns 201 { participantId, serviceAgreementId, message: 'Created' } on success.
 * Returns 401 for invalid/missing auth token.
 * Returns 400 for malformed/invalid payload.
 * Returns 500 for unexpected errors.
 *
 * REQ-WS6: WordPress webhook → DRAFT participant + service agreement.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import {
  WordPressPayloadSchema,
  processWordPressSubmission,
} from '@/lib/modules/crm/wordpress-ingest'

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.WORDPRESS_WEBHOOK_SECRET ?? ''
  if (secret.length === 0) return false

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return token === secret
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json() as unknown
    const payload = WordPressPayloadSchema.parse(body)

    const result = await processWordPressSubmission(payload)

    return NextResponse.json(
      {
        participantId: result.participantId,
        serviceAgreementId: result.serviceAgreementId,
        message: 'Created',
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    // Log without PII (REQ-017)
    console.error(
      '[webhook/service-agreement] Unhandled error:',
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
