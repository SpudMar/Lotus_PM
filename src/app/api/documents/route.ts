import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listDocuments, createDocument } from '@/lib/modules/documents/documents'
import { listDocumentsSchema, createDocumentSchema } from '@/lib/modules/documents/validation'
import { createAuditLog } from '@/lib/modules/core/audit'
import { ZodError } from 'zod'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('documents:read')
    const { searchParams } = new URL(request.url)
    const params = listDocumentsSchema.parse({
      participantId: searchParams.get('participantId') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      page: searchParams.get('page') ?? 1,
      pageSize: searchParams.get('pageSize') ?? 20,
      search: searchParams.get('search') ?? undefined,
    })
    const result = await listDocuments(params)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('documents:write')
    const body = await request.json() as unknown
    const input = createDocumentSchema.parse(body)

    const document = await createDocument(input, session.user.id)

    await createAuditLog({
      userId: session.user.id,
      action: 'documents.document.created',
      resource: 'doc_document',
      resourceId: document.id,
      after: {
        name: document.name,
        category: document.category,
        participantId: document.participantId ?? null,
      },
    })

    return NextResponse.json({ data: document }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
