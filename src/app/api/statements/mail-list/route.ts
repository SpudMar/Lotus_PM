import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getMailList } from '@/lib/modules/statements/statement-send'
import { z, ZodError } from 'zod'

const querySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('statements:read')
    const { searchParams } = new URL(request.url)

    const params = querySchema.parse({
      month: searchParams.get('month'),
      year: searchParams.get('year'),
    })

    const mailList = await getMailList(params.month, params.year)

    return NextResponse.json({ data: mailList })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    if (error instanceof ZodError) {
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
