import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listAbaFiles, generateAbaFile } from '@/lib/modules/banking/banking'
import { generateAbaSchema } from '@/lib/modules/banking/validation'
import { paginationSchema, paginatedResponse } from '@/lib/modules/core/validation'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('banking:read')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const { page, pageSize } = paginationSchema.parse(searchParams)

    const { data, total } = await listAbaFiles({ page, pageSize })
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
    const session = await requirePermission('banking:generate')
    const body = await request.json()
    const input = generateAbaSchema.parse(body)

    const { abaFile, abaContent, filename } = await generateAbaFile(input.paymentIds, session.user.id)

    return NextResponse.json({
      data: {
        abaFile,
        abaContent,
        filename,
      },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message.includes('No pending payments')) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
