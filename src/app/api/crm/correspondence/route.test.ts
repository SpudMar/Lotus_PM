/**
 * Tests for GET /api/crm/correspondence and POST /api/crm/correspondence
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/crm/correspondence', () => ({
  listCorrespondence: jest.fn(),
  createCorrespondence: jest.fn(),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { requirePermission } from '@/lib/auth/session'
import { listCorrespondence, createCorrespondence } from '@/lib/modules/crm/correspondence'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockList = listCorrespondence as jest.MockedFunction<typeof listCorrespondence>
const mockCreate = createCorrespondence as jest.MockedFunction<typeof createCorrespondence>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSession = { user: { id: 'user-001', role: 'PLAN_MANAGER', email: 'pm@lotus.com', name: 'James Walker' } }

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'corr-001',
    type: 'EMAIL_INBOUND' as const,
    subject: 'Invoice attached',
    body: 'Please find our invoice attached.',
    fromAddress: 'billing@provider.com',
    toAddress: null,
    participantId: null,
    providerId: null,
    invoiceId: 'inv-001',
    documentId: null,
    createdById: null,
    metadata: null,
    createdAt: new Date('2026-02-21T10:00:00Z'),
    participant: null,
    provider: null,
    invoice: null,
    createdBy: null,
    ...overrides,
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/crm/correspondence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const req = new NextRequest('http://localhost/api/crm/correspondence')
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when user lacks comms:read permission', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const req = new NextRequest('http://localhost/api/crm/correspondence')
    const res = await GET(req)

    expect(res.status).toBe(403)
  })

  it('returns paginated correspondence list', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    const entries = [makeEntry()]
    mockList.mockResolvedValue({ data: entries, total: 1 })

    const req = new NextRequest('http://localhost/api/crm/correspondence?participantId=part-001')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[]; total: number }
    expect(body.data).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: 'part-001' })
    )
  })

  it('filters by type when provided', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    mockList.mockResolvedValue({ data: [], total: 0 })

    const req = new NextRequest('http://localhost/api/crm/correspondence?type=NOTE')
    await GET(req)

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'NOTE' })
    )
  })

  it('returns 400 for invalid type filter', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)

    const req = new NextRequest('http://localhost/api/crm/correspondence?type=INVALID_TYPE')
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/crm/correspondence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const req = new NextRequest('http://localhost/api/crm/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'NOTE', body: 'test' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('creates a NOTE and returns 201', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    const created = makeEntry({ type: 'NOTE', createdById: 'user-001' })
    mockCreate.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/crm/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'NOTE',
        subject: 'Spoke with participant',
        body: 'Discussed upcoming review.',
        participantId: 'part-001',
      }),
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const body = await res.json() as { data: { id: string; type: string } }
    // JSON serialization converts Date → string; check key fields only
    expect(body.data.id).toBe(created.id)
    expect(body.data.type).toBe(created.type)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NOTE',
        body: 'Discussed upcoming review.',
        participantId: 'part-001',
      }),
      'user-001'
    )
  })

  it('returns 400 when body is missing', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)

    const req = new NextRequest('http://localhost/api/crm/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'NOTE' }), // missing body field
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const resBody = await res.json() as { code: string }
    expect(resBody.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid type', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)

    const req = new NextRequest('http://localhost/api/crm/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'INVALID', body: 'test' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('creates PHONE_CALL entry', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    const created = makeEntry({ type: 'PHONE_CALL' })
    mockCreate.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/crm/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'PHONE_CALL',
        body: 'Confirmed invoice details with provider.',
        providerId: 'prov-001',
      }),
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PHONE_CALL', providerId: 'prov-001' }),
      'user-001'
    )
  })
})
