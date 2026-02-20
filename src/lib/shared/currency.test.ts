import { dollarsToCents, centsToDollars, formatAUD, parseCurrencyToCents } from './currency'

describe('currency utilities', () => {
  describe('dollarsToCents', () => {
    it('converts whole dollars to cents', () => {
      expect(dollarsToCents(10)).toBe(1000)
    })

    it('converts decimal dollars to cents without floating point errors', () => {
      expect(dollarsToCents(193.99)).toBe(19399)
      expect(dollarsToCents(1.05)).toBe(105)
    })
  })

  describe('centsToDollars', () => {
    it('converts cents to dollars', () => {
      expect(centsToDollars(1000)).toBe(10)
      expect(centsToDollars(19399)).toBe(193.99)
    })
  })

  describe('formatAUD', () => {
    it('formats cents as AUD string', () => {
      expect(formatAUD(19399)).toBe('$193.99')
      expect(formatAUD(0)).toBe('$0.00')
    })
  })

  describe('parseCurrencyToCents', () => {
    it('parses a currency string to cents', () => {
      expect(parseCurrencyToCents('$193.99')).toBe(19399)
      expect(parseCurrencyToCents('10.00')).toBe(1000)
    })

    it('returns null for invalid input', () => {
      expect(parseCurrencyToCents('abc')).toBeNull()
    })
  })
})
