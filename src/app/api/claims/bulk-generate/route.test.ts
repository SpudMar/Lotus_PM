/**
 * Tests for POST /api/claims/bulk-generate
 *
 * Covers:
 *   - RBAC: 401 for unauthenticated, 403 for unauthorized role
 *   - Validation: invalid dates, startDate >= endDate
 *   - Claims generated for eligible invoices
 *   - Skips invoices that already have claims
 *   - Optional participant filter
 *   - Auto-batch grouping when autoBatch=true
 *   - Returns zero when no eligible invoices
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: { findMany: jest.fn(), count: jest.fn() },
    coreAuditLog: { create: jest.fn() },
  },
}))

jest.mock('@/lib/modules/claims/claim-generation', () => ({
  generateClaimBatch: jest.fn(),
}))

jest.mock('@/lib/modules/claims/claims', () => ({
  createBatch: jest.fn(),
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { generateClaimBatch } from '@/lib/modules/claims/claim-generation'
import { createBatch } from '@/lib/modules/claims/claims'
import { POST } from './route'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockInvoiceFindMany = prisma.invInvoice.findMany as jest.MockedFunction<typeof prisma.invInvoice.findMany>
const mockInvoiceCount = prisma.invInvoice.count as jest.MockedFunction<typeof prisma.invInvoice.count>
const mockGenerateClaimBatch = generateClaimBatch as jest.MockedFunction<typeof generateClaimBatch>
const mockCreateBatch = createBatch as jest.MockedFunction<typeof createBatch>

// ── Helpers ───────────────────────────────────────────────────────────────────

function pmSession() {
  return { user: { id: 'user-pm', name: 'PM User', role: 'PLAN_MANAGER', email: 'pm@test.com' } }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/claims/bulk-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/claims/bulk-generate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(pmSession() as never)
    mockInvoiceCount.mockResolvedValue(0)
  })

  // ── RBAC ─────────────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    }))

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when user lacks claims:write permission', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    }))

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  // ── Validation ──────────────────────────────────────────────────────────

  it('returns 400 for invalid date format', async () => {
    const res = await POST(makeRequest({
      startDate: 'not-a-date',
      endDate: '2026-01-31T23:59:59.999Z',
    }))

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when startDate >= endDate', async () => {
    const res = await POST(makeRequest({
      startDate: '2026-02-01T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.000Z',
    }))

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('BAD_REQUEST')
  })

  // ── No eligible invoices ───────────────────────────────────────────────

  it('returns zero when no eligible invoices exist', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    mockInvoiceCount.mockResolvedValue(0)

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { claimsGenerated: number; skipped: number } }
    expect(body.data.claimsGenerated).toBe(0)
    expect(mockGenerateClaimBatch).not.toHaveBeenCalled()
  })

  // ── Successful generation ──────────────────────────────────────────────

  it('generates claims for eligible invoices', async () => {
    mockInvoiceFindMany.mockResolvedValue([
      { id: 'inv-001' },
      { id: 'inv-002' },
    ] as never)
    mockGenerateClaimBatch.mockResolvedValue({
      claims: [
        { claimId: 'claim-001', claimReference: 'CLM-20260201-0001', participantName: 'A', totalCents: 5000, lineCount: 1 },
        { claimId: 'claim-002', claimReference: 'CLM-20260201-0002', participantName: 'B', totalCents: 7000, lineCount: 2 },
      ],
      invoicesProcessed: 2,
    })
    mockInvoiceCount.mockResolvedValue(2)

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { claimsGenerated: number; skipped: number } }
    expect(body.data.claimsGenerated).toBe(2)
    expect(mockGenerateClaimBatch).toHaveBeenCalledWith(['inv-001', 'inv-002'], 'user-pm')
  })

  it('calculates skipped count from total approved minus generated', async () => {
    mockInvoiceFindMany.mockResolvedValue([{ id: 'inv-001' }] as never)
    mockGenerateClaimBatch.mockResolvedValue({
      claims: [
        { claimId: 'claim-001', claimReference: 'CLM-20260201-0001', participantName: 'A', totalCents: 5000, lineCount: 1 },
      ],
      invoicesProcessed: 1,
    })
    // 3 total approved/claimed invoices, but only 1 claim generated
    mockInvoiceCount.mockResolvedValue(3)

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    }))

    const body = await res.json() as { data: { skipped: number } }
    expect(body.data.skipped).toBe(2)
  })

  // ── Auto-batch ─────────────────────────────────────────────────────────

  it('creates a batch when autoBatch=true', async () => {
    mockInvoiceFindMany.mockResolvedValue([{ id: 'inv-001' }] as never)
    mockGenerateClaimBatch.mockResolvedValue({
      claims: [
        { claimId: 'claim-001', claimReference: 'CLM-20260201-0001', participantName: 'A', totalCents: 5000, lineCount: 1 },
      ],
      invoicesProcessed: 1,
    })
    mockCreateBatch.mockResolvedValue({
      id: 'batch-001',
      batchNumber: 'BATCH-2026-0001',
      claims: [],
    } as never)
    mockInvoiceCount.mockResolvedValue(1)

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      autoBatch: true,
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { batchId: string; claimsGenerated: number } }
    expect(body.data.batchId).toBe('batch-001')
    expect(body.data.claimsGenerated).toBe(1)
    expect(mockCreateBatch).toHaveBeenCalledWith(
      ['claim-001'],
      expect.stringContaining('Monthly claim batch'),
      'user-pm',
    )
  })

  it('does not create a batch when autoBatch=false', async () => {
    mockInvoiceFindMany.mockResolvedValue([{ id: 'inv-001' }] as never)
    mockGenerateClaimBatch.mockResolvedValue({
      claims: [
        { claimId: 'claim-001', claimReference: 'CLM-20260201-0001', participantName: 'A', totalCents: 5000, lineCount: 1 },
      ],
      invoicesProcessed: 1,
    })
    mockInvoiceCount.mockResolvedValue(1)

    const res = await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      autoBatch: false,
    }))

    const body = await res.json() as { data: { batchId?: string } }
    expect(body.data.batchId).toBeUndefined()
    expect(mockCreateBatch).not.toHaveBeenCalled()
  })

  // ── Participant filter ─────────────────────────────────────────────────

  it('passes participantIds filter to the invoice query', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    mockInvoiceCount.mockResolvedValue(0)

    await POST(makeRequest({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      participantIds: ['part-001', 'part-002'],
    }))

    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: { in: ['part-001', 'part-002'] },
        }),
      })
    )
  })
})
