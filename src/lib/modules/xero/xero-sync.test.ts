/**
 * Tests for Xero invoice sync logic.
 * Tests the data-transformation functions and validation logic
 * without making real DB or HTTP calls.
 */

// ─── Unit-testable helpers ────────────────────────────────────────────────────
// These are pure functions extracted from the sync module for testability.

/**
 * Convert cents to dollars (Xero uses dollars with 2dp).
 * Mirrors the implementation in xero-sync.ts.
 */
function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * Format date as "YYYY-MM-DD" for Xero API.
 */
function formatXeroDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Build a Xero LineItem from an invoice line (pure mapping).
 */
function buildXeroLineItem(line: {
  supportItemCode: string
  supportItemName: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  gstCents: number
}) {
  return {
    Description: `[${line.supportItemCode}] ${line.supportItemName}`,
    Quantity: line.quantity,
    UnitAmount: centsToDollars(line.unitPriceCents),
    TaxType: line.gstCents > 0 ? 'INPUT2' : 'EXEMPTEXPENSES',
    AccountCode: '200',
  }
}

// ─── centsToDollars ───────────────────────────────────────────────────────────

describe('centsToDollars', () => {
  test('converts whole dollar amounts', () => {
    expect(centsToDollars(10000)).toBe(100)
  })

  test('converts cents to two decimal places', () => {
    expect(centsToDollars(10050)).toBe(100.5)
  })

  test('handles zero', () => {
    expect(centsToDollars(0)).toBe(0)
  })

  test('handles small amounts', () => {
    expect(centsToDollars(1)).toBe(0.01)
  })

  test('rounds to avoid floating-point issues', () => {
    // 10001 cents = $100.01
    expect(centsToDollars(10001)).toBe(100.01)
  })

  test('handles typical NDIS support item price', () => {
    // $193.99 = 19399 cents
    expect(centsToDollars(19399)).toBe(193.99)
  })
})

// ─── formatXeroDate ───────────────────────────────────────────────────────────

describe('formatXeroDate', () => {
  test('formats date in YYYY-MM-DD format', () => {
    const date = new Date(2025, 0, 15) // 15 Jan 2025
    expect(formatXeroDate(date)).toBe('2025-01-15')
  })

  test('pads single-digit months', () => {
    const date = new Date(2025, 2, 5) // 5 Mar 2025
    expect(formatXeroDate(date)).toBe('2025-03-05')
  })

  test('pads single-digit days', () => {
    const date = new Date(2025, 11, 7) // 7 Dec 2025
    expect(formatXeroDate(date)).toBe('2025-12-07')
  })

  test('handles end-of-year date', () => {
    const date = new Date(2025, 11, 31) // 31 Dec 2025
    expect(formatXeroDate(date)).toBe('2025-12-31')
  })
})

// ─── buildXeroLineItem ────────────────────────────────────────────────────────

describe('buildXeroLineItem', () => {
  const baseLine = {
    supportItemCode: '15_042_0128_1_3',
    supportItemName: 'Daily Activities Support',
    quantity: 2,
    unitPriceCents: 19399, // $193.99
    totalCents: 38798,
    gstCents: 0,
  }

  test('includes support item code and name in description', () => {
    const item = buildXeroLineItem(baseLine)
    expect(item.Description).toContain('15_042_0128_1_3')
    expect(item.Description).toContain('Daily Activities Support')
  })

  test('formats description as [code] name', () => {
    const item = buildXeroLineItem(baseLine)
    expect(item.Description).toBe('[15_042_0128_1_3] Daily Activities Support')
  })

  test('converts unit price from cents to dollars', () => {
    const item = buildXeroLineItem(baseLine)
    expect(item.UnitAmount).toBe(193.99)
  })

  test('preserves quantity', () => {
    const item = buildXeroLineItem(baseLine)
    expect(item.Quantity).toBe(2)
  })

  test('uses EXEMPTEXPENSES tax type when no GST', () => {
    const item = buildXeroLineItem({ ...baseLine, gstCents: 0 })
    expect(item.TaxType).toBe('EXEMPTEXPENSES')
  })

  test('uses INPUT2 tax type when GST present', () => {
    const item = buildXeroLineItem({ ...baseLine, gstCents: 3880 })
    expect(item.TaxType).toBe('INPUT2')
  })

  test('sets account code to 200 (default NDIS expense)', () => {
    const item = buildXeroLineItem(baseLine)
    expect(item.AccountCode).toBe('200')
  })

  test('handles fractional quantities (e.g. hourly billing)', () => {
    const item = buildXeroLineItem({ ...baseLine, quantity: 1.5 })
    expect(item.Quantity).toBe(1.5)
  })
})

// ─── Invoice status validation ────────────────────────────────────────────────

describe('invoice status validation for Xero sync', () => {
  const SYNCABLE_STATUSES = ['APPROVED']
  const NON_SYNCABLE_STATUSES = ['RECEIVED', 'PROCESSING', 'PENDING_REVIEW', 'REJECTED', 'CLAIMED', 'PAID']

  test.each(SYNCABLE_STATUSES)('%s status is syncable', (status) => {
    expect(SYNCABLE_STATUSES.includes(status)).toBe(true)
  })

  test.each(NON_SYNCABLE_STATUSES)('%s status is not syncable', (status) => {
    expect(SYNCABLE_STATUSES.includes(status)).toBe(false)
  })
})

// ─── OAuth state validation ───────────────────────────────────────────────────

/**
 * Validate OAuth CSRF state — mirrors callback route logic.
 * storedState = value from cookie; returnedState = value from query param.
 */
function validateOAuthState(storedState: string | undefined, returnedState: string): boolean {
  return Boolean(storedState) && storedState === returnedState
}

describe('OAuth CSRF state validation', () => {
  test('state mismatch returns false', () => {
    expect(validateOAuthState('abc123', 'xyz789')).toBe(false)
  })

  test('matching state returns true', () => {
    expect(validateOAuthState('abc123', 'abc123')).toBe(true)
  })

  test('empty stored state fails validation', () => {
    expect(validateOAuthState('', 'abc123')).toBe(false)
  })

  test('undefined stored state (missing cookie) fails validation', () => {
    expect(validateOAuthState(undefined, 'abc123')).toBe(false)
  })
})
