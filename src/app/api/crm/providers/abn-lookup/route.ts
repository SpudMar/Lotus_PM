/**
 * GET /api/crm/providers/abn-lookup?abn=xxx
 *
 * Look up an ABN against the Australian Business Register (ABR).
 * Requires providers:write permission (staff only — not public).
 *
 * Returns 503 with ABR_NOT_CONFIGURED if ABR_GUID env is not set.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { lookupAbn } from '@/lib/modules/crm/abn-lookup'
import { z } from 'zod'

const querySchema = z.object({
  abn: z.string().min(1, 'ABN is required'),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('providers:write')

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const { abn } = querySchema.parse(params)

    if (!process.env['ABR_GUID']) {
      return NextResponse.json(
        { error: 'ABR lookup not configured', code: 'ABR_NOT_CONFIGURED' },
        { status: 503 }
      )
    }

    const result = await lookupAbn(abn)
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
