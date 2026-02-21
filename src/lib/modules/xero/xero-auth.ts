/**
 * Xero OAuth2 helpers — auth URL generation, token exchange, token refresh.
 * REQ-019/REQ-023: Xero integration.
 *
 * Xero OAuth2 endpoints:
 *   Authorize: https://login.xero.com/identity/connect/authorize
 *   Token:     https://identity.xero.com/connect/token
 *   Tenants:   https://api.xero.com/connections
 */

import { prisma } from '@/lib/db'
import type { XeroTokenResponse, XeroTenant } from './types'

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'

// Scopes requested — per handoff spec plus identity for profile info
const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.transactions',
  'accounting.contacts',
  'offline_access',
].join(' ')

function getClientId(): string {
  const id = process.env.XERO_CLIENT_ID
  if (!id) throw new Error('XERO_CLIENT_ID environment variable is not set')
  return id
}

function getClientSecret(): string {
  const secret = process.env.XERO_CLIENT_SECRET
  if (!secret) throw new Error('XERO_CLIENT_SECRET environment variable is not set')
  return secret
}

function getRedirectUri(): string {
  const uri = process.env.XERO_REDIRECT_URI
  if (!uri) throw new Error('XERO_REDIRECT_URI environment variable is not set')
  return uri
}

/**
 * Build the Basic Auth header for Xero token requests.
 * Xero uses HTTP Basic Auth with client_id:client_secret base64-encoded.
 */
function buildBasicAuthHeader(): string {
  const credentials = `${getClientId()}:${getClientSecret()}`
  const encoded = Buffer.from(credentials).toString('base64')
  return `Basic ${encoded}`
}

/**
 * Build the Xero OAuth2 authorization URL.
 * The state parameter prevents CSRF — caller must store it and validate on callback.
 */
export function buildXeroAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: XERO_SCOPES,
    state,
  })
  return `${XERO_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Called from the OAuth callback route.
 */
export async function exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: buildBasicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Xero token exchange failed (${response.status}): ${errorText}`)
  }

  const data = await response.json() as XeroTokenResponse
  return data
}

/**
 * Fetch the list of Xero tenants/organisations the user has authorised.
 * Returns the first organisation (single-tenant per REQ-002).
 */
export async function fetchXeroTenants(accessToken: string): Promise<XeroTenant[]> {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch Xero tenants (${response.status}): ${errorText}`)
  }

  const tenants = await response.json() as XeroTenant[]
  return tenants
}

/**
 * Refresh an expired Xero access token using the refresh token.
 * Updates the XeroConnection record in DB with the new tokens.
 * Returns the new access token.
 *
 * This is the primary function called before every Xero API request.
 */
export async function refreshXeroToken(connectionId: string): Promise<string> {
  const connection = await prisma.xeroConnection.findUnique({
    where: { id: connectionId },
  })

  if (!connection) {
    throw new Error(`Xero connection not found: ${connectionId}`)
  }

  if (!connection.isActive) {
    throw new Error('Xero connection is not active')
  }

  // If token is still valid with 60-second buffer, return current token
  const bufferMs = 60 * 1000
  if (connection.tokenExpiresAt > new Date(Date.now() + bufferMs)) {
    return connection.accessToken
  }

  // Token expired — refresh it
  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: buildBasicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    // Mark connection as inactive on refresh failure (token may be revoked)
    await prisma.xeroConnection.update({
      where: { id: connectionId },
      data: {
        isActive: false,
        lastSyncError: `Token refresh failed: ${response.status}`,
        syncErrorCount: { increment: 1 },
      },
    })
    throw new Error(`Xero token refresh failed (${response.status}): ${errorText}`)
  }

  const tokens = await response.json() as XeroTokenResponse

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  // Persist new tokens
  await prisma.xeroConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt,
    },
  })

  return tokens.access_token
}

/**
 * Get the active Xero connection, refreshing the token if needed.
 * Returns { accessToken, tenantId } ready for API calls, or null if not connected.
 */
export async function getActiveXeroConnection(): Promise<{
  connectionId: string
  accessToken: string
  tenantId: string
  tenantName: string | null
} | null> {
  const connection = await prisma.xeroConnection.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!connection) return null

  const accessToken = await refreshXeroToken(connection.id)

  return {
    connectionId: connection.id,
    accessToken,
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
  }
}
