import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getDocumentById } from '@/lib/modules/documents/documents'
import { generateDownloadUrl } from '@/lib/modules/documents/storage'

/**
 * GET /api/documents/[id]/download
 *
 * Returns a short-lived presigned S3 GET URL for the document.
 * The client uses this URL to download the file directly from S3.
 * URL expires in 5 minutes by default.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePermission('documents:read')
    const { id } = await params

    const document = await getDocumentById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const { downloadUrl, expiresIn } = await generateDownloadUrl({
      s3Key: document.s3Key,
      s3Bucket: document.s3Bucket,
    })

    return NextResponse.json({
      data: {
        downloadUrl,
        expiresIn,
        filename: document.name,
        mimeType: document.mimeType,
      },
    })
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
