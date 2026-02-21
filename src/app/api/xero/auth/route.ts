/**
 * GET /api/xero/auth
 *
 * Initiates the Xero OAuth2 flow.
 * - Requires Director role (xero:write permission)
 * - Generates a CSRF state token, stores it in a short-lived cookie
 * - Redirects the browser to Xero's authorization page
 *
 * REQ-019/REQ-023: Xero integration.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { buildXeroAuthUrl } from '@/lib/modules/xero/xero-auth'
import { randomBytes } from 'crypto'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('xero:write')

    // Generate a cryptographically random state parameter to prevent CSRF
    const state = randomBytes(32).toString('hex')

    const authUrl = buildXeroAuthUrl(state)

    // Store state in a short-lived httpOnly cookie (10 minutes)
    const response = NextResponse.redirect(authUrl)
    response.cookies.set('xero_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    return response
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message.includes('XERO_')) {
      return NextResponse.json(
        { error: 'Xero credentials not configured', code: 'XERO_NOT_CONFIGURED' },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
