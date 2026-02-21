import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listClaims, createClaimFromInvoice } from '@/lib/modules/claims/claims'
import { createClaimSchema } from '@/lib/modules/claims/validation'
import { paginationSchema, paginatedResponse } from '@/lib/modules/core/validation'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('claims:read')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const { page, pageSize } = paginationSchema.parse(searchParams)
    const status = request.nextUrl.searchParams.get('status') ?? undefined
    const participantId = request.nextUrl.searchParams.get('participantId') ?? undefined
    const batchId = request.nextUrl.searchParams.get('batchId') ?? undefined

    const { data, total } = await listClaims({ page, pageSize, status, participantId, batchId })
    return NextResponse.json(paginatedResponse(data, total, page, pageSize))
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('claims:write')
    const body = await request.json()
    const input = createClaimSchema.parse(body)

    const claim = await createClaimFromInvoice(input, session.user.id)
    return NextResponse.json({ data: claim }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message.includes('Invoice')) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('claim already exists')) {
      return NextResponse.json({ error: error.message, code: 'CONFLICT' }, { status: 409 })
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
