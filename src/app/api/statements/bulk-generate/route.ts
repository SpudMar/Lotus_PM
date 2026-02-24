import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { bulkGenerateStatements } from '@/lib/modules/statements/statement-generation'
import { createAuditLog } from '@/lib/modules/core/audit'
import { z, ZodError } from 'zod'

const bulkSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('statements:write')
    const body = (await request.json()) as unknown
    const input = bulkSchema.parse(body)

    const result = await bulkGenerateStatements(
      input.month,
      input.year,
      session.user.id
    )

    await createAuditLog({
      userId: session.user.id,
      action: 'statements.bulk.generated',
      resource: 'participant_statement',
      resourceId: `${input.year}-${String(input.month).padStart(2, '0')}`,
      after: { generated: result.generated, skipped: result.skipped },
    })

    return NextResponse.json({ data: result })
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
