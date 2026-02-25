/**
 * GET /api/approval/[token]/pdf
 *
 * Public endpoint — no authentication required.
 * Returns a presigned S3 GET URL for the invoice PDF associated with the approval token.
 *
 * Security: Token-gated. The approval token is verified (signature + expiry).
 * Only the invoice's own PDF is accessible — no arbitrary S3 keys.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { verifyApprovalToken } from '@/lib/modules/invoices/participant-approval'
import { prisma } from '@/lib/db'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60 // 15 minutes

function makeS3Client(): S3Client {
  return new S3Client({ region: process.env['AWS_REGION'] ?? 'ap-southeast-2' })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params

    // Verify token (checks signature + expiry)
    let payload: { invoiceId: string }
    try {
      payload = verifyApprovalToken(token)
    } catch (error) {
      if (error instanceof Error && error.message === 'Token expired') {
        return NextResponse.json(
          { error: 'Token has expired', code: 'TOKEN_EXPIRED' },
          { status: 410 },
        )
      }
      return NextResponse.json(
        { error: 'Invalid token', code: 'INVALID_TOKEN' },
        { status: 400 },
      )
    }

    // Fetch invoice to get S3 key
    const invoice = await prisma.invInvoice.findFirst({
      where: { id: payload.invoiceId, deletedAt: null },
      select: { s3Key: true, s3Bucket: true },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    if (!invoice.s3Key || !invoice.s3Bucket) {
      return NextResponse.json(
        { error: 'No PDF attached to this invoice', code: 'NO_DOCUMENT' },
        { status: 404 },
      )
    }

    const s3 = makeS3Client()
    const command = new GetObjectCommand({
      Bucket: invoice.s3Bucket,
      Key: invoice.s3Key,
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
  } catch {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
