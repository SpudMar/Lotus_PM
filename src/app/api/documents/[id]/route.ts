import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getDocument, deleteDocument } from '@/lib/modules/documents/documents'
import { createAuditLog } from '@/lib/modules/core/audit'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePermission('documents:read')
    const { id } = await params
    const document = await getDocument(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ data: document })
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('documents:delete')
    const { id } = await params

    const existing = await getDocument(id)
    if (!existing) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await deleteDocument(id)

    await createAuditLog({
      userId: session.user.id,
      action: 'documents.document.deleted',
      resource: 'doc_document',
      resourceId: id,
      before: { name: existing.name, participantId: existing.participantId ?? null },
    })

    return new NextResponse(null, { status: 204 })
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
