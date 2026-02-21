/**
 * DELETE /api/xero/disconnect
 *
 * Disconnects the active Xero integration.
 * - Requires xero:write permission (Director only)
 * - Marks the connection as inactive in DB
 * - Audit logs the disconnection
 *
 * Note: This does NOT revoke the Xero token at Xero's end.
 * The user should also revoke access from their Xero organization settings if needed.
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function DELETE(): Promise<NextResponse> {
  try {
    const session = await requirePermission('xero:write')

    const connection = await prisma.xeroConnection.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Xero connection found', code: 'NOT_CONNECTED' },
        { status: 404 }
      )
    }

    // Soft-deactivate — preserve the record for audit trail
    await prisma.xeroConnection.update({
      where: { id: connection.id },
      data: { isActive: false },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'xero.disconnected',
      resource: 'xero_connection',
      resourceId: connection.id,
      before: { tenantId: connection.tenantId, tenantName: connection.tenantName },
    })

    return NextResponse.json({ data: { disconnected: true } })
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
