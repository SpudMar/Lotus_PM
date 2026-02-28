/**
 * GET  /api/crm/approved-supports?participantId=X  — list rules
 * POST /api/crm/approved-supports                  — upsert a rule
 *
 * Auth: PLAN_MANAGER+ (participants:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { getApprovedSupports, updateApprovedSupports } from '@/lib/modules/crm/approved-supports'

const UpsertSchema = z.object({
  participantId: z.string().min(1),
  categoryCode: z.string().min(1),
  restrictedMode: z.boolean(),
  allowedItemCodes: z.array(z.string()),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('participants:read')
    const participantId = request.nextUrl.searchParams.get('participantId')
    if (!participantId) {
      return NextResponse.json({ error: 'participantId required' }, { status: 400 })
    }
    const rules = await getApprovedSupports(participantId)
    return NextResponse.json({ data: rules })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('participants:write')
    const body: unknown = await request.json()
    const input = UpsertSchema.parse(body)
    const rule = await updateApprovedSupports(
      input.participantId,
      input.categoryCode,
      input.restrictedMode,
      input.allowedItemCodes,
      session.user.id
    )
    return NextResponse.json({ data: rule })
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
