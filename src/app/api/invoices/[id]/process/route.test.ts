/**
 * Tests for POST /api/invoices/[id]/process
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/invoices/invoices', () => ({
  getInvoice: jest.fn(),
}))

jest.mock('@/lib/modules/invoices/processing-engine', () => ({
  processInvoice: jest.fn(),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { POST } from './route'
import { requirePermission } from '@/lib/auth/session'
import { getInvoice } from '@/lib/modules/invoices/invoices'
import { processInvoice } from '@/lib/modules/invoices/processing-engine'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockGetInvoice = getInvoice as jest.MockedFunction<typeof getInvoice>
const mockProcessInvoice = processInvoice as jest.MockedFunction<typeof processInvoice>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'user-001', role: 'PLAN_MANAGER', email: 'pm@lotusassist.com.au', name: 'James Walker' },
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2026-001',
    status: 'RECEIVED',
    processingCategory: null,
    ...overrides,
  }
}

function makeRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/invoices/${id}/process`, {
    method: 'POST',
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/[id]/process', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(mockSession as never)
  })

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(makeRequest('inv-001'), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when user lacks invoices:write', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const res = await POST(makeRequest('inv-001'), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  // ── Not Found ───────────────────────────────────────────────────────────────

  it('returns 404 when invoice does not exist', async () => {
    mockGetInvoice.mockResolvedValue(null)

    const res = await POST(makeRequest('inv-notexist'), {
      params: Promise.resolve({ id: 'inv-notexist' }),
    })

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('NOT_FOUND')
    expect(mockProcessInvoice).not.toHaveBeenCalled()
  })

  // ── Success cases ───────────────────────────────────────────────────────────

  it('returns 200 with category on success (AUTO_APPROVED)', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoice() as never)
    mockProcessInvoice.mockResolvedValue({
      invoiceId: 'inv-001',
      category: 'AUTO_APPROVED',
      aiResult: null,
      validationErrors: [],
    })

    const res = await POST(makeRequest('inv-001'), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { invoiceId: string; category: string } }
    expect(body.data.invoiceId).toBe('inv-001')
    expect(body.data.category).toBe('AUTO_APPROVED')
  })

  it('returns 200 with NEEDS_REVIEW when AI fails', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoice() as never)
    mockProcessInvoice.mockResolvedValue({
      invoiceId: 'inv-001',
      category: 'NEEDS_REVIEW',
      aiResult: null,
      validationErrors: ['Internal processing error -- manual review required'],
    })

    const res = await POST(makeRequest('inv-001'), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { category: string } }
    expect(body.data.category).toBe('NEEDS_REVIEW')
  })

  it('calls processInvoice with the correct invoice id', async () => {
    mockGetInvoice.mockResolvedValue(makeInvoice({ id: 'inv-abc' }) as never)
    mockProcessInvoice.mockResolvedValue({
      invoiceId: 'inv-abc',
      category: 'NEEDS_CODES',
      aiResult: null,
      validationErrors: [],
    })

    await POST(makeRequest('inv-abc'), {
      params: Promise.resolve({ id: 'inv-abc' }),
    })

    expect(mockProcessInvoice).toHaveBeenCalledWith('inv-abc')
  })

  it('returns all processing categories correctly', async () => {
    const categories = ['AUTO_APPROVED', 'PARTICIPANT_APPROVAL', 'NEEDS_CODES', 'NEEDS_REVIEW', 'AUTO_REJECTED'] as const

    for (const category of categories) {
      mockGetInvoice.mockResolvedValue(makeInvoice() as never)
      mockProcessInvoice.mockResolvedValue({
        invoiceId: 'inv-001',
        category,
        aiResult: null,
        validationErrors: [],
      })

      const res = await POST(makeRequest('inv-001'), {
        params: Promise.resolve({ id: 'inv-001' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { data: { category: string } }
      expect(body.data.category).toBe(category)
    }
  })

  // ── Internal error ──────────────────────────────────────────────────────────

  it('returns 500 on unexpected error', async () => {
    mockGetInvoice.mockRejectedValue(new Error('Database connection failed'))

    const res = await POST(makeRequest('inv-001'), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(500)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('INTERNAL_ERROR')
  })
})
