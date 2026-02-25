/**
 * POST /api/invoices/extract-pdf
 *
 * Accepts a PDF file (multipart/form-data, field name "file", max 10 MB).
 * Runs Textract AnalyzeDocument (synchronous, raw bytes — no S3 needed),
 * then passes the extracted text through the AI processor (Bedrock Claude).
 * Returns extracted invoice fields as JSON. No DB writes.
 *
 * REQ-011: All AWS calls target ap-southeast-2.
 * REQ-017: RBAC — requires invoices:write.
 */

import { NextResponse, type NextRequest } from 'next/server'
import {
  TextractClient,
  AnalyzeDocumentCommand,
  FeatureType,
  type Block,
} from '@aws-sdk/client-textract'
import { requirePermission } from '@/lib/auth/session'
import { processWithAI } from '@/lib/modules/invoices/ai-processor'
import type { AIProcessingInput } from '@/lib/modules/invoices/ai-processor'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

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

    // 7. Textract AnalyzeDocument (synchronous — raw bytes, no S3)
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

    // 8. Extract plain text from blocks
    const extractedText = extractTextFromBlocks(blocks)

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the PDF', code: 'EXTRACTION_EMPTY' },
        { status: 422 },
      )
    }

    // 9. AI interpretation via Bedrock Claude
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

    if (!aiResult) {
      return NextResponse.json(
        { error: 'AI could not interpret the invoice content', code: 'AI_EXTRACTION_FAILED' },
        { status: 422 },
      )
    }

    // 10. Map AI result to the response schema
    const data = {
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
