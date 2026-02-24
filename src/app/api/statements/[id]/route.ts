import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import {
  getStatementById,
  softDeleteStatement,
} from '@/lib/modules/statements/statement-generation'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    await requirePermission('statements:read')
    const statement = await getStatementById(params.id)

    if (!statement) {
      return NextResponse.json(
        { error: 'Statement not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: statement })
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

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('statements:write')
    const statement = await getStatementById(params.id)

    if (!statement) {
      return NextResponse.json(
        { error: 'Statement not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    await softDeleteStatement(params.id)

    await createAuditLog({
      userId: session.user.id,
      action: 'statements.statement.deleted',
      resource: 'participant_statement',
      resourceId: params.id,
      before: { participantId: statement.participantId },
    })

    return NextResponse.json({ success: true })
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
