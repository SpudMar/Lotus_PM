/**
 * GET /api/email-templates/merge-fields — list available merge fields (notifications:read)
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getAvailableMergeFields } from '@/lib/modules/notifications/email-templates'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('notifications:read')
    const fields = getAvailableMergeFields()
    return NextResponse.json({ data: fields })
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
