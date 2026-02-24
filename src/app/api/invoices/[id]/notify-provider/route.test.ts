/**
 * Tests for POST /api/invoices/[id]/notify-provider
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/notifications/provider-notifications', () => ({
  notifyProviderAutoRejected: jest.fn(),
  notifyProviderNeedsCodes: jest.fn(),
  notifyProviderCustom: jest.fn(),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { POST } from './route'
import { requirePermission } from '@/lib/auth/session'
import {
  notifyProviderAutoRejected,
  notifyProviderNeedsCodes,
  notifyProviderCustom,
} from '@/lib/modules/notifications/provider-notifications'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockNotifyAutoRejected = notifyProviderAutoRejected as jest.MockedFunction<typeof notifyProviderAutoRejected>
const mockNotifyNeedsCodes = notifyProviderNeedsCodes as jest.MockedFunction<typeof notifyProviderNeedsCodes>
const mockNotifyCustom = notifyProviderCustom as jest.MockedFunction<typeof notifyProviderCustom>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'user-001', role: 'PLAN_MANAGER', email: 'pm@lotusassist.com.au', name: 'James Walker' },
}

function makeRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/invoices/${id}/notify-provider`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/[id]/notify-provider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(mockSession as never)
  })

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(makeRequest('inv-001', { type: 'REJECTION' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when user lacks invoices:write', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const res = await POST(makeRequest('inv-001', { type: 'REJECTION' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  // ── Validation ───────────────────────────────────────────────────────────────

  it('returns 400 for invalid type', async () => {
    const res = await POST(makeRequest('inv-001', { type: 'INVALID_TYPE' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for CUSTOM type without message', async () => {
    const res = await POST(makeRequest('inv-001', { type: 'CUSTOM' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/invoices/inv-001/notify-provider', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'inv-001' }) })

    expect(res.status).toBe(400)
  })

  // ── REJECTION type ───────────────────────────────────────────────────────────

  it('calls notifyProviderAutoRejected for REJECTION type', async () => {
    mockNotifyAutoRejected.mockResolvedValue(true)

    const res = await POST(makeRequest('inv-001', { type: 'REJECTION' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(200)
    expect(mockNotifyAutoRejected).toHaveBeenCalledWith({ invoiceId: 'inv-001' })
    expect(mockNotifyNeedsCodes).not.toHaveBeenCalled()
    expect(mockNotifyCustom).not.toHaveBeenCalled()

    const body = await res.json() as { data: { sent: boolean; type: string } }
    expect(body.data.sent).toBe(true)
    expect(body.data.type).toBe('REJECTION')
  })

  it('returns sent:false with skip message when provider has no email (REJECTION)', async () => {
    mockNotifyAutoRejected.mockResolvedValue(false)

    const res = await POST(makeRequest('inv-001', { type: 'REJECTION' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { sent: boolean; message: string } }
    expect(body.data.sent).toBe(false)
    expect(body.data.message).toContain('no email address')
  })

  // ── NEEDS_CODES type ──────────────────────────────────────────────────────────

  it('calls notifyProviderNeedsCodes for NEEDS_CODES type', async () => {
    mockNotifyNeedsCodes.mockResolvedValue(true)

    const res = await POST(makeRequest('inv-001', { type: 'NEEDS_CODES' }), {
      params: Promise.resolve({ id: 'inv-001' }),
    })

    expect(res.status).toBe(200)
    expect(mockNotifyNeedsCodes).toHaveBeenCalledWith({ invoiceId: 'inv-001' })
    expect(mockNotifyAutoRejected).not.toHaveBeenCalled()
  })

  // ── CUSTOM type ──────────────────────────────────────────────────────────────

  it('calls notifyProviderCustom for CUSTOM type with message', async () => {
    mockNotifyCustom.mockResolvedValue(true)

    const res = await POST(
      makeRequest('inv-001', { type: 'CUSTOM', message: 'Please resubmit with dates corrected.' }),
      { params: Promise.resolve({ id: 'inv-001' }) }
    )

    expect(res.status).toBe(200)
    expect(mockNotifyCustom).toHaveBeenCalledWith({
      invoiceId: 'inv-001',
      message: 'Please resubmit with dates corrected.',
    })

    const body = await res.json() as { data: { sent: boolean } }
    expect(body.data.sent).toBe(true)
  })
})
