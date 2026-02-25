/**
 * GET /api/invoices/extract-pdf/preview-url
 *
 * Returns a 15-minute presigned S3 GET URL for a PDF that was uploaded to
 * the manual uploads prefix (uploads/manual/...) as part of extraction.
 * Used by the PdfViewer component on the upload page BEFORE the invoice is saved.
 *
 * Query params:
 *   s3Key    - the S3 key (must start with "uploads/manual/")
 *   s3Bucket - the S3 bucket name
 *
 * Security: only keys starting with "uploads/manual/" are allowed to prevent
 * this endpoint being used to expose arbitrary S3 keys.
 *
 * REQ-011: S3 bucket is in ap-southeast-2.
 * REQ-017: RBAC — requires invoices:write (uploader permission).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60 // 15 minutes
const ALLOWED_KEY_PREFIX = 'uploads/manual/'

function makeS3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('invoices:write')

    const s3Key = request.nextUrl.searchParams.get('s3Key')
    const s3Bucket = request.nextUrl.searchParams.get('s3Bucket')

    if (!s3Key || !s3Bucket) {
      return NextResponse.json(
        { error: 's3Key and s3Bucket are required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    // Security: only allow keys from the manual upload prefix
    if (!s3Key.startsWith(ALLOWED_KEY_PREFIX)) {
      return NextResponse.json(
        { error: 'Invalid s3Key — only manual upload keys are accessible via this endpoint', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const s3 = makeS3Client()
    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
    })

    const url = await getSignedUrl(s3, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    })

    return NextResponse.json({
      data: {
        url,
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
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
