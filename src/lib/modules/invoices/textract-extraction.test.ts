/**
 * Unit tests for NDIS invoice data extraction from Textract LINE blocks.
 *
 * All functions are pure (no I/O), so no mocks are required.
 * Tests cover: invoice number, date, totals, GST, ABN, line items,
 * and graceful handling of missing/incomplete data.
 */

import type { Block } from '@aws-sdk/client-textract'
import { extractInvoiceData, parseAuDate } from './textract-extraction'

// ── Helpers ───────────────────────────────────────────────────────────────────

function line(text: string, confidence = 99): Block {
  return { BlockType: 'LINE', Text: text, Confidence: confidence }
}

/** Build a minimal set of Textract blocks for a realistic NDIS invoice */
function buildSampleBlocks(): Block[] {
  return [
    line('Blue Mountains Allied Health'),
    line('ABN: 11 111 111 111'),
    line('Tax Invoice'),
    line('Invoice No: INV-2026-042'),
    line('Invoice Date: 15/02/2026'),
    line('To: Michael Thompson'),
    line('NDIS Number: 430111222'),
    line('15_042_0128_1_3 Support Coordination 2.0 hr $193.99 $387.98'),
    line('07_002_0106_1_3 Daily Activities Support 1.5 hr $65.00 $97.50'),
    line('Subtotal $485.48'),
    line('GST $48.55'),
    line('Total Due $534.03'),
  ]
}

// ── parseAuDate ───────────────────────────────────────────────────────────────

describe('parseAuDate', () => {
  test('parses DD/MM/YYYY', () => {
    const d = parseAuDate('15/02/2026')
    expect(d).not.toBeNull()
    expect(d!.getUTCDate()).toBe(15)
    expect(d!.getUTCMonth()).toBe(1) // 0-based
    expect(d!.getUTCFullYear()).toBe(2026)
  })

  test('parses DD-MM-YYYY with dashes', () => {
    const d = parseAuDate('01-12-2025')
    expect(d).not.toBeNull()
    expect(d!.getUTCDate()).toBe(1)
    expect(d!.getUTCMonth()).toBe(11)
    expect(d!.getUTCFullYear()).toBe(2025)
  })

  test('parses D Month YYYY (named month)', () => {
    const d = parseAuDate('3 February 2026')
    expect(d).not.toBeNull()
    expect(d!.getUTCDate()).toBe(3)
    expect(d!.getUTCMonth()).toBe(1)
    expect(d!.getUTCFullYear()).toBe(2026)
  })

  test('parses abbreviated month (3 Feb 2026)', () => {
    const d = parseAuDate('3 Feb 2026')
    expect(d).not.toBeNull()
    expect(d!.getUTCMonth()).toBe(1)
  })

  test('parses YYYY-MM-DD (ISO)', () => {
    const d = parseAuDate('2026-02-15')
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2026)
    expect(d!.getUTCMonth()).toBe(1)
    expect(d!.getUTCDate()).toBe(15)
  })

  test('returns null for unparseable string', () => {
    expect(parseAuDate('not a date')).toBeNull()
    expect(parseAuDate('')).toBeNull()
    expect(parseAuDate('N/A')).toBeNull()
  })
})

// ── extractInvoiceData — invoice number ───────────────────────────────────────

describe('extractInvoiceData — invoice number', () => {
  test('extracts invoice number from "Invoice No: INV-2026-042"', () => {
    const blocks = [line('Invoice No: INV-2026-042')]
    const result = extractInvoiceData(blocks)
    expect(result.invoiceNumber).toBe('INV-2026-042')
  })

  test('extracts invoice number from "Invoice #: ABC123"', () => {
    const result = extractInvoiceData([line('Invoice #: ABC123')])
    expect(result.invoiceNumber).toBe('ABC123')
  })

  test('extracts from "INV-001" prefix', () => {
    const result = extractInvoiceData([line('INV-001 for services rendered')])
    expect(result.invoiceNumber).toBe('001')
  })

  test('extracts from "Invoice Number 20260215"', () => {
    const result = extractInvoiceData([line('Invoice Number 20260215')])
    expect(result.invoiceNumber).toBe('20260215')
  })

  test('returns null when no invoice number found', () => {
    const result = extractInvoiceData([line('Support Coordination Services'), line('Total: $100.00')])
    expect(result.invoiceNumber).toBeNull()
  })
})

// ── extractInvoiceData — invoice date ─────────────────────────────────────────

describe('extractInvoiceData — invoice date', () => {
  test('extracts date from "Invoice Date: 15/02/2026"', () => {
    const result = extractInvoiceData([line('Invoice Date: 15/02/2026')])
    expect(result.invoiceDate).not.toBeNull()
    expect(result.invoiceDate!.getUTCDate()).toBe(15)
    expect(result.invoiceDate!.getUTCMonth()).toBe(1)
    expect(result.invoiceDate!.getUTCFullYear()).toBe(2026)
  })

  test('extracts date from "Date: 01-03-2026"', () => {
    const result = extractInvoiceData([line('Date: 01-03-2026')])
    expect(result.invoiceDate).not.toBeNull()
    expect(result.invoiceDate!.getUTCMonth()).toBe(2)
  })

  test('extracts date from line with named month', () => {
    const result = extractInvoiceData([line('Invoice Date: 5 March 2026')])
    expect(result.invoiceDate).not.toBeNull()
    expect(result.invoiceDate!.getUTCMonth()).toBe(2) // March = 2 (0-based)
  })

  test('returns null when no date anywhere in document', () => {
    const result = extractInvoiceData([line('ABN: 11 111 111 111'), line('Total $100.00')])
    expect(result.invoiceDate).toBeNull()
  })
})

// ── extractInvoiceData — amounts ──────────────────────────────────────────────

describe('extractInvoiceData — amounts (cents)', () => {
  test('extracts total from "Total Due $534.03"', () => {
    const result = extractInvoiceData([line('Total Due $534.03')])
    expect(result.totalCents).toBe(53403)
  })

  test('extracts total from "Amount Due $1,200.00" (with comma)', () => {
    const result = extractInvoiceData([line('Amount Due $1,200.00')])
    expect(result.totalCents).toBe(120000)
  })

  test('extracts GST from "GST $48.55"', () => {
    const result = extractInvoiceData([line('GST $48.55')])
    expect(result.gstCents).toBe(4855)
  })

  test('extracts GST from "GST Amount $10.00"', () => {
    const result = extractInvoiceData([line('GST Amount $10.00')])
    expect(result.gstCents).toBe(1000)
  })

  test('extracts subtotal from "Subtotal $485.48"', () => {
    const result = extractInvoiceData([line('Subtotal $485.48')])
    expect(result.subtotalCents).toBe(48548)
  })

  test('derives subtotal = total - GST when subtotal not stated', () => {
    const blocks = [line('Total Due $110.00'), line('GST $10.00')]
    const result = extractInvoiceData(blocks)
    expect(result.subtotalCents).toBe(10000)
  })

  test('uses last "Total" match as grand total (not intermediate subtotals)', () => {
    const blocks = [
      line('Subtotal $200.00'),
      line('GST $20.00'),
      line('Total Payable $220.00'),
    ]
    const result = extractInvoiceData(blocks)
    expect(result.totalCents).toBe(22000)
  })

  test('returns null amounts when not found', () => {
    const result = extractInvoiceData([line('Blue Mountains Allied Health')])
    expect(result.totalCents).toBeNull()
    expect(result.gstCents).toBeNull()
    expect(result.subtotalCents).toBeNull()
  })
})

// ── extractInvoiceData — ABN ───────────────────────────────────────────────────

describe('extractInvoiceData — provider ABN', () => {
  test('extracts and normalizes ABN from "ABN: 11 111 111 111"', () => {
    const result = extractInvoiceData([line('ABN: 11 111 111 111')])
    expect(result.providerAbn).toBe('11111111111')
  })

  test('extracts ABN without spaces "ABN: 12345678901"', () => {
    const result = extractInvoiceData([line('ABN: 12345678901')])
    expect(result.providerAbn).toBe('12345678901')
  })

  test('returns null when no ABN found', () => {
    const result = extractInvoiceData([line('Invoice #001'), line('Total $100.00')])
    expect(result.providerAbn).toBeNull()
  })
})

// ── extractInvoiceData — NDIS line items ──────────────────────────────────────

describe('extractInvoiceData — NDIS support item line items', () => {
  test('extracts a single line item with NDIS support item code', () => {
    const blocks = [
      line('15_042_0128_1_3 Support Coordination 2.0 hr $193.99 $387.98'),
    ]
    const result = extractInvoiceData(blocks)

    expect(result.lineItems).toHaveLength(1)
    const item = result.lineItems[0]!
    expect(item.supportItemCode).toBe('15_042_0128_1_3')
    expect(item.categoryCode).toBe('15')
    expect(item.totalCents).toBe(38798)
    expect(item.unitPriceCents).toBe(19399)
  })

  test('extracts multiple line items from the sample invoice', () => {
    const result = extractInvoiceData(buildSampleBlocks())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems[0]!.supportItemCode).toBe('15_042_0128_1_3')
    expect(result.lineItems[1]!.supportItemCode).toBe('07_002_0106_1_3')
  })

  test('extracts correct category code from support item code prefix', () => {
    const result = extractInvoiceData([
      line('07_002_0106_1_3 Daily Activities Support 1.0 hr $65.00 $65.00'),
    ])
    expect(result.lineItems[0]!.categoryCode).toBe('07')
  })

  test('defaults quantity to 1 when no quantity keyword found', () => {
    const result = extractInvoiceData([
      line('15_042_0128_1_3 Support Item $100.00'),
    ])
    expect(result.lineItems[0]!.quantity).toBe(1)
  })

  test('extracts quantity when followed by hr/hrs keyword', () => {
    const result = extractInvoiceData([
      line('15_042_0128_1_3 Support Coordination 3.5 hr $100.00 $350.00'),
    ])
    expect(result.lineItems[0]!.quantity).toBe(3.5)
  })

  test('sets gstCents to 0 per line (GST handled at invoice level for NDIS)', () => {
    const result = extractInvoiceData([
      line('15_042_0128_1_3 Support Item 1.0 hr $100.00 $100.00'),
    ])
    expect(result.lineItems[0]!.gstCents).toBe(0)
  })

  test('skips lines with NDIS code but no dollar amounts', () => {
    const result = extractInvoiceData([
      line('15_042_0128_1_3 Support Coordination description only'),
    ])
    expect(result.lineItems).toHaveLength(0)
  })

  test('returns empty lineItems when no NDIS codes found', () => {
    const result = extractInvoiceData([
      line('Invoice #001'),
      line('Total Due $100.00'),
    ])
    expect(result.lineItems).toHaveLength(0)
  })
})

// ── extractInvoiceData — full sample invoice ─────────────────────────────────

describe('extractInvoiceData — full sample invoice', () => {
  test('correctly extracts all fields from realistic NDIS invoice', () => {
    const result = extractInvoiceData(buildSampleBlocks())

    expect(result.invoiceNumber).toBe('INV-2026-042')
    expect(result.invoiceDate).not.toBeNull()
    expect(result.invoiceDate!.getUTCDate()).toBe(15)
    expect(result.providerAbn).toBe('11111111111')
    expect(result.totalCents).toBe(53403)
    expect(result.gstCents).toBe(4855)
    expect(result.subtotalCents).toBe(48548)
    expect(result.lineItems).toHaveLength(2)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})

// ── extractInvoiceData — missing fields / graceful handling ──────────────────

describe('extractInvoiceData — graceful handling of missing/empty input', () => {
  test('returns all-null fields for empty block array — never throws', () => {
    const result = extractInvoiceData([])

    expect(result.invoiceNumber).toBeNull()
    expect(result.invoiceDate).toBeNull()
    expect(result.totalCents).toBeNull()
    expect(result.gstCents).toBeNull()
    expect(result.subtotalCents).toBeNull()
    expect(result.providerAbn).toBeNull()
    expect(result.lineItems).toHaveLength(0)
    expect(result.confidence).toBe(0)
  })

  test('returns null fields when blocks contain only WORD and PAGE types', () => {
    const nonLineBlocks: Block[] = [
      { BlockType: 'PAGE', Text: undefined },
      { BlockType: 'WORD', Text: 'Invoice', Confidence: 99 },
      { BlockType: 'TABLE', Text: undefined },
    ]
    const result = extractInvoiceData(nonLineBlocks)
    expect(result.invoiceNumber).toBeNull()
    expect(result.lineItems).toHaveLength(0)
  })

  test('handles blocks with undefined Text gracefully', () => {
    const blocks: Block[] = [
      { BlockType: 'LINE', Text: undefined, Confidence: 95 },
      { BlockType: 'LINE', Text: 'Total Due $100.00', Confidence: 99 },
    ]
    expect(() => extractInvoiceData(blocks)).not.toThrow()
    const result = extractInvoiceData(blocks)
    expect(result.totalCents).toBe(10000)
  })

  test('handles blocks with undefined Confidence (confidence defaults to 0)', () => {
    const blocks: Block[] = [
      { BlockType: 'LINE', Text: 'Invoice #001', Confidence: undefined },
    ]
    const result = extractInvoiceData(blocks)
    expect(result.confidence).toBe(0)
  })

  test('never throws on any input — returns partial data', () => {
    const edgeCases: Block[][] = [
      [],
      [{ BlockType: 'LINE', Text: '$$$not_valid###' }],
      [{ BlockType: 'LINE', Text: '0_000_0000_0_0' }], // looks like NDIS code but no amounts
      [{ BlockType: 'LINE', Text: 'Date: not-a-date' }],
    ]

    for (const blocks of edgeCases) {
      expect(() => extractInvoiceData(blocks)).not.toThrow()
    }
  })
})

// ── extractInvoiceData — NDIS number extraction ───────────────────────────────

describe('extractInvoiceData — NDIS participant number', () => {
  test('extracts NDIS number from "NDIS Number: 430111222"', () => {
    const blocks = [line('NDIS Number: 430111222')]
    const result = extractInvoiceData(blocks)
    expect(result.participantNdisNumber).toBe('430111222')
  })

  test('normalizes NDIS number with spaces: "430 111 222" → "430111222"', () => {
    const blocks = [line('NDIS Number: 430 111 222')]
    const result = extractInvoiceData(blocks)
    expect(result.participantNdisNumber).toBe('430111222')
  })

  test('extracts from "Participant Number: 4301112223" (10 digits)', () => {
    const blocks = [line('Participant Number: 4301112223')]
    const result = extractInvoiceData(blocks)
    expect(result.participantNdisNumber).toBe('4301112223')
  })

  test('extracts from "NDIS No: 430111222"', () => {
    const blocks = [line('NDIS No: 430111222')]
    const result = extractInvoiceData(blocks)
    expect(result.participantNdisNumber).toBe('430111222')
  })

  test('extracts from "NDIS: 430111222" (no keyword after NDIS)', () => {
    const blocks = [line('NDIS: 430111222')]
    const result = extractInvoiceData(blocks)
    expect(result.participantNdisNumber).toBe('430111222')
  })

  test('returns null when no NDIS number present in document', () => {
    const blocks = [
      line('Invoice No: INV-001'),
      line('Total Due: $100.00'),
      line('ABN: 11 111 111 111'),
    ]
    const result = extractInvoiceData(blocks)
    expect(result.participantNdisNumber).toBeNull()
  })

  test('returns null for empty block array', () => {
    const result = extractInvoiceData([])
    expect(result.participantNdisNumber).toBeNull()
  })

  test('full sample invoice includes NDIS number in result', () => {
    // buildSampleBlocks has line('NDIS Number: 430111222')
    const result = extractInvoiceData(buildSampleBlocks())
    expect(result.participantNdisNumber).toBe('430111222')
  })
})

// ── extractInvoiceData — confidence ──────────────────────────────────────────

describe('extractInvoiceData — confidence score', () => {
  test('confidence is average of LINE block Confidence values, scaled to 0-1', () => {
    const blocks = [
      line('Invoice #001', 80),
      line('Total $100.00', 100),
    ]
    const result = extractInvoiceData(blocks)
    expect(result.confidence).toBeCloseTo(0.9, 1)
  })

  test('confidence is 0 when no blocks have Confidence set', () => {
    const blocks: Block[] = [{ BlockType: 'LINE', Text: 'Invoice #001' }]
    const result = extractInvoiceData(blocks)
    expect(result.confidence).toBe(0)
  })
})
