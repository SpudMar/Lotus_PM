/**
 * Documents storage module — S3 presigned URL generation and file deletion.
 * REQ-011: All data stored in AWS ap-southeast-2 (enforced by S3 bucket region).
 * REQ-016: Encryption at rest via S3 server-side encryption.
 *
 * S3 key pattern: documents/{participantId|'general'}/{documentId}/{filename}
 */

import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ─── S3 client (singleton) ────────────────────────────────────────────────

let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
    })
  }
  return _s3Client
}

// ─── Bucket helper ─────────────────────────────────────────────────────────

function getBucket(): string {
  const bucket = process.env['AWS_S3_BUCKET']
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET environment variable is not set')
  }
  return bucket
}

// ─── Key builder ───────────────────────────────────────────────────────────

/**
 * Build a canonical S3 key for a document.
 * Pattern: documents/{participantId|'general'}/{documentId}/{filename}
 */
export function buildS3Key(params: {
  participantId?: string | null
  documentId: string
  filename: string
}): string {
  const scope = params.participantId ?? 'general'
  // Sanitise filename: strip path traversal, collapse whitespace
  const safe = params.filename.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
  return `documents/${scope}/${params.documentId}/${safe}`
}

// ─── Presigned upload URL ──────────────────────────────────────────────────

export interface GenerateUploadUrlResult {
  uploadUrl: string
  s3Key: string
  s3Bucket: string
  /** URL expires in seconds (default 15 min) */
  expiresIn: number
}

/**
 * Generate a presigned PUT URL so the client can upload directly to S3.
 * The server never receives the file bytes — only the metadata is stored in DB.
 */
export async function generateUploadUrl(params: {
  participantId?: string | null
  documentId: string
  filename: string
  mimeType: string
  /** Presigned URL lifetime in seconds. Default: 900 (15 min). Max: 3600. */
  expiresIn?: number
}): Promise<GenerateUploadUrlResult> {
  const bucket = getBucket()
  const expiresIn = Math.min(params.expiresIn ?? 900, 3600)
  const s3Key = buildS3Key({
    participantId: params.participantId,
    documentId: params.documentId,
    filename: params.filename,
  })

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: params.mimeType,
    // Server-side encryption — REQ-016
    ServerSideEncryption: 'AES256',
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn })

  return { uploadUrl, s3Key, s3Bucket: bucket, expiresIn }
}

// ─── Presigned download URL ────────────────────────────────────────────────

export interface GenerateDownloadUrlResult {
  downloadUrl: string
  /** URL expires in seconds (default 5 min) */
  expiresIn: number
}

/**
 * Generate a presigned GET URL for downloading a document.
 * Short-lived by default (5 min) to limit exposure.
 */
export async function generateDownloadUrl(params: {
  s3Key: string
  s3Bucket?: string
  /** Presigned URL lifetime in seconds. Default: 300 (5 min). Max: 3600. */
  expiresIn?: number
}): Promise<GenerateDownloadUrlResult> {
  const bucket = params.s3Bucket ?? getBucket()
  const expiresIn = Math.min(params.expiresIn ?? 300, 3600)

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.s3Key,
  })

  const downloadUrl = await getSignedUrl(getS3Client(), command, { expiresIn })

  return { downloadUrl, expiresIn }
}

// ─── Delete file ───────────────────────────────────────────────────────────

/**
 * Delete a file from S3.
 * Called during hard-delete scenarios (admin cleanup) — not normal soft-delete flow.
 */
export async function deleteFile(params: {
  s3Key: string
  s3Bucket?: string
}): Promise<void> {
  const bucket = params.s3Bucket ?? getBucket()

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: params.s3Key,
  })

  await getS3Client().send(command)
}
