import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listNotifications, markAllAsRead, getUnreadCount } from '@/lib/modules/notifications/notifications'
import { paginationSchema, paginatedResponse } from '@/lib/modules/core/validation'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:read')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const { page, pageSize } = paginationSchema.parse(searchParams)

    const [data, unreadCount] = await Promise.all([
      listNotifications({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      getUnreadCount(session.user.id),
    ])

    return NextResponse.json({ ...paginatedResponse(data, data.length, page, pageSize), unreadCount })
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

/** Mark all notifications as read */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:write')
    const body = await request.json()

    if (body.action === 'read-all') {
      await markAllAsRead(session.user.id)
      return NextResponse.json({ data: { success: true } })
    }

    return NextResponse.json({ error: 'Invalid action', code: 'BAD_REQUEST' }, { status: 400 })
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
