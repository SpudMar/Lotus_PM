/**
 * Integration tests for POST /api/invoices/bulk
 *
 * Covers:
 *   - Bulk approve: succeeds for valid PENDING_REVIEW invoices
 *   - Bulk reject: requires reason; rejects successfully
 *   - Bulk claim: generates claims for APPROVED invoices
 *   - RBAC: ASSISTANT cannot approve (403)
 *   - Partial success: some succeed, some fail
 *   - Empty invoiceIds returns 400
 *   - Missing reason for reject returns 400
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/invoices/invoices', () => ({
  approveInvoice: jest.fn(),
  rejectInvoice: jest.fn(),
}))

jest.mock('@/lib/modules/claims/claim-generation', () => ({
  generateClaimBatch: jest.fn(),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { approveInvoice, rejectInvoice } from '@/lib/modules/invoices/invoices'
import { generateClaimBatch } from '@/lib/modules/claims/claim-generation'
import { POST } from './route'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockApprove = approveInvoice as jest.MockedFunction<typeof approveInvoice>
const mockReject = rejectInvoice as jest.MockedFunction<typeof rejectInvoice>
const mockGenerate = generateClaimBatch as jest.MockedFunction<typeof generateClaimBatch>

// ── Helpers ───────────────────────────────────────────────────────────────────

function pmSession() {
  return { user: { id: 'user-pm', name: 'PM User', role: 'PLAN_MANAGER', email: 'pm@test.com' } }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/invoices/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/bulk', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(pmSession() as never)
  })

  // ── RBAC ─────────────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(makeRequest({ action: 'approve', invoiceIds: ['inv-001'] }))

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when ASSISTANT tries to bulk approve', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const res = await POST(makeRequest({ action: 'approve', invoiceIds: ['inv-001'] }))

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('returns 400 for empty invoiceIds array', async () => {
    const res = await POST(makeRequest({ action: 'approve', invoiceIds: [] }))

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid action value', async () => {
    const res = await POST(makeRequest({ action: 'delete', invoiceIds: ['inv-001'] }))

    expect(res.status).toBe(400)
  })

  it('returns 400 for reject action without reason', async () => {
    const res = await POST(makeRequest({ action: 'reject', invoiceIds: ['inv-001'] }))

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  // ── Bulk approve ──────────────────────────────────────────────────────────

  it('approves all invoices and returns succeeded list', async () => {
    mockApprove.mockResolvedValue({} as never)

    const res = await POST(makeRequest({ action: 'approve', invoiceIds: ['inv-001', 'inv-002'] }))

    expect(res.status).toBe(200)
    const body = await res.json() as { succeeded: string[]; failed: unknown[] }
    expect(body.succeeded).toEqual(['inv-001', 'inv-002'])
    expect(body.failed).toHaveLength(0)
    expect(mockApprove).toHaveBeenCalledTimes(2)
    expect(mockApprove).toHaveBeenCalledWith('inv-001', 'user-pm')
    expect(mockApprove).toHaveBeenCalledWith('inv-002', 'user-pm')
  })

  it('returns partial success when some approvals fail', async () => {
    mockApprove
      .mockResolvedValueOnce({} as never)            // inv-001 succeeds
      .mockRejectedValueOnce(new Error('INVALID_STATUS')) // inv-002 fails

    const res = await POST(makeRequest({ action: 'approve', invoiceIds: ['inv-001', 'inv-002'] }))

    expect(res.status).toBe(200)
    const body = await res.json() as { succeeded: string[]; failed: { id: string; error: string }[] }
    expect(body.succeeded).toEqual(['inv-001'])
    expect(body.failed).toHaveLength(1)
    expect(body.failed[0]!.id).toBe('inv-002')
    expect(body.failed[0]!.error).toBe('INVALID_STATUS')
  })

  // ── Bulk reject ───────────────────────────────────────────────────────────

  it('rejects all invoices with the provided reason', async () => {
    mockReject.mockResolvedValue({} as never)

    const res = await POST(makeRequest({
      action: 'reject',
      invoiceIds: ['inv-001', 'inv-002'],
      reason: 'Duplicate submission',
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { succeeded: string[]; failed: unknown[] }
    expect(body.succeeded).toEqual(['inv-001', 'inv-002'])
    expect(mockReject).toHaveBeenCalledWith('inv-001', 'user-pm', 'Duplicate submission')
    expect(mockReject).toHaveBeenCalledWith('inv-002', 'user-pm', 'Duplicate submission')
  })

  it('returns partial success when some rejections fail', async () => {
    mockReject
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('NOT_FOUND'))

    const res = await POST(makeRequest({
      action: 'reject',
      invoiceIds: ['inv-001', 'inv-002'],
      reason: 'Invalid invoice',
    }))

    const body = await res.json() as { succeeded: string[]; failed: { id: string }[] }
    expect(body.succeeded).toEqual(['inv-001'])
    expect(body.failed[0]!.id).toBe('inv-002')
  })

  // ── Bulk claim generation ─────────────────────────────────────────────────

  it('generates claims for all provided invoice IDs', async () => {
    mockGenerate.mockResolvedValue({
      claims: [{ claimId: 'claim-001', claimReference: 'CLM-20260222-0001', participantName: 'Michael Thompson', totalCents: 10000, lineCount: 1 }],
      invoicesProcessed: 1,
    })

    const res = await POST(makeRequest({ action: 'claim', invoiceIds: ['inv-001'] }))

    expect(res.status).toBe(200)
    const body = await res.json() as { succeeded: string[]; failed: unknown[] }
    expect(body.succeeded).toEqual(['inv-001'])
    expect(mockGenerate).toHaveBeenCalledWith(['inv-001'], 'user-pm')
  })

  it('returns partial success when claim generation fails for some invoices', async () => {
    mockGenerate
      .mockResolvedValueOnce({ claims: [{ claimId: 'c-1', claimReference: 'CLM-20260222-0001', participantName: 'Alice', totalCents: 5000, lineCount: 1 }], invoicesProcessed: 1 })
      .mockRejectedValueOnce(new Error('Invoice is not in APPROVED status (current: PENDING_REVIEW)'))

    const res = await POST(makeRequest({ action: 'claim', invoiceIds: ['inv-001', 'inv-002'] }))

    const body = await res.json() as { succeeded: string[]; failed: { id: string; error: string }[] }
    expect(body.succeeded).toEqual(['inv-001'])
    expect(body.failed[0]!.id).toBe('inv-002')
    expect(body.failed[0]!.error).toContain('APPROVED')
  })

  // ── Response format ───────────────────────────────────────────────────────

  it('always returns succeeded and failed arrays even when all succeed', async () => {
    mockApprove.mockResolvedValue({} as never)

    const res = await POST(makeRequest({ action: 'approve', invoiceIds: ['inv-001'] }))
    const body = await res.json() as { succeeded: unknown; failed: unknown }

    expect(Array.isArray(body.succeeded)).toBe(true)
    expect(Array.isArray(body.failed)).toBe(true)
  })

  it('always returns succeeded and failed arrays even when all fail', async () => {
    mockApprove.mockRejectedValue(new Error('NOT_FOUND'))

    const res = await POST(makeRequest({ action: 'approve', invoiceIds: ['inv-001'] }))
    const body = await res.json() as { succeeded: unknown; failed: unknown }

    expect(Array.isArray(body.succeeded)).toBe(true)
    expect(Array.isArray(body.failed)).toBe(true)
  })
})
