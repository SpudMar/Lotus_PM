import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getAbaFile, markAbaSubmitted } from '@/lib/modules/banking/banking'
import { submitAbaSchema } from '@/lib/modules/banking/validation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('banking:read')
    const { id } = await params
    const abaFile = await getAbaFile(id)

    if (!abaFile) {
      return NextResponse.json({ error: 'ABA file not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ data: abaFile })
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const body = await request.json()
    const action = body.action as string

    if (action === 'submit') {
      const session = await requirePermission('banking:write')
      const input = submitAbaSchema.parse(body)
      const abaFile = await markAbaSubmitted(id, input.bankReference, session.user.id)
      return NextResponse.json({ data: abaFile })
    }

    return NextResponse.json({ error: 'Invalid action', code: 'BAD_REQUEST' }, { status: 400 })
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
