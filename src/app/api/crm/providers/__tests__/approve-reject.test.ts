/**
 * Tests for approve and reject provider API routes.
 * POST /api/crm/providers/[id]/approve
 * POST /api/crm/providers/[id]/reject
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/crm/provider-onboarding', () => ({
  approveProvider: jest.fn(),
  rejectProvider: jest.fn(),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { approveProvider, rejectProvider } from '@/lib/modules/crm/provider-onboarding'
import { POST as approvePost } from '@/app/api/crm/providers/[id]/approve/route'
import { POST as rejectPost } from '@/app/api/crm/providers/[id]/reject/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeApproveRequest(): NextRequest {
  return new NextRequest('http://localhost/api/crm/providers/prov-1/approve', {
    method: 'POST',
  })
}

function makeRejectRequest(body: { reason?: string } = {}): NextRequest {
  return new NextRequest('http://localhost/api/crm/providers/prov-1/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mockSession = { user: { id: 'user-1', name: 'PM User', role: 'PLAN_MANAGER' } }

// ── Approve tests ─────────────────────────────────────────────────────────────

describe('POST /api/crm/providers/[id]/approve', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requirePermission as jest.Mock).mockResolvedValue(mockSession)
    ;(approveProvider as jest.Mock).mockResolvedValue(undefined)
  })

  test('returns 200 with ACTIVE status on success', async () => {
    const res = await approvePost(makeApproveRequest(), makeParams('prov-1'))
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('ACTIVE')
    expect(approveProvider).toHaveBeenCalledWith('prov-1', 'user-1')
  })

  test('returns 403 when role lacks providers:approve permission', async () => {
    ;(requirePermission as jest.Mock).mockRejectedValue(new Error('Forbidden'))
    const res = await approvePost(makeApproveRequest(), makeParams('prov-1'))
    expect(res.status).toBe(403)
  })

  test('returns 401 when not authenticated', async () => {
    ;(requirePermission as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    const res = await approvePost(makeApproveRequest(), makeParams('prov-1'))
    expect(res.status).toBe(401)
  })

  test('returns 404 when provider not found', async () => {
    ;(approveProvider as jest.Mock).mockRejectedValue(new Error('Provider not found'))
    const res = await approvePost(makeApproveRequest(), makeParams('missing'))
    expect(res.status).toBe(404)
  })
})

// ── Reject tests ──────────────────────────────────────────────────────────────

describe('POST /api/crm/providers/[id]/reject', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requirePermission as jest.Mock).mockResolvedValue(mockSession)
    ;(rejectProvider as jest.Mock).mockResolvedValue(undefined)
  })

  test('returns 200 with DRAFT status on success', async () => {
    const res = await rejectPost(makeRejectRequest({ reason: 'Missing documents' }), makeParams('prov-1'))
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('DRAFT')
    expect(rejectProvider).toHaveBeenCalledWith('prov-1', 'Missing documents', 'user-1')
  })

  test('accepts rejection without a reason', async () => {
    const res = await rejectPost(makeRejectRequest({}), makeParams('prov-1'))
    expect(res.status).toBe(200)
    expect(rejectProvider).toHaveBeenCalledWith('prov-1', undefined, 'user-1')
  })

  test('returns 403 when role lacks providers:approve permission', async () => {
    ;(requirePermission as jest.Mock).mockRejectedValue(new Error('Forbidden'))
    const res = await rejectPost(makeRejectRequest(), makeParams('prov-1'))
    expect(res.status).toBe(403)
  })

  test('returns 401 when not authenticated', async () => {
    ;(requirePermission as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    const res = await rejectPost(makeRejectRequest(), makeParams('prov-1'))
    expect(res.status).toBe(401)
  })

  test('returns 404 when provider not found', async () => {
    ;(rejectProvider as jest.Mock).mockRejectedValue(new Error('Provider not found'))
    const res = await rejectPost(makeRejectRequest(), makeParams('missing'))
    expect(res.status).toBe(404)
  })
})
