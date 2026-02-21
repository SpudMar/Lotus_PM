import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { generateUploadUrlSchema } from '@/lib/modules/documents/validation'
import { generateUploadUrl } from '@/lib/modules/documents/storage'
import { ZodError } from 'zod'
import { randomUUID } from 'crypto'

/**
 * POST /api/documents/upload
 *
 * Returns a presigned S3 PUT URL so the client can upload directly to S3.
 * Flow:
 *   1. Client calls this endpoint with file metadata (name, mime, size, participantId)
 *   2. Server generates a presigned PUT URL + a placeholder document ID
 *   3. Client PUTs the file bytes directly to S3 using the presigned URL
 *   4. Client calls POST /api/documents with the s3Key + s3Bucket to save the metadata
 *
 * The document record is NOT created here — only the upload URL is issued.
 * This keeps the presigned URL step separate from DB record creation so
 * failed uploads don't leave orphaned records.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('documents:write')

    const body = await request.json() as unknown
    const input = generateUploadUrlSchema.parse(body)

    // Generate a stable document ID for the S3 key path
    const documentId = randomUUID()

    const result = await generateUploadUrl({
      participantId: input.participantId,
      documentId,
      filename: input.filename,
      mimeType: input.mimeType,
    })

    return NextResponse.json({
      data: {
        uploadUrl: result.uploadUrl,
        s3Key: result.s3Key,
        s3Bucket: result.s3Bucket,
        documentId,
        expiresIn: result.expiresIn,
      },
    })
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

