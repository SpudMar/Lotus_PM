import { evaluateCondition, evaluateConditions, interpolateTemplate } from './engine'
import type { AutoCondition, TriggerContext } from './types'

// ─── evaluateCondition ────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  const ctx: TriggerContext = {
    usedPercent: 85,
    amountCents: 10000,
    status: 'APPROVED',
    daysUntilReview: 7,
    isActive: true,
  }

  test('eq — matches equal value', () => {
    const c: AutoCondition = { field: 'status', op: 'eq', value: 'APPROVED' }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('eq — does not match different value', () => {
    const c: AutoCondition = { field: 'status', op: 'eq', value: 'REJECTED' }
    expect(evaluateCondition(c, ctx)).toBe(false)
  })

  test('ne — matches when values differ', () => {
    const c: AutoCondition = { field: 'status', op: 'ne', value: 'REJECTED' }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('gt — matches when context value is greater', () => {
    const c: AutoCondition = { field: 'usedPercent', op: 'gt', value: 80 }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('gt — does not match when equal', () => {
    const c: AutoCondition = { field: 'usedPercent', op: 'gt', value: 85 }
    expect(evaluateCondition(c, ctx)).toBe(false)
  })

  test('gte — matches when equal', () => {
    const c: AutoCondition = { field: 'usedPercent', op: 'gte', value: 85 }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('lt — matches when context value is less', () => {
    const c: AutoCondition = { field: 'daysUntilReview', op: 'lt', value: 14 }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('lte — matches when equal', () => {
    const c: AutoCondition = { field: 'daysUntilReview', op: 'lte', value: 7 }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('contains — matches substring (case-insensitive)', () => {
    const c: AutoCondition = { field: 'status', op: 'contains', value: 'approv' }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })

  test('contains — returns false for non-string context value', () => {
    const c: AutoCondition = { field: 'usedPercent', op: 'contains', value: '85' }
    expect(evaluateCondition(c, ctx)).toBe(false)
  })

  test('returns false when field is missing from context', () => {
    const c: AutoCondition = { field: 'nonExistentField', op: 'eq', value: 'anything' }
    expect(evaluateCondition(c, ctx)).toBe(false)
  })

  test('returns false when field is null', () => {
    const c: AutoCondition = { field: 'nullField', op: 'eq', value: 'anything' }
    expect(evaluateCondition(c, { nullField: null })).toBe(false)
  })

  test('eq — boolean match', () => {
    const c: AutoCondition = { field: 'isActive', op: 'eq', value: true }
    expect(evaluateCondition(c, ctx)).toBe(true)
  })
})

// ─── evaluateConditions ───────────────────────────────────────────────────────

describe('evaluateConditions', () => {
  const ctx: TriggerContext = { usedPercent: 90, categoryCode: '01' }

  test('returns true when all conditions pass', () => {
    const conditions: AutoCondition[] = [
      { field: 'usedPercent', op: 'gte', value: 80 },
      { field: 'categoryCode', op: 'eq', value: '01' },
    ]
    expect(evaluateConditions(conditions, ctx)).toBe(true)
  })

  test('returns false when any condition fails', () => {
    const conditions: AutoCondition[] = [
      { field: 'usedPercent', op: 'gte', value: 80 },
      { field: 'categoryCode', op: 'eq', value: '02' }, // fails
    ]
    expect(evaluateConditions(conditions, ctx)).toBe(false)
  })

  test('returns true for empty conditions array', () => {
    expect(evaluateConditions([], ctx)).toBe(true)
  })
})

// ─── interpolateTemplate ──────────────────────────────────────────────────────

describe('interpolateTemplate', () => {
  const ctx: TriggerContext = {
    participantId: 'abc123',
    categoryCode: '01',
    usedPercent: 85,
    remainingCents: 50000,
  }

  test('replaces known placeholders', () => {
    const result = interpolateTemplate(
      'Budget for category {categoryCode} is at {usedPercent}%',
      ctx
    )
    expect(result).toBe('Budget for category 01 is at 85%')
  })

  test('leaves unknown placeholders unchanged', () => {
    const result = interpolateTemplate('Hello {unknown}', ctx)
    expect(result).toBe('Hello {unknown}')
  })

  test('handles numeric values', () => {
    const result = interpolateTemplate('{remainingCents} cents remaining', ctx)
    expect(result).toBe('50000 cents remaining')
  })

  test('handles template with no placeholders', () => {
    const result = interpolateTemplate('No placeholders here', ctx)
    expect(result).toBe('No placeholders here')
  })
})
