/**
 * GET /api/invoices/triage-count
 *
 * Returns the count of email-ingested invoices with status PENDING_REVIEW,
 * plus a per-processing-category breakdown for the triage dashboard.
 *
 * The `count` field is kept for backward compatibility with the sidebar badge.
 * The `byCategory` field is new (Wave 1) and may be absent on older invoices
 * (those will appear under the null key which is mapped to "UNPROCESSED").
 *
 * Auth: invoices:read (PLAN_MANAGER or above)
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')

    const [count, grouped] = await Promise.all([
      prisma.invInvoice.count({
        where: {
          deletedAt: null,
          ingestSource: 'EMAIL',
          status: 'PENDING_REVIEW',
        },
      }),
      prisma.invInvoice.groupBy({
        by: ['processingCategory'],
        _count: true,
        where: {
          deletedAt: null,
          ingestSource: 'EMAIL',
          status: 'PENDING_REVIEW',
        },
      }),
    ])

    const byCategory: Record<string, number> = {}
    for (const row of grouped) {
      const key = row.processingCategory ?? 'UNPROCESSED'
      byCategory[key] = row._count
    }

    return NextResponse.json({ data: { count, byCategory } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ data: { count: 0, byCategory: {} } })
  }
}
