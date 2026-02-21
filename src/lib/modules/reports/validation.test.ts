import { dateRangeSchema, reportTypeSchema } from './validation'

describe('dateRangeSchema', () => {
  test('accepts valid date range', () => {
    const result = dateRangeSchema.safeParse({
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    })
    expect(result.success).toBe(true)
  })

  test('accepts Date objects', () => {
    const result = dateRangeSchema.safeParse({
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-12-31'),
    })
    expect(result.success).toBe(true)
  })

  test('rejects when start is after end', () => {
    const result = dateRangeSchema.safeParse({
      periodStart: '2026-12-31',
      periodEnd: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })

  test('accepts same date for start and end', () => {
    const result = dateRangeSchema.safeParse({
      periodStart: '2026-06-15',
      periodEnd: '2026-06-15',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid date strings', () => {
    const result = dateRangeSchema.safeParse({
      periodStart: 'not-a-date',
      periodEnd: '2026-12-31',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing fields', () => {
    const noStart = dateRangeSchema.safeParse({ periodEnd: '2026-12-31' })
    expect(noStart.success).toBe(false)

    const noEnd = dateRangeSchema.safeParse({ periodStart: '2026-01-01' })
    expect(noEnd.success).toBe(false)
  })
})

describe('reportTypeSchema', () => {
  test('accepts valid report types', () => {
    const types = ['dashboard', 'financial', 'compliance', 'providers', 'budget'] as const
    for (const type of types) {
      const result = reportTypeSchema.safeParse({ type })
      expect(result.success).toBe(true)
    }
  })

  test('rejects invalid report type', () => {
    const result = reportTypeSchema.safeParse({ type: 'invalid' })
    expect(result.success).toBe(false)
  })

  test('rejects missing type', () => {
    const result = reportTypeSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
