/**
 * Tests for POST /api/crm/providers/create-from-invoice
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/crm/provider-onboarding', () => ({
  createProviderFromInvoice: jest.fn(),
}))

jest.mock('@/lib/modules/crm/abn-lookup', () => ({
  lookupAbn: jest.fn(),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { createProviderFromInvoice } from '@/lib/modules/crm/provider-onboarding'
import { lookupAbn } from '@/lib/modules/crm/abn-lookup'
import { POST } from '@/app/api/crm/providers/create-from-invoice/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/crm/providers/create-from-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mockSession = { user: { id: 'user-1', name: 'PM User', role: 'PLAN_MANAGER' } }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/crm/providers/create-from-invoice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requirePermission as jest.Mock).mockResolvedValue(mockSession)
    ;(createProviderFromInvoice as jest.Mock).mockResolvedValue({ id: 'prov-1', name: 'Test', abn: '51824753556' })
    ;(lookupAbn as jest.Mock).mockResolvedValue(null)
  })

  test('returns 201 with providerId on success', async () => {
    const req = makeRequest({ name: 'Test Provider', invoiceId: 'inv-1' })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const json = await res.json() as { data: { providerId: string } }
    expect(json.data.providerId).toBe('prov-1')
  })

  test('enriches provider from ABR when ABN is provided and lookup succeeds', async () => {
    ;(lookupAbn as jest.Mock).mockResolvedValue({
      abn: '51824753556',
      entityName: 'SUNRISE SUPPORT PTY LTD',
      abnStatus: 'Active',
      gstRegistered: true,
      entityType: 'Australian Private Company',
    })

    const req = makeRequest({ abn: '51824753556', invoiceId: 'inv-1' })
    const res = await POST(req)
    expect(res.status).toBe(201)

    const json = await res.json() as { data: { abnLookup: { entityName: string; abnStatus: string; gstRegistered: boolean } } }
    expect(json.data.abnLookup).not.toBeNull()
    expect(json.data.abnLookup?.entityName).toBe('SUNRISE SUPPORT PTY LTD')
    expect(json.data.abnLookup?.gstRegistered).toBe(true)

    expect(createProviderFromInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        abnRegisteredName: 'SUNRISE SUPPORT PTY LTD',
        abnStatus: 'Active',
        gstRegistered: true,
      }),
      'user-1'
    )
  })

  test('handles missing ABR_GUID gracefully (abnLookup is null)', async () => {
    ;(lookupAbn as jest.Mock).mockResolvedValue(null) // ABR not configured

    const req = makeRequest({ abn: '51824753556', name: 'Test Provider' })
    const res = await POST(req)
    expect(res.status).toBe(201)

    const json = await res.json() as { data: { abnLookup: null } }
    expect(json.data.abnLookup).toBeNull()
  })

  test('returns 401 when not authenticated', async () => {
    ;(requirePermission as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    const req = makeRequest({ name: 'Test' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  test('returns 403 when insufficient permissions', async () => {
    ;(requirePermission as jest.Mock).mockRejectedValue(new Error('Forbidden'))
    const req = makeRequest({ name: 'Test' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
