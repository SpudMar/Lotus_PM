/**
 * POST /api/provider-portal/auth
 * Requests a magic login link for the given email.
 *
 * Always returns 200 even if the email is not registered (prevents enumeration).
 * Rate limiting: applied at infrastructure level (ALB + WAF).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requestProviderMagicLink } from '@/lib/modules/crm/provider-magic-link'

const RequestSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'INVALID_INPUT' },
      { status: 400 }
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid email address', code: 'INVALID_INPUT' },
      { status: 400 }
    )
  }

  try {
    await requestProviderMagicLink(parsed.data.email)
  } catch {
    // Silent fail for SES errors — don't surface server errors to the client
    // (the user sees "check your email" regardless)
  }

  // Always return 200 to prevent email enumeration
  return NextResponse.json({ success: true })
}
