import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { markAsRead, dismissNotification } from '@/lib/modules/notifications/notifications'
import { notificationActionSchema } from '@/lib/modules/notifications/validation'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const session = await requirePermission('notifications:write')
    const body = await request.json()
    const parsed = notificationActionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid action', code: 'VALIDATION_ERROR', details: parsed.error.issues },
        { status: 400 },
      )
    }

    if (parsed.data.action === 'read') {
      await markAsRead(id, session.user.id)
      return NextResponse.json({ data: { success: true } })
    }

    if (parsed.data.action === 'dismiss') {
      await dismissNotification(id, session.user.id)
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
