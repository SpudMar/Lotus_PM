/**
 * GET /api/xero/status
 *
 * Returns the current Xero connection status.
 * - Requires xero:read permission (Plan Manager or Global Admin)
 *
 * Response: XeroConnectionStatus
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import type { XeroConnectionStatus } from '@/lib/modules/xero/types'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('xero:read')

    const connection = await prisma.xeroConnection.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        tenantId: true,
        tenantName: true,
        connectedAt: true,
        lastSyncAt: true,
        tokenExpiresAt: true,
      },
    })

    if (!connection) {
      const status: XeroConnectionStatus = { connected: false }
      return NextResponse.json({ data: status })
    }

    const status: XeroConnectionStatus = {
      connected: true,
      tenantId: connection.tenantId,
      tenantName: connection.tenantName ?? undefined,
      connectedAt: connection.connectedAt.toISOString(),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      tokenExpiresAt: connection.tokenExpiresAt.toISOString(),
    }

    return NextResponse.json({ data: status })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
