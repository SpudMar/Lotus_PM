/**
 * NDIS Invoice Data Extraction from AWS Textract LINE blocks.
 *
 * Uses regex heuristics tuned for Australian NDIS provider invoices.
 * All amounts returned in cents (integers — never floats). REQ: amounts in cents.
 * Returns null for any field that cannot be confidently extracted — the human
 * fills those in during the PENDING_REVIEW step.
 *
 * Never throws. Partial extraction is always better than failure.
 */

import type { Block } from '@aws-sdk/client-textract'

// ── Exported types ─────────────────────────────────────────────────────────────

export interface ExtractedLineItem {
  /** NDIS support item code, e.g. "15_042_0128_1_3" */
  supportItemCode: string
  /** Human-readable name (falls back to code if not parseable) */
  supportItemName: string
  /** First 2 digits of support item code, e.g. "15" */
  categoryCode: string
  /** Service date. Falls back to today if not parseable from the line. */
  serviceDate: Date
  /** Number of units (hours, sessions, etc.). Defaults to 1. */
  quantity: number
  /** Unit price in cents */
  unitPriceCents: number
  /** Line total in cents */
  totalCents: number
  /** GST for this line in cents (usually 0 — NDIS services are mostly GST-free) */
  gstCents: number
}

export interface ExtractedInvoiceData {
  invoiceNumber: string | null
  invoiceDate: Date | null
  subtotalCents: number | null
  gstCents: number | null
  totalCents: number | null
  /** Normalized ABN (11 digits, no spaces) for provider lookup */
  providerAbn: string | null
  lineItems: ExtractedLineItem[]
  /** Average Textract confidence, 0.0–1.0 */
  confidence: number
}

// ── Internal patterns ──────────────────────────────────────────────────────────

/** NDIS support item code: e.g. 15_042_0128_1_3 */
const NDIS_CODE_RE = /\b(\d{2}_\d{3}_\d{4}_\d_\d)\b/

/** ABN: 12 345 678 901 or 12345678901 */
const ABN_RE = /\b(?:abn|australian\s+business\s+number)\s*:?\s*(\d{2}\s*\d{3}\s*\d{3}\s*\d{3})\b/i

/** Currency amount: $1,234.56 or 1,234.56 or 1234.56 */
const AMOUNT_RE = /\$?\s*([\d,]+(?:\.\d{1,2})?)/g

/** Month name → 1-based number */
const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

/**
 * Parse a currency string to an integer cent amount.
 * Returns null if the string cannot be parsed as a positive number.
 */
function parseToCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100)
}

/**
 * Parse a date string using AU date conventions (DD/MM/YYYY first).
 * Returns null if no date can be parsed.
 */
export function parseAuDate(text: string): Date | null {
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/.exec(text)
  if (dmy) {
    const d = parseInt(dmy[1]!, 10)
    const m = parseInt(dmy[2]!, 10)
    const y = parseInt(dmy[3]!, 10)
    const date = new Date(Date.UTC(y, m - 1, d))
    if (!isNaN(date.getTime()) && date.getUTCFullYear() === y) return date
  }

  // D Month YYYY / D MonthName YYYY
  const named =
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/i.exec(
      text
    )
  if (named) {
    const d = parseInt(named[1]!, 10)
    const month = MONTH_MAP[named[2]!.toLowerCase().slice(0, 3)]
    const y = parseInt(named[3]!, 10)
    if (month) {
      const date = new Date(Date.UTC(y, month - 1, d))
      if (!isNaN(date.getTime())) return date
    }
  }

  // YYYY-MM-DD (ISO)
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text)
  if (iso) {
    const y = parseInt(iso[1]!, 10)
    const m = parseInt(iso[2]!, 10)
    const d = parseInt(iso[3]!, 10)
    const date = new Date(Date.UTC(y, m - 1, d))
    if (!isNaN(date.getTime()) && date.getUTCFullYear() === y) return date
  }

  return null
}

/** Strip spaces from an 11-digit ABN string → "12345678901" */
function normalizeAbn(raw: string): string {
  return raw.replace(/\s/g, '')
}

/**
 * Extract all positive dollar amounts from a string, returned as cent integers.
 */
function extractAmounts(text: string): number[] {
  const amounts: number[] = []
  const re = /\$?\s*([\d,]+(?:\.\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const cents = parseToCents(m[1]!)
    if (cents !== null && cents > 0) amounts.push(cents)
  }
  return amounts
}

// ── Main extraction ────────────────────────────────────────────────────────────

/**
 * Extract NDIS invoice data from an array of AWS Textract Block objects.
 *
 * Only LINE-type blocks are used for extraction — they carry complete text
 * lines with good confidence scores. WORD and TABLE blocks are ignored.
 *
 * @param blocks - Raw Textract blocks from GetDocumentTextDetection response
 * @returns Extracted invoice data. Unknown fields are null. Never throws.
 */
export function extractInvoiceData(blocks: Block[]): ExtractedInvoiceData {
  // Only LINE blocks carry useful sentence-level text
  const lineBlocks = blocks.filter((b) => b.BlockType === 'LINE' && b.Text)
  const lines = lineBlocks.map((b) => b.Text!)

  // Average Textract confidence (0–100 → 0.0–1.0)
  const confidences = lineBlocks
    .filter((b) => b.Confidence !== undefined)
    .map((b) => (b.Confidence ?? 0) / 100)
  const confidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : 0

  const fullText = lines.join('\n')

  // ── Invoice number ──────────────────────────────────────────────────────────
  let invoiceNumber: string | null = null
  const invNumRe =
    /(?:invoice\s*(?:#|no\.?|num(?:ber)?)\s*:?\s*|inv[-#]\s*)([A-Z0-9][-A-Z0-9/]{1,30})/i
  const invNumMatch = invNumRe.exec(fullText)
  if (invNumMatch?.[1]) {
    invoiceNumber = invNumMatch[1].trim()
  }

  // ── Invoice date ────────────────────────────────────────────────────────────
  let invoiceDate: Date | null = null
  const dateLabelRe =
    /(?:invoice\s+date|date\s+of\s+(?:invoice|tax\s+invoice)|tax\s+invoice\s+date|date)\s*:?\s*/i
  for (const line of lines) {
    if (dateLabelRe.test(line)) {
      const withoutLabel = line.replace(dateLabelRe, '')
      invoiceDate = parseAuDate(withoutLabel) ?? parseAuDate(line)
      if (invoiceDate) break
    }
  }
  // Fallback: first parseable date anywhere in the document
  if (!invoiceDate) {
    invoiceDate = parseAuDate(fullText)
  }

  // ── Total (use last match — grand total appears after all line items) ───────
  let totalCents: number | null = null
  const totalRe =
    /\b(?:total(?:\s+(?:due|payable|amount|inc\.?\s*gst|gst))?|amount\s+(?:due|payable))\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi
  const totalMatches = [...fullText.matchAll(totalRe)]
  if (totalMatches.length > 0) {
    const last = totalMatches[totalMatches.length - 1]!
    if (last[1]) totalCents = parseToCents(last[1])
  }

  // ── GST ──────────────────────────────────────────────────────────────────────
  let gstCents: number | null = null
  const gstRe =
    /\bgst(?:\s+(?:amount|charged|component|inclusive|included))?\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  const gstMatch = gstRe.exec(fullText)
  if (gstMatch?.[1]) {
    gstCents = parseToCents(gstMatch[1])
  }

  // ── Subtotal ─────────────────────────────────────────────────────────────────
  let subtotalCents: number | null = null
  const subtotalRe =
    /\bsub[\s-]?total(?:\s+(?:ex\.?\s*gst|before\s+gst|ex\s+tax))?\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  const subtotalMatch = subtotalRe.exec(fullText)
  if (subtotalMatch?.[1]) {
    subtotalCents = parseToCents(subtotalMatch[1])
  }
  // Derive subtotal = total − GST when not explicitly stated
  if (subtotalCents === null && totalCents !== null && gstCents !== null) {
    subtotalCents = totalCents - gstCents
  }

  // ── Provider ABN ─────────────────────────────────────────────────────────────
  let providerAbn: string | null = null
  const abnMatch = ABN_RE.exec(fullText)
  if (abnMatch?.[1]) {
    providerAbn = normalizeAbn(abnMatch[1])
  }

  // ── NDIS line items ───────────────────────────────────────────────────────────
  const lineItems: ExtractedLineItem[] = []
  const today = new Date()

  for (const line of lines) {
    const codeMatch = NDIS_CODE_RE.exec(line)
    if (!codeMatch?.[1]) continue

    const supportItemCode = codeMatch[1]
    const categoryCode = supportItemCode.slice(0, 2)

    // Remove code from line to parse the rest cleanly
    const rest = line.replace(NDIS_CODE_RE, '').trim()

    // All positive dollar amounts on the remainder of this line
    const amounts = extractAmounts(rest)

    // Quantity: look for a decimal/integer before a unit keyword, or a standalone number
    let quantity = 1
    const qtyMatch = /\b(\d+(?:\.\d+)?)\s*(?:hr|hrs|hours?|ea|each|unit|units|x\b)/i.exec(rest)
    if (qtyMatch?.[1]) {
      const q = parseFloat(qtyMatch[1])
      if (q > 0 && q < 10_000) quantity = q
    }

    // Determine line total and unit price
    // Convention: if ≥2 amounts, last = line total, second-to-last = unit price
    let lineTotal: number
    let unitPrice: number
    if (amounts.length >= 2) {
      lineTotal = amounts[amounts.length - 1]!
      unitPrice = amounts[amounts.length - 2]!
    } else if (amounts.length === 1) {
      lineTotal = amounts[0]!
      unitPrice = amounts[0]!
    } else {
      continue // No amounts — not a valid line item
    }

    // Service date: prefer a date on this line, fall back to today
    const serviceDate = parseAuDate(line) ?? today

    // Support item name: leading text before the code on this line, or after
    const beforeCode = line.slice(0, codeMatch.index).trim()
    const nameMatch = /^([A-Za-z][A-Za-z\s/\-&,.]{2,80})/.exec(
      beforeCode.length > 0 ? beforeCode : rest
    )
    const supportItemName = nameMatch?.[1]?.trim() ?? supportItemCode

    lineItems.push({
      supportItemCode,
      supportItemName,
      categoryCode,
      serviceDate,
      quantity,
      unitPriceCents: unitPrice,
      totalCents: lineTotal,
      gstCents: 0, // Line-level GST rarely appears on NDIS invoices; handled at invoice total
    })
  }

  return {
    invoiceNumber,
    invoiceDate,
    subtotalCents,
    gstCents,
    totalCents,
    providerAbn,
    lineItems,
    confidence,
  }
}
