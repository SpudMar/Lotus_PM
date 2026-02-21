import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getUnreadCount } from '@/lib/modules/notifications/notifications'

/** Lightweight endpoint for polling unread count (header badge) */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:read')
    const count = await getUnreadCount(session.user.id)
    return NextResponse.json({ data: { unreadCount: count } })
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
