/**
 * Unit tests for POST /api/automation/cron
 *
 * Tests: auth (missing/wrong CRON_SECRET), no scheduled rules (triggered: 0),
 * and one matching rule (triggered: 1).
 * Mocks: findScheduledRules, triggerRule, createAuditLog, croner.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/modules/automation/rules', () => ({
  findScheduledRules: jest.fn(),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  triggerRule: jest.fn(),
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn(),
}))

// Mock croner so we can control isDue behaviour without real time evaluation
jest.mock('croner', () => ({
  Cron: jest.fn(),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { POST } from './route'
import { findScheduledRules } from '@/lib/modules/automation/rules'
import { triggerRule } from '@/lib/modules/automation/engine'
import { Cron } from 'croner'
import type { RuleExecutionResult } from '@/lib/modules/automation/types'

const mockFindScheduledRules = findScheduledRules as jest.MockedFunction<typeof findScheduledRules>
const mockTriggerRule = triggerRule as jest.MockedFunction<typeof triggerRule>
const MockCron = Cron as jest.MockedClass<typeof Cron>

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SECRET = 'test-cron-secret-abc123'

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (secret !== undefined) {
    headers['Authorization'] = `Bearer ${secret}`
  }
  return new NextRequest('http://localhost/api/automation/cron', {
    method: 'POST',
    headers,
  })
}

/** A minimal AutoRule shape with only the fields we use in the cron handler. */
const makeRule = (id: string, cronExpression: string) => ({
  id,
  name: `Rule ${id}`,
  description: null,
  isActive: true,
  triggerType: 'SCHEDULE' as const,
  triggerEvent: null,
  cronExpression,
  conditions: [],
  actions: [],
  lastTriggeredAt: null,
  executionCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
})

const SUCCESS_RESULT: RuleExecutionResult = {
  ruleId: 'rule-001',
  result: 'SUCCESS',
  actionsRun: 1,
  durationMs: 12,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/automation/cron', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.CRON_SECRET = VALID_SECRET
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest(undefined)
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when Bearer token is wrong', async () => {
    const req = makeRequest('wrong-secret')
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET
    const req = makeRequest(VALID_SECRET)
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  // ── No scheduled rules ─────────────────────────────────────────────────────

  test('returns 200 with triggered: 0 when there are no scheduled rules', async () => {
    mockFindScheduledRules.mockResolvedValueOnce([])

    const req = makeRequest(VALID_SECRET)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { triggered: number; skipped: number; results: RuleExecutionResult[] }
    expect(data.triggered).toBe(0)
    expect(data.skipped).toBe(0)
    expect(data.results).toHaveLength(0)
    expect(mockTriggerRule).not.toHaveBeenCalled()
  })

  // ── One matching rule ──────────────────────────────────────────────────────

  test('returns 200 with triggered: 1 when one rule is due', async () => {
    const rule = makeRule('rule-001', '*/5 * * * *')
    mockFindScheduledRules.mockResolvedValueOnce([rule])

    // Mock Cron so previousRun() returns a time within the last 5 minutes
    const recentTime = new Date(Date.now() - 60 * 1000) // 1 minute ago
    MockCron.mockImplementation(() => ({
      previousRun: () => recentTime,
    } as unknown as InstanceType<typeof Cron>))

    mockTriggerRule.mockResolvedValueOnce(SUCCESS_RESULT)

    const req = makeRequest(VALID_SECRET)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { triggered: number; skipped: number; results: RuleExecutionResult[] }
    expect(data.triggered).toBe(1)
    expect(data.skipped).toBe(0)
    expect(data.results).toHaveLength(1)
    expect(data.results[0]?.ruleId).toBe('rule-001')
    expect(mockTriggerRule).toHaveBeenCalledTimes(1)
    expect(mockTriggerRule).toHaveBeenCalledWith('rule-001', expect.objectContaining({ triggerType: 'SCHEDULE' }), 'schedule')
  })

  // ── Rule not yet due ───────────────────────────────────────────────────────

  test('skips rules whose cron expression was not due in the last 5 minutes', async () => {
    const rule = makeRule('rule-002', '0 2 * * *') // daily at 2am
    mockFindScheduledRules.mockResolvedValueOnce([rule])

    // previousRun() returns a time older than 5 minutes ago
    const oldTime = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
    MockCron.mockImplementation(() => ({
      previousRun: () => oldTime,
    } as unknown as InstanceType<typeof Cron>))

    const req = makeRequest(VALID_SECRET)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { triggered: number; skipped: number; results: RuleExecutionResult[] }
    expect(data.triggered).toBe(0)
    expect(data.skipped).toBe(1)
    expect(mockTriggerRule).not.toHaveBeenCalled()
  })

  // ── Rule with no cronExpression ────────────────────────────────────────────

  test('skips rules that have no cronExpression set', async () => {
    const rule = { ...makeRule('rule-003', ''), cronExpression: null }
    // Cast to satisfy the type — in practice findScheduledRules filters for SCHEDULE rules
    // but a SCHEDULE rule with a null cronExpression should be safely skipped.
    mockFindScheduledRules.mockResolvedValueOnce([rule as unknown as ReturnType<typeof makeRule>])

    const req = makeRequest(VALID_SECRET)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const data = await res.json() as { triggered: number; skipped: number }
    expect(data.triggered).toBe(0)
    expect(data.skipped).toBe(1)
    expect(mockTriggerRule).not.toHaveBeenCalled()
  })
})
