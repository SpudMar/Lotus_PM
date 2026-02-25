/**
 * GET /api/documents/preview?s3Key=...&s3Bucket=...
 *
 * Returns a 15-minute presigned S3 GET URL for previewing a document stored in S3.
 * Accepts s3Key and s3Bucket as query parameters.
 *
 * Security: only keys starting with "documents/" are allowed to prevent
 * this endpoint being used to expose arbitrary S3 keys.
 *
 * REQ-011: S3 bucket is in ap-southeast-2.
 * REQ-017: RBAC — requires documents:read.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { generateDownloadUrl } from '@/lib/modules/documents/storage'

const ALLOWED_KEY_PREFIX = 'documents/'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('documents:read')

    const s3Key = request.nextUrl.searchParams.get('s3Key')
    const s3Bucket = request.nextUrl.searchParams.get('s3Bucket')

    if (!s3Key || !s3Bucket) {
      return NextResponse.json(
        { error: 's3Key and s3Bucket are required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    // Security: only allow keys from the documents prefix
    if (!s3Key.startsWith(ALLOWED_KEY_PREFIX)) {
      return NextResponse.json(
        { error: 'Invalid s3Key — only document keys are accessible via this endpoint', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const { downloadUrl, expiresIn } = await generateDownloadUrl({
      s3Key,
      s3Bucket,
      expiresIn: 900, // 15 minutes for preview
    })

    return NextResponse.json({
      data: {
        url: downloadUrl,
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
