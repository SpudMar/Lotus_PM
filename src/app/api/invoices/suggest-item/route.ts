/**
 * GET /api/invoices/suggest-item
 *
 * Returns a support item code suggestion based on observed patterns for
 * a given provider/participant/category combination.
 *
 * Query params:
 *   providerId    - required, DB cuid
 *   participantId - required, DB cuid
 *   categoryCode  - required, NDIS category code (e.g. "01")
 *
 * Auth: invoices:read (PLAN_MANAGER + ASSISTANT roles)
 * Returns: { data: { itemNumber, confidence, source } } or { data: null }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { suggestSupportItem } from '@/lib/modules/invoices/item-matcher'

const suggestQuerySchema = z.object({
  providerId: z.string().min(1),
  participantId: z.string().min(1),
  categoryCode: z.string().min(1).max(4),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = suggestQuerySchema.safeParse(searchParams)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Missing or invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { providerId, participantId, categoryCode } = parsed.data
    const suggestion = await suggestSupportItem(providerId, participantId, categoryCode)

    return NextResponse.json({ data: suggestion })
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
