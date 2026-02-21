/**
 * GET /api/invoices/[id]/presigned-url
 *
 * Returns a 15-minute presigned S3 GET URL for the invoice PDF.
 * REQ-011: S3 bucket is in ap-southeast-2.
 * REQ-016: Object is server-side encrypted (AES-256).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getInvoice } from '@/lib/modules/invoices/invoices'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60 // 15 minutes

function makeS3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')
    const { id } = await params

    const invoice = await getInvoice(id)

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (!invoice.s3Key || !invoice.s3Bucket) {
      return NextResponse.json(
        { error: 'No document attached to this invoice', code: 'NO_DOCUMENT' },
        { status: 404 }
      )
    }

    const s3 = makeS3Client()
    const command = new GetObjectCommand({
      Bucket: invoice.s3Bucket,
      Key: invoice.s3Key,
    })

    const downloadUrl = await getSignedUrl(s3, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    })

    // Extract a user-friendly filename
    const filename = invoice.s3Key.split('/').pop() ?? `invoice-${id}.pdf`

    return NextResponse.json({
      data: {
        downloadUrl,
        filename,
        expiresInSeconds: PRESIGNED_URL_EXPIRY_SECONDS,
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
