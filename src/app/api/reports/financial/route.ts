import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getFinancialSummary, getProviderPaymentSummary } from '@/lib/modules/reports/reports'
import { dateRangeSchema } from '@/lib/modules/reports/validation'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('reports:financial')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)

    // Default to current financial year (1 July - 30 June)
    const now = new Date()
    const fyStart = now.getMonth() >= 6
      ? new Date(now.getFullYear(), 6, 1)
      : new Date(now.getFullYear() - 1, 6, 1)
    const fyEnd = now.getMonth() >= 6
      ? new Date(now.getFullYear() + 1, 5, 30, 23, 59, 59)
      : new Date(now.getFullYear(), 5, 30, 23, 59, 59)

    const params = dateRangeSchema.safeParse({
      periodStart: searchParams.periodStart ?? fyStart,
      periodEnd: searchParams.periodEnd ?? fyEnd,
    })

    if (!params.success) {
      return NextResponse.json(
        { error: 'Invalid date range', code: 'VALIDATION_ERROR', details: params.error.issues },
        { status: 400 },
      )
    }

    const [financial, providers] = await Promise.all([
      getFinancialSummary(params.data),
      getProviderPaymentSummary(params.data),
    ])

    return NextResponse.json({ data: { financial, providers } })
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
