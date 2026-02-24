import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { sendStatement } from '@/lib/modules/statements/statement-send'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('statements:write')
    const result = await sendStatement(params.id)

    if (!result.success) {
      return NextResponse.json(
        { error: result.errorMessage ?? 'Send failed', code: 'SEND_FAILED' },
        { status: 422 }
      )
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'statements.statement.sent',
      resource: 'participant_statement',
      resourceId: params.id,
      after: { success: true },
    })

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
