import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { addRateLine } from '@/lib/modules/service-agreements/service-agreements'
import { createRateLineSchema } from '@/lib/modules/service-agreements/validation'
import { ZodError } from 'zod'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const { id } = await params
    const body = await request.json()
    const input = createRateLineSchema.parse(body)
    const rateLine = await addRateLine(id, input, session.user.id)
    return NextResponse.json({ data: rateLine }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Service agreement not found') {
      return NextResponse.json({ error: 'Service agreement not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message.includes('Rate lines can only be added')) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
