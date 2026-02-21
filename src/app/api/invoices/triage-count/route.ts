/**
 * GET /api/invoices/triage-count
 *
 * Returns the count of email-ingested invoices with status PENDING_REVIEW.
 * Used by the sidebar to show the Email Triage badge count.
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')

    const count = await prisma.invInvoice.count({
      where: {
        deletedAt: null,
        ingestSource: 'EMAIL',
        status: 'PENDING_REVIEW',
      },
    })

    return NextResponse.json({ data: { count } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ data: { count: 0 } })
  }
}
