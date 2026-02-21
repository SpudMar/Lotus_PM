/**
 * GET /api/xero/callback
 *
 * Handles the Xero OAuth2 callback after user authorization.
 * - Validates state cookie to prevent CSRF
 * - Exchanges authorization code for access + refresh tokens
 * - Fetches tenant list and stores the first tenant connection in DB
 * - Redirects to Settings > Integrations on success (or with error)
 *
 * REQ-019/REQ-023: Xero integration.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { exchangeCodeForTokens, fetchXeroTenants } from '@/lib/modules/xero/xero-auth'

const SETTINGS_URL = '/settings'
const SETTINGS_XERO_SUCCESS = '/settings?xero=connected'
const SETTINGS_XERO_ERROR = '/settings?xero=error'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Re-validate session — user must still be authenticated
    const session = await requirePermission('xero:write')

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle user declining authorization
    if (error) {
      console.warn(`Xero OAuth error: ${error} — ${errorDescription ?? ''}`)
      return NextResponse.redirect(
        new URL(`${SETTINGS_XERO_ERROR}&reason=${encodeURIComponent(error)}`, request.url)
      )
    }

    // Validate required parameters
    if (!code || !state) {
      return NextResponse.redirect(
        new URL(`${SETTINGS_XERO_ERROR}&reason=missing_params`, request.url)
      )
    }

    // Validate CSRF state cookie
    const cookieState = request.cookies.get('xero_oauth_state')?.value
    if (!cookieState || cookieState !== state) {
      return NextResponse.redirect(
        new URL(`${SETTINGS_XERO_ERROR}&reason=invalid_state`, request.url)
      )
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Fetch tenants (organisations) the user has authorised
    const tenants = await fetchXeroTenants(tokens.access_token)

    if (tenants.length === 0) {
      return NextResponse.redirect(
        new URL(`${SETTINGS_XERO_ERROR}&reason=no_tenants`, request.url)
      )
    }

    // Use the first tenant (REQ-002: single-tenant now)
    const tenant = tenants[0]!
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    const scopes = tokens.scope ? tokens.scope.split(' ') : []

    // Upsert the connection — one active connection at a time
    // If a connection for this tenant already exists, update it (re-auth)
    const connection = await prisma.xeroConnection.upsert({
      where: { tenantId: tenant.tenantId },
      create: {
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        scopes,
        isActive: true,
        connectedById: session.user.id,
      },
      update: {
        tenantName: tenant.tenantName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        scopes,
        isActive: true,
        connectedById: session.user.id,
        syncErrorCount: 0,
        lastSyncError: null,
      },
    })

    // Deactivate any other connections (single active connection policy)
    await prisma.xeroConnection.updateMany({
      where: {
        id: { not: connection.id },
        isActive: true,
      },
      data: { isActive: false },
    })

    // Audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'xero.connected',
      resource: 'xero_connection',
      resourceId: connection.id,
      after: { tenantId: tenant.tenantId, tenantName: tenant.tenantName },
    })

    // Clear the CSRF cookie and redirect to settings
    const response = NextResponse.redirect(new URL(SETTINGS_XERO_SUCCESS, request.url))
    response.cookies.delete('xero_oauth_state')

    return response
  } catch (error) {
    console.error('Xero callback error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.redirect(
        new URL(`${SETTINGS_XERO_ERROR}&reason=forbidden`, request.url)
      )
    }

    return NextResponse.redirect(
      new URL(`${SETTINGS_XERO_ERROR}&reason=server_error`, request.url)
    )
  }
}
