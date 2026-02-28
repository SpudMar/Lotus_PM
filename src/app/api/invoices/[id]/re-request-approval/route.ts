/**
 * POST /api/invoices/[id]/re-request-approval — re-request participant approval
 *
 * Auth: PLAN_MANAGER+ (invoices:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { reRequestApproval } from '@/lib/modules/invoices/participant-approval'

const Schema = z.object({
  clarificationNote: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:write')
    const { id } = await params
    const body: unknown = await request.json()
    const input = Schema.parse(body)
    const invoice = await reRequestApproval(id, session.user.id, input.clarificationNote)
    return NextResponse.json({ data: invoice })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
