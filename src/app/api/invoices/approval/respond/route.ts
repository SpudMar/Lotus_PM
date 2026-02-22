/**
 * Public API — no authentication required.
 * Participants respond to approval requests via this endpoint.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { processApprovalResponse } from '@/lib/modules/invoices/participant-approval'

const respondSchema = z.object({
  token: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const input = respondSchema.parse(body)
    const invoice = await processApprovalResponse(input.token, input.decision)
    return NextResponse.json({ data: invoice })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'Invalid token format') {
      return NextResponse.json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'Invalid token signature') {
      return NextResponse.json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'Token expired') {
      return NextResponse.json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (error instanceof Error && error.message === 'Token already used') {
      return NextResponse.json(
        { error: 'Token has already been used', code: 'TOKEN_USED' },
        { status: 409 }
      )
    }
    if (
      error instanceof Error &&
      error.message === 'Invoice is not pending participant approval'
    ) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_STATE' },
        { status: 422 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
