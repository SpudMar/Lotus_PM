/**
 * GET /api/price-guide/items
 * Auth: PLAN_MANAGER+ (price-guide:read)
 * Query params: q, categoryCode, versionId, limit, offset
 * Returns: { data: { items, total } }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listSupportItems } from '@/lib/modules/price-guide/price-guide'
import { ListSupportItemsSchema } from '@/lib/modules/price-guide/validation'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('price-guide:read')

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = ListSupportItemsSchema.safeParse(params)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error },
        { status: 400 }
      )
    }

    const { q, categoryCode, versionId, limit, offset } = parsed.data

    const result = await listSupportItems({ q, categoryCode, versionId, limit, offset })

    return NextResponse.json({ data: result })
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
