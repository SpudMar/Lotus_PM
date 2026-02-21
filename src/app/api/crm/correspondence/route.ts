import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listCorrespondence, createCorrespondence } from '@/lib/modules/crm/correspondence'
import { paginationSchema, paginatedResponse } from '@/lib/modules/core/validation'
import { z } from 'zod'

const correspondenceTypeSchema = z.enum([
  'EMAIL_INBOUND',
  'EMAIL_OUTBOUND',
  'SMS_INBOUND',
  'SMS_OUTBOUND',
  'NOTE',
  'PHONE_CALL',
])

const listQuerySchema = z.object({
  participantId: z.string().optional(),
  providerId: z.string().optional(),
  invoiceId: z.string().optional(),
  type: correspondenceTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const createCorrespondenceSchema = z.object({
  type: correspondenceTypeSchema,
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(10000),
  fromAddress: z.string().max(255).optional(),
  toAddress: z.string().max(255).optional(),
  participantId: z.string().optional(),
  providerId: z.string().optional(),
  invoiceId: z.string().optional(),
  documentId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('comms:read')
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const filters = listQuerySchema.parse(params)
    const { data, total } = await listCorrespondence(filters)
    return NextResponse.json(paginatedResponse(data, total, filters.page, filters.pageSize))
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('comms:write')
    const body = await request.json()
    const input = createCorrespondenceSchema.parse(body)
    const entry = await createCorrespondence(input, session.user.id)
    return NextResponse.json({ data: entry }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
