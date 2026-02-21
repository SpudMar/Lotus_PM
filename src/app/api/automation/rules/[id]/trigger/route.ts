/**
 * POST /api/automation/rules/[id]/trigger
 *
 * Manually trigger a rule with a provided context payload.
 * Useful for testing rules before deploying them to production.
 * PM+ (Plan Manager or Global Admin).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { triggerRule } from '@/lib/modules/automation/engine'
import { getRuleById } from '@/lib/modules/automation/rules'
import { z } from 'zod'

const triggerBodySchema = z.object({
  context: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission('automation:write')
    const { id } = await params

    const rule = await getRuleById(id)
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const body = await request.json()
    const { context } = triggerBodySchema.parse(body)

    const result = await triggerRule(id, context, 'manual')

    return NextResponse.json({ data: result })
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
