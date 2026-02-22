/**
 * Public API — no authentication required.
 * Returns the approval status for a given token (used on the public /approval/[token] page).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { getApprovalStatus } from '@/lib/modules/invoices/participant-approval'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'token query parameter is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const status = await getApprovalStatus(token)
    return NextResponse.json({ data: status })
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid token format') {
      return NextResponse.json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'Invalid token signature') {
      return NextResponse.json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'Token expired') {
      return NextResponse.json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
