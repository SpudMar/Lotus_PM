/**
 * Tests for GET /api/invoices/[id]/presigned-url
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/modules/invoices/invoices', () => ({
  getInvoice: jest.fn(),
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ ...input })),
}))

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { GET } from './route'
import { requirePermission } from '@/lib/auth/session'
import { getInvoice } from '@/lib/modules/invoices/invoices'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockGetInvoice = getInvoice as jest.MockedFunction<typeof getInvoice>
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSession = { user: { id: 'user-001', role: 'PLAN_MANAGER', email: 'pm@lotus.com', name: 'James Walker' } }

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    invoiceNumber: 'PENDING',
    s3Key: 'invoices/2026/02/abc123.pdf',
    s3Bucket: 'lotus-pm-invoices',
    status: 'PENDING_REVIEW',
    ...overrides,
  }
}

function makeRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/invoices/${id}/presigned-url`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/invoices/[id]/presigned-url', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))

    const res = await GET(makeRequest('inv-001'), { params: Promise.resolve({ id: 'inv-001' }) })

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when user lacks invoices:read', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))

    const res = await GET(makeRequest('inv-001'), { params: Promise.resolve({ id: 'inv-001' }) })

    expect(res.status).toBe(403)
  })

  it('returns 404 when invoice not found', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    mockGetInvoice.mockResolvedValue(null)

    const res = await GET(makeRequest('inv-notexist'), { params: Promise.resolve({ id: 'inv-notexist' }) })

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when invoice has no s3Key', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    mockGetInvoice.mockResolvedValue(makeInvoice({ s3Key: null, s3Bucket: null }) as never)

    const res = await GET(makeRequest('inv-001'), { params: Promise.resolve({ id: 'inv-001' }) })

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('NO_DOCUMENT')
  })

  it('returns presigned URL on success', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    mockGetInvoice.mockResolvedValue(makeInvoice() as never)
    mockGetSignedUrl.mockResolvedValue('https://s3.ap-southeast-2.amazonaws.com/bucket/key?signed=true')

    const res = await GET(makeRequest('inv-001'), { params: Promise.resolve({ id: 'inv-001' }) })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { downloadUrl: string; filename: string; expiresInSeconds: number } }
    expect(body.data.downloadUrl).toBe('https://s3.ap-southeast-2.amazonaws.com/bucket/key?signed=true')
    expect(body.data.filename).toBe('abc123.pdf')
    expect(body.data.expiresInSeconds).toBe(900) // 15 minutes
  })

  it('extracts filename from s3Key', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    mockGetInvoice.mockResolvedValue(makeInvoice({ s3Key: 'invoices/2026/02/my-invoice-file.pdf' }) as never)
    mockGetSignedUrl.mockResolvedValue('https://example.com/signed')

    const res = await GET(makeRequest('inv-001'), { params: Promise.resolve({ id: 'inv-001' }) })
    const body = await res.json() as { data: { filename: string } }
    expect(body.data.filename).toBe('my-invoice-file.pdf')
  })

  it('generates presigned URL with 15 minute expiry', async () => {
    mockRequirePermission.mockResolvedValue(mockSession as never)
    mockGetInvoice.mockResolvedValue(makeInvoice() as never)
    mockGetSignedUrl.mockResolvedValue('https://example.com/signed')

    await GET(makeRequest('inv-001'), { params: Promise.resolve({ id: 'inv-001' }) })

    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 900 })
    )
  })
})
