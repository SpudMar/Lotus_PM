import { NextResponse, type NextRequest } from 'next/server'
import { verifyDob } from '@/lib/modules/statements/statement-verify'
import { z, ZodError } from 'zod'

/**
 * Public endpoint — no auth required.
 * SMS recipients use this to verify their identity (DOB) and access their statement.
 */

const verifySchema = z.object({
  statementId: z.string().min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as unknown
    const input = verifySchema.parse(body)

    const result = await verifyDob(input.statementId, input.dob)

    if (!result.success) {
      const status = result.locked ? 429 : 403
      return NextResponse.json(
        {
          error: result.errorMessage ?? 'Verification failed',
          code: result.locked ? 'LOCKED' : 'VERIFICATION_FAILED',
          remainingAttempts: result.remainingAttempts,
        },
        { status }
      )
    }

    return NextResponse.json({
      data: { downloadUrl: result.downloadUrl },
    })
  } catch (error) {
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
