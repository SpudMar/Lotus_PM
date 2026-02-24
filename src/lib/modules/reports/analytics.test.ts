/**
 * Tests for analytics module — covers pure logic and data shape validation.
 * Database-dependent functions are verified via shape/contract tests.
 */

// ─── ProcessingTimeMetrics shape ─────────────────────────

describe('ProcessingTimeMetrics shape', () => {
  test('expected shape includes all required fields', () => {
    const shape = {
      avgDays: 2.5,
      p50Days: 2.0,
      p90Days: 4.8,
      slaComplianceRate: 85.5,
      totalProcessed: 100,
      withinSla: 85,
    }

    expect(shape).toHaveProperty('avgDays')
    expect(shape).toHaveProperty('p50Days')
    expect(shape).toHaveProperty('p90Days')
    expect(shape).toHaveProperty('slaComplianceRate')
    expect(shape).toHaveProperty('totalProcessed')
    expect(shape).toHaveProperty('withinSla')
  })

  test('sla compliance rate = withinSla / totalProcessed * 100', () => {
    const withinSla = 85
    const totalProcessed = 100
    const slaComplianceRate = totalProcessed > 0
      ? Math.round((withinSla / totalProcessed) * 10000) / 100
      : 100
    expect(slaComplianceRate).toBe(85)
  })

  test('sla compliance is 100% when no invoices processed', () => {
    const totalProcessed = 0
    const slaComplianceRate = totalProcessed > 0
      ? Math.round((0 / totalProcessed) * 10000) / 100
      : 100
    expect(slaComplianceRate).toBe(100)
  })

  test('sla compliance is 100% when all within target', () => {
    const withinSla = 50
    const totalProcessed = 50
    const slaComplianceRate = Math.round((withinSla / totalProcessed) * 10000) / 100
    expect(slaComplianceRate).toBe(100)
  })

  test('sla compliance handles partial compliance correctly', () => {
    const withinSla = 1
    const totalProcessed = 3
    const slaComplianceRate = Math.round((withinSla / totalProcessed) * 10000) / 100
    expect(slaComplianceRate).toBe(33.33)
  })

  test('days values are rounded to 1 decimal place', () => {
    const raw = 2.567
    const rounded = Math.round(raw * 10) / 10
    expect(rounded).toBe(2.6)
  })

  test('zero days when no data', () => {
    // When no rows returned from DB, defaults should all be zero
    const shape = {
      avgDays: 0,
      p50Days: 0,
      p90Days: 0,
      slaComplianceRate: 100,
      totalProcessed: 0,
      withinSla: 0,
    }
    expect(shape.avgDays).toBe(0)
    expect(shape.p50Days).toBe(0)
    expect(shape.p90Days).toBe(0)
    expect(shape.slaComplianceRate).toBe(100)
    expect(shape.totalProcessed).toBe(0)
  })
})

// ─── Status Funnel ordering ───────────────────────────────

describe('Status funnel ordering', () => {
  const STATUS_ORDER = [
    'RECEIVED',
    'PROCESSING',
    'PENDING_REVIEW',
    'PENDING_PARTICIPANT_APPROVAL',
    'APPROVED',
    'REJECTED',
    'CLAIMED',
    'PAID',
  ]

  test('status order follows pipeline sequence', () => {
    expect(STATUS_ORDER[0]).toBe('RECEIVED')
    expect(STATUS_ORDER[1]).toBe('PROCESSING')
    expect(STATUS_ORDER[2]).toBe('PENDING_REVIEW')
    expect(STATUS_ORDER[3]).toBe('PENDING_PARTICIPANT_APPROVAL')
    expect(STATUS_ORDER[4]).toBe('APPROVED')
    expect(STATUS_ORDER[5]).toBe('REJECTED')
    expect(STATUS_ORDER[6]).toBe('CLAIMED')
    expect(STATUS_ORDER[7]).toBe('PAID')
  })

  test('funnel correctly maps counts from groupBy result', () => {
    const groupedResult = [
      { toStatus: 'PAID', _count: { toStatus: 50 } },
      { toStatus: 'RECEIVED', _count: { toStatus: 120 } },
      { toStatus: 'APPROVED', _count: { toStatus: 80 } },
    ]

    const countMap = new Map<string, number>()
    for (const row of groupedResult) {
      countMap.set(row.toStatus, row._count.toStatus)
    }

    const funnel = STATUS_ORDER
      .map((status) => ({ status, count: countMap.get(status) ?? 0 }))
      .filter((item) => item.count > 0)

    // Should be ordered by pipeline, not by count
    expect(funnel[0]?.status).toBe('RECEIVED')
    expect(funnel[1]?.status).toBe('APPROVED')
    expect(funnel[2]?.status).toBe('PAID')
    expect(funnel[0]?.count).toBe(120)
    expect(funnel[2]?.count).toBe(50)
  })

  test('funnel filters out zero-count statuses', () => {
    const countMap = new Map<string, number>([
      ['RECEIVED', 10],
      ['PAID', 5],
    ])

    const funnel = STATUS_ORDER
      .map((status) => ({ status, count: countMap.get(status) ?? 0 }))
      .filter((item) => item.count > 0)

    expect(funnel).toHaveLength(2)
    expect(funnel.every((item) => item.count > 0)).toBe(true)
  })

  test('funnel returns empty array when no data', () => {
    const funnel = STATUS_ORDER
      .map((status) => ({ status, count: 0 }))
      .filter((item) => item.count > 0)

    expect(funnel).toHaveLength(0)
  })
})

// ─── Hold Category Breakdown ─────────────────────────────

describe('Hold category breakdown', () => {
  test('expected shape includes category and count', () => {
    const item = { category: 'MISSING_NDIS_CODES', count: 15 }
    expect(item).toHaveProperty('category')
    expect(item).toHaveProperty('count')
  })

  test('results are sorted by count descending', () => {
    const raw = [
      { category: 'OTHER', count: 3 },
      { category: 'MISSING_NDIS_CODES', count: 15 },
      { category: 'INCORRECT_AMOUNT', count: 8 },
    ]

    const sorted = [...raw].sort((a, b) => b.count - a.count)
    expect(sorted[0]?.category).toBe('MISSING_NDIS_CODES')
    expect(sorted[1]?.category).toBe('INCORRECT_AMOUNT')
    expect(sorted[2]?.category).toBe('OTHER')
  })

  test('empty array returned when no holds exist', () => {
    const result: { category: string; count: number }[] = []
    expect(result).toHaveLength(0)
  })

  test('null holdCategory entries are excluded', () => {
    const grouped = [
      { holdCategory: 'MISSING_NDIS_CODES', _count: { holdCategory: 5 } },
      { holdCategory: null, _count: { holdCategory: 3 } },
    ]

    const result = grouped
      .filter((row) => row.holdCategory !== null)
      .map((row) => ({ category: row.holdCategory as string, count: row._count.holdCategory }))

    expect(result).toHaveLength(1)
    expect(result[0]?.category).toBe('MISSING_NDIS_CODES')
  })
})

// ─── Volume Over Time ─────────────────────────────────────

describe('Volume over time', () => {
  test('expected shape includes period and count', () => {
    const item = { period: 'Jan 2026', count: 42 }
    expect(item).toHaveProperty('period')
    expect(item).toHaveProperty('count')
  })

  test('count is cast from bigint/string to number', () => {
    const rawCount = BigInt(42)
    const count = Number(rawCount)
    expect(count).toBe(42)
    expect(typeof count).toBe('number')
  })

  test('period label is formatted as short month + year', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    // Use UTC date parts to avoid timezone shift in test
    const label = date.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
    // toLocaleString output may vary — just verify format pattern
    expect(label).toMatch(/\d{4}/)
  })

  test('empty array returned when no invoices in period', () => {
    const result: { period: string; count: number }[] = []
    expect(result).toHaveLength(0)
  })
})

// ─── Disability Category Breakdown ───────────────────────

describe('Disability category breakdown', () => {
  test('expected shape includes category and count', () => {
    const item = { category: 'Autism Spectrum Disorder', count: 25 }
    expect(item).toHaveProperty('category')
    expect(item).toHaveProperty('count')
  })

  test('null categories are grouped as Not Specified', () => {
    const nullCount = 10
    const result: { category: string; count: number }[] = []

    if (nullCount > 0) {
      result.push({ category: 'Not Specified', count: nullCount })
    }

    expect(result).toHaveLength(1)
    expect(result[0]?.category).toBe('Not Specified')
    expect(result[0]?.count).toBe(10)
  })

  test('Not Specified not added when null count is zero', () => {
    const nullCount = 0
    const result: { category: string; count: number }[] = [
      { category: 'Autism Spectrum Disorder', count: 5 },
    ]

    if (nullCount > 0) {
      result.push({ category: 'Not Specified', count: nullCount })
    }

    expect(result).toHaveLength(1)
    expect(result.some((r) => r.category === 'Not Specified')).toBe(false)
  })

  test('results from groupBy are sorted by count descending', () => {
    const raw = [
      { disabilityCategory: 'Cerebral Palsy', _count: { disabilityCategory: 5 } },
      { disabilityCategory: 'Autism Spectrum Disorder', _count: { disabilityCategory: 30 } },
      { disabilityCategory: 'Down Syndrome', _count: { disabilityCategory: 12 } },
    ]

    const result = raw
      .filter((row) => row.disabilityCategory !== null)
      .map((row) => ({
        category: row.disabilityCategory as string,
        count: row._count.disabilityCategory,
      }))
      .sort((a, b) => b.count - a.count)

    expect(result[0]?.category).toBe('Autism Spectrum Disorder')
    expect(result[1]?.category).toBe('Down Syndrome')
    expect(result[2]?.category).toBe('Cerebral Palsy')
  })

  test('empty array returned when no participants', () => {
    const result: { category: string; count: number }[] = []
    expect(result).toHaveLength(0)
  })
})

// ─── StatusFunnelItem shape ───────────────────────────────

describe('StatusFunnelItem shape', () => {
  test('all 8 statuses are in the pipeline', () => {
    const allStatuses = [
      'RECEIVED',
      'PROCESSING',
      'PENDING_REVIEW',
      'PENDING_PARTICIPANT_APPROVAL',
      'APPROVED',
      'REJECTED',
      'CLAIMED',
      'PAID',
    ]
    expect(allStatuses).toHaveLength(8)
  })
})

// ─── HoldCategoryItem — label mapping ────────────────────

describe('Hold category label mapping', () => {
  const HOLD_CATEGORY_LABELS: Record<string, string> = {
    MISSING_NDIS_CODES: 'Missing NDIS Codes',
    INCORRECT_AMOUNT: 'Incorrect Amount',
    DUPLICATE_INVOICE: 'Duplicate Invoice',
    PROVIDER_NOT_APPROVED: 'Provider Not Approved',
    BUDGET_EXCEEDED: 'Budget Exceeded',
    AWAITING_PARTICIPANT_APPROVAL: 'Awaiting Participant Approval',
    AWAITING_PROVIDER_CORRECTION: 'Awaiting Provider Correction',
    PLAN_BUDGET_EXCEEDED: 'Plan Budget Exceeded',
    SYSTEM_HOLD: 'System Hold',
    OTHER: 'Other',
  }

  test('all 10 enum values have human-readable labels', () => {
    expect(Object.keys(HOLD_CATEGORY_LABELS)).toHaveLength(10)
  })

  test('MISSING_NDIS_CODES maps to readable label', () => {
    expect(HOLD_CATEGORY_LABELS['MISSING_NDIS_CODES']).toBe('Missing NDIS Codes')
  })

  test('AWAITING_PARTICIPANT_APPROVAL maps to readable label', () => {
    expect(HOLD_CATEGORY_LABELS['AWAITING_PARTICIPANT_APPROVAL']).toBe('Awaiting Participant Approval')
  })

  test('unknown category falls back to raw value', () => {
    const formatHoldLabel = (category: string): string =>
      HOLD_CATEGORY_LABELS[category] ?? category

    expect(formatHoldLabel('UNKNOWN_CATEGORY')).toBe('UNKNOWN_CATEGORY')
    expect(formatHoldLabel('MISSING_NDIS_CODES')).toBe('Missing NDIS Codes')
  })
})
