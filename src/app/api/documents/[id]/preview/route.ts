/**
 * GET /api/documents/[id]/preview
 *
 * Returns a 15-minute presigned S3 GET URL for previewing a document.
 * Used by the PdfViewer component on the documents page.
 *
 * REQ-011: S3 bucket is in ap-southeast-2.
 * REQ-016: Object is server-side encrypted (AES-256).
 * REQ-017: RBAC — requires documents:read.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getDocumentById } from '@/lib/modules/documents/documents'
import { generateDownloadUrl } from '@/lib/modules/documents/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePermission('documents:read')
    const { id } = await params

    const document = await getDocumentById(id)
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    const { downloadUrl, expiresIn } = await generateDownloadUrl({
      s3Key: document.s3Key,
      s3Bucket: document.s3Bucket,
      expiresIn: 900, // 15 minutes for preview
    })

    return NextResponse.json({
      data: {
        url: downloadUrl,
        mimeType: document.mimeType,
        expiresIn,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
