/**
 * GET /api/invoices/processing-summary
 *
 * Returns counts per AI processing category for the dashboard.
 * Only counts non-deleted invoices that have been through the processing engine.
 *
 * Auth: invoices:read (PLAN_MANAGER or above)
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

interface ProcessingSummary {
  autoApproved: number
  participantApproval: number
  needsCodes: number
  needsReview: number
  autoRejected: number
}

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')

    const grouped = await prisma.invInvoice.groupBy({
      by: ['processingCategory'],
      _count: true,
      where: { deletedAt: null },
    })

    const summary: ProcessingSummary = {
      autoApproved: 0,
      participantApproval: 0,
      needsCodes: 0,
      needsReview: 0,
      autoRejected: 0,
    }

    for (const row of grouped) {
      switch (row.processingCategory) {
        case 'AUTO_APPROVED':
          summary.autoApproved = row._count
          break
        case 'PARTICIPANT_APPROVAL':
          summary.participantApproval = row._count
          break
        case 'NEEDS_CODES':
          summary.needsCodes = row._count
          break
        case 'NEEDS_REVIEW':
          summary.needsReview = row._count
          break
        case 'AUTO_REJECTED':
          summary.autoRejected = row._count
          break
      }
    }

    return NextResponse.json({ data: summary })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
