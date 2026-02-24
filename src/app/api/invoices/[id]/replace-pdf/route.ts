import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getInvoice, replacePdf } from '@/lib/modules/invoices/invoices'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
  })
}

function getBucket(): string {
  const bucket = process.env['AWS_S3_BUCKET']
  if (!bucket) throw new Error('AWS_S3_BUCKET environment variable is not set')
  return bucket
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:write')
    const { id } = await params

    const invoice = await getInvoice(id)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'A PDF file is required in the "file" field', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are accepted', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const MAX_SIZE = 20 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum of 20MB', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const now = new Date()
    const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
    const safeName = file.name.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
    const newS3Key = `invoices/${yearMonth}/${randomUUID()}_${safeName}`
    const bucket = getBucket()

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: newS3Key,
      Body: fileBuffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    })
    await getS3Client().send(command)

    const updated = await replacePdf(id, newS3Key, bucket, session.user.id)

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
