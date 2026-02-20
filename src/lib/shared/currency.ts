/**
 * Currency utilities for Lotus PM.
 * ALL monetary values are stored as integers (cents) — never floats.
 * REQ-016: Financial data integrity.
 */

/** Convert dollars (user input) to cents (storage) */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Convert cents (storage) to dollars (display) */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/** Format cents as AUD currency string, e.g. $1,234.56 */
export function formatAUD(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(centsToDollars(cents))
}

/** Parse a currency string to cents, returns null if invalid */
export function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed)) return null
  return dollarsToCents(parsed)
}
