import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listRules, createRule } from '@/lib/modules/automation/rules'
import { createRuleSchema } from '@/lib/modules/automation/validation'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('automation:read')
    const rules = await listRules()
    return NextResponse.json({ data: rules })
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('automation:write')
    const body = await request.json()
    const input = createRuleSchema.parse(body)

    const rule = await createRule(input)

    await createAuditLog({
      userId: session.user.id,
      action: 'automation.rule.created',
      resource: 'auto_rule',
      resourceId: rule.id,
      after: { name: rule.name },
    })

    return NextResponse.json({ data: rule }, { status: 201 })
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
