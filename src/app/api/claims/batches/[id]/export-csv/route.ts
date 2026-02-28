/**
 * GET /api/claims/batches/[id]/export-csv — download bulk claim CSV for PRODA
 *
 * Auth: PLAN_MANAGER+ (claims:write)
 */

import { type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { generateBulkClaimCSV } from '@/lib/modules/claims/bulk-csv-export'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requirePermission('claims:write')
    const { id } = await params

    // Use a placeholder registration number — in production this comes from org settings
    const registrationNumber = process.env.NDIS_REGISTRATION_NUMBER ?? '4050000000'
    const csv = await generateBulkClaimCSV(id, registrationNumber)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="claims-batch-${id}.csv"`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return new Response(JSON.stringify({ error: error.message }), { status: 404 })
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
