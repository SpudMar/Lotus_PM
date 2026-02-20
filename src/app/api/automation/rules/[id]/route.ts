import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getRuleById, updateRule, deleteRule } from '@/lib/modules/automation/rules'
import { updateRuleSchema } from '@/lib/modules/automation/validation'
import { createAuditLog } from '@/lib/modules/core/audit'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission('automation:read')
    const { id } = await params
    const rule = await getRuleById(id)
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ data: rule })
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

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission('automation:write')
    const { id } = await params
    const body = await request.json()
    const input = updateRuleSchema.parse(body)

    const rule = await updateRule(id, input)
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'automation.rule.updated',
      resource: 'auto_rule',
      resourceId: id,
      after: input,
    })

    return NextResponse.json({ data: rule })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission('automation:write')
    const { id } = await params

    const deleted = await deleteRule(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Rule not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'automation.rule.deleted',
      resource: 'auto_rule',
      resourceId: id,
    })

    return new NextResponse(null, { status: 204 })
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
