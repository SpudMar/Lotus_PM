/**
 * POST /api/claims/import-remittance — import PRODA remittance CSV
 *
 * Auth: PLAN_MANAGER+ (claims:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { importProdaRemittance } from '@/lib/modules/claims/proda-remittance-import'

const ImportSchema = z.object({
  csvContent: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('claims:write')
    const body: unknown = await request.json()
    const { csvContent } = ImportSchema.parse(body)
    const result = await importProdaRemittance(csvContent, session.user.id)
    return NextResponse.json({ data: result })
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
