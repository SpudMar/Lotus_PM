/**
 * POST /api/invoices/extract-pdf
 *
 * Accepts a PDF file (multipart/form-data, field name "file", max 10 MB).
 * 1. Uploads the PDF to S3 (uploads/manual/<timestamp>-<uuid>.pdf) — REQ-016.
 * 2. Runs Textract AnalyzeDocument (synchronous, raw bytes).
 * 3. Passes extracted text through the AI processor (Bedrock Claude).
 * 4. Falls back to a simpler Bedrock call if the tool-use extraction fails.
 * Returns extracted invoice fields + s3Key + s3Bucket. No DB writes.
 *
 * REQ-011: All AWS calls target ap-southeast-2.
 * REQ-016: S3 upload uses SSE-S3 (AES-256).
 * REQ-017: RBAC — requires invoices:write.
 */

import { NextResponse, type NextRequest } from 'next/server'
import {
  TextractClient,
  AnalyzeDocumentCommand,
  FeatureType,
  type Block,
} from '@aws-sdk/client-textract'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { randomUUID } from 'crypto'
import { requirePermission } from '@/lib/auth/session'
import { processWithAI } from '@/lib/modules/invoices/ai-processor'
import type { AIProcessingInput } from '@/lib/modules/invoices/ai-processor'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const DEFAULT_MODEL_ID = 'au.anthropic.claude-haiku-4-5-20251001-v1:0'

// ── Textract client (injectable for tests) ────────────────────────────────────

let textractClient: TextractClient | null = null

function getTextractClient(): TextractClient {
  if (textractClient) return textractClient
  textractClient = new TextractClient({
    region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
  })
  return textractClient
}

/** Test helper: inject a mock Textract client */
export function _setTextractClientForTest(client: TextractClient): void {
  textractClient = client
}

/** Test helper: reset to default Textract client */
export function _resetTextractClient(): void {
  textractClient = null
}

// ── S3 client (injectable for tests) ─────────────────────────────────────────

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (s3Client) return s3Client
  s3Client = new S3Client({
    region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
  })
  return s3Client
}

/** Test helper: inject a mock S3 client */
export function _setS3ClientForTest(client: S3Client): void {
  s3Client = client
}

/** Test helper: reset to default S3 client */
export function _resetS3Client(): void {
  s3Client = null
}

// ── Bedrock client (injectable for tests) ─────────────────────────────────────

let bedrockFallbackClient: BedrockRuntimeClient | null = null

function getBedrockFallbackClient(): BedrockRuntimeClient {
  if (bedrockFallbackClient) return bedrockFallbackClient
  bedrockFallbackClient = new BedrockRuntimeClient({
    region: process.env['AWS_REGION'] ?? 'ap-southeast-2',
  })
  return bedrockFallbackClient
}

/** Test helper: inject a mock Bedrock fallback client */
export function _setBedrockFallbackClientForTest(client: BedrockRuntimeClient): void {
  bedrockFallbackClient = client
}

/** Test helper: reset to default Bedrock fallback client */
export function _resetBedrockFallbackClient(): void {
  bedrockFallbackClient = null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract LINE and WORD block text from Textract AnalyzeDocument blocks.
 * Returns a single string of all line text separated by newlines.
 */
function extractTextFromBlocks(blocks: Block[]): string {
  return blocks
    .filter((b) => b.BlockType === 'LINE' && b.Text)
    .map((b) => b.Text!)
    .join('\n')
}

/**
 * Upload the PDF buffer to S3 and return the key.
 * Key: uploads/manual/<timestamp>-<uuid>.pdf
 * REQ-016: Server-side AES-256 encryption.
 */
async function uploadPdfToS3(pdfBuffer: Buffer, bucket: string): Promise<string> {
  const s3Key = `uploads/manual/${Date.now()}-${randomUUID()}.pdf`
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    }),
  )
  return s3Key
}

interface FallbackExtractionResult {
  providerName: string | null
  providerAbn: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  totalAmountCents: number | null
}

/**
 * Fallback extraction: uses a simple Bedrock prompt to extract just the basic
 * header fields when the full tool-use AI extraction returns null.
 * Returns basic fields only — line items will be empty.
 */
async function runFallbackExtraction(
  extractedText: string,
): Promise<FallbackExtractionResult | null> {
  const prompt = `Extract these fields from the invoice text and return JSON only (no markdown, no explanation):
{"providerName": null, "providerAbn": null, "invoiceNumber": null, "invoiceDate": null, "totalAmountCents": null}

Rules:
- invoiceDate must be in YYYY-MM-DD format or null
- totalAmountCents must be an integer in cents (e.g. $300.00 = 30000) or null
- providerAbn must be 11 digits with no spaces or null
- Return only the JSON object, nothing else

Invoice text:
---
${extractedText.slice(0, 4000)}
---`

  try {
    const client = getBedrockFallbackClient()
    const modelId = process.env['BEDROCK_MODEL_ID'] ?? DEFAULT_MODEL_ID

    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 512, temperature: 0 },
      }),
    )

    const textBlock = response.output?.message?.content?.find((b) => 'text' in b)
    if (!textBlock || !('text' in textBlock) || !(textBlock as { text?: string }).text) return null

    const raw = ((textBlock as { text: string }).text).trim()
    // Strip any markdown code fences if the model adds them
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>

    return {
      providerName: typeof parsed['providerName'] === 'string' ? parsed['providerName'] : null,
      providerAbn: typeof parsed['providerAbn'] === 'string' ? parsed['providerAbn'] : null,
      invoiceNumber: typeof parsed['invoiceNumber'] === 'string' ? parsed['invoiceNumber'] : null,
      invoiceDate: typeof parsed['invoiceDate'] === 'string' ? parsed['invoiceDate'] : null,
      totalAmountCents:
        typeof parsed['totalAmountCents'] === 'number'
          ? Math.round(parsed['totalAmountCents'])
          : null,
    }
  } catch (err) {
    console.error('[extract-pdf] Fallback extraction failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth + RBAC
    await requirePermission('invoices:write')

    // 2. Parse multipart form data
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Request must be multipart/form-data', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const file = formData.get('file')

    // 3. Validate file present
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'A PDF file is required in the "file" field', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    // 4. Validate content type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are accepted', code: 'UNSUPPORTED_MEDIA_TYPE' },
        { status: 415 },
      )
    }

    // 5. Validate file size
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds maximum of 10 MB', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    // 6. Read PDF into buffer
    const pdfBuffer = Buffer.from(await file.arrayBuffer())

    // 7. Upload PDF to S3 (before Textract — so the key is available even if extraction fails)
    const s3Bucket = process.env['S3_BUCKET_INVOICES'] ?? process.env['AWS_S3_BUCKET'] ?? ''
    let uploadedS3Key: string | null = null
    if (s3Bucket) {
      try {
        uploadedS3Key = await uploadPdfToS3(pdfBuffer, s3Bucket)
      } catch (err) {
        // Non-blocking: S3 upload failure must not prevent extraction from running.
        // The PM can still review the extracted fields; the PDF just won't be stored.
        console.error('[extract-pdf] S3 upload failed:', err instanceof Error ? err.message : err)
      }
    }

    // 8. Textract AnalyzeDocument (synchronous — raw bytes, no S3)
    let blocks: Block[]
    try {
      const client = getTextractClient()
      const result = await client.send(
        new AnalyzeDocumentCommand({
          Document: { Bytes: pdfBuffer },
          FeatureTypes: [FeatureType.TABLES, FeatureType.FORMS],
        }),
      )
      blocks = result.Blocks ?? []
    } catch (err) {
      console.error('[extract-pdf] Textract error:', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: 'Text extraction service error', code: 'EXTRACTION_ERROR' },
        { status: 500 },
      )
    }

    // 9. Extract plain text from blocks
    const extractedText = extractTextFromBlocks(blocks)

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the PDF', code: 'EXTRACTION_EMPTY' },
        { status: 422 },
      )
    }

    // 10. AI interpretation via Bedrock Claude (full tool-use path)
    const aiInput: AIProcessingInput = {
      extractedText,
      invoiceId: 'extract-preview', // No DB record — preview only
      providerName: null,
      providerAbn: null,
      providerType: null,
      participantName: null,
      participantNdisNumber: null,
      participantPlanCategories: [],
      historicalPatterns: [],
    }

    const aiResult = await processWithAI(aiInput)

    // 11. If full AI extraction succeeded, return rich result
    if (aiResult) {
      const data = {
        s3Key: uploadedS3Key,
        s3Bucket: uploadedS3Key ? s3Bucket : null,
        providerName: aiResult.providerName,
        providerAbn: aiResult.providerAbn,
        invoiceNumber: aiResult.invoiceNumber,
        invoiceDate: aiResult.invoiceDate, // ISO date string or null
        totalAmountCents: aiResult.totalCents,
        lineItems: aiResult.lineItems.map((item) => ({
          supportItemCode: item.suggestedNdisCode,
          supportItemName: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
          serviceDate: item.serviceDate,
        })),
      }

      return NextResponse.json({ data })
    }

    // 12. Full AI extraction returned null — try fallback
    console.error(
      '[extract-pdf] processWithAI returned null for text length:',
      extractedText.length,
    )

    const fallback = await runFallbackExtraction(extractedText)

    if (fallback) {
      const data = {
        s3Key: uploadedS3Key,
        s3Bucket: uploadedS3Key ? s3Bucket : null,
        providerName: fallback.providerName,
        providerAbn: fallback.providerAbn,
        invoiceNumber: fallback.invoiceNumber,
        invoiceDate: fallback.invoiceDate,
        totalAmountCents: fallback.totalAmountCents,
        // Empty line items — PM will add manually
        lineItems: [],
      }
      return NextResponse.json({ data })
    }

    // 13. Both paths failed — return 422
    return NextResponse.json(
      { error: 'AI could not interpret the invoice content', code: 'AI_EXTRACTION_FAILED' },
      { status: 422 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    console.error('[extract-pdf] Unexpected error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
