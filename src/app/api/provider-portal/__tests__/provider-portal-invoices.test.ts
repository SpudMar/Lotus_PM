/**
 * Tests for GET /api/provider-portal/invoices
 */

jest.mock('@/lib/modules/crm/provider-session', () => ({
  requireProviderSession: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findMany: jest.fn(),
    },
  },
}))

import { GET } from '../invoices/route'
import { requireProviderSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'

const mockRequireSession = requireProviderSession as jest.MockedFunction<typeof requireProviderSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

const mockProvider = {
  id: 'prov-1',
  name: 'Sunrise Support',
  abn: '51824753556',
  email: 'billing@sunrise.com.au',
  phone: null,
  address: null,
  bankBsb: null,
  bankAccount: null,
  bankAccountName: null,
  abnStatus: 'Active',
  abnRegisteredName: 'Sunrise Support Pty Ltd',
  gstRegistered: true,
  providerStatus: 'ACTIVE' as const,
}

describe('GET /api/provider-portal/invoices', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when not authenticated', async () => {
    mockRequireSession.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' })
    )

    const res = await GET()
    expect(res.status).toBe(401)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('Unauthorized')
  })

  test('returns 403 when session is not PROVIDER role', async () => {
    mockRequireSession.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
    )

    const res = await GET()
    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('Forbidden')
  })

  test('returns invoices filtered by provider ID', async () => {
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise', role: 'PROVIDER' } },
      provider: mockProvider,
    })

    const mockInvoices = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date('2026-01-15'),
        receivedAt: new Date('2026-01-16'),
        totalCents: 50000,
        status: 'APPROVED',
        rejectionReason: null,
        participant: { firstName: 'John', lastName: 'Doe' },
      },
    ]
    ;(mockPrisma.invInvoice.findMany as jest.Mock).mockResolvedValue(mockInvoices)

    const res = await GET()
    expect(res.status).toBe(200)

    const data = await res.json() as { invoices: Array<{ id: string; participantName: string; totalFormatted: string }> }
    expect(data.invoices).toHaveLength(1)
    expect(data.invoices[0]?.id).toBe('inv-1')
    expect(data.invoices[0]?.participantName).toBe('John Doe')
    expect(data.invoices[0]?.totalFormatted).toBe('$500.00')

    expect(mockPrisma.invInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerId: 'prov-1' }),
      })
    )
  })

  test('returns empty array when provider has no invoices', async () => {
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise', role: 'PROVIDER' } },
      provider: mockProvider,
    })
    ;(mockPrisma.invInvoice.findMany as jest.Mock).mockResolvedValue([])

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json() as { invoices: unknown[] }
    expect(data.invoices).toHaveLength(0)
  })

  test('does not expose NDIS number in response', async () => {
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise', role: 'PROVIDER' } },
      provider: mockProvider,
    })
    ;(mockPrisma.invInvoice.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date('2026-01-15'),
        receivedAt: new Date('2026-01-16'),
        totalCents: 10000,
        status: 'RECEIVED',
        rejectionReason: null,
        participant: { firstName: 'Jane', lastName: 'Smith' },
      },
    ])

    const res = await GET()
    const data = await res.json() as { invoices: Array<Record<string, unknown>> }
    expect(data.invoices[0]).not.toHaveProperty('ndisNumber')
    expect(data.invoices[0]).not.toHaveProperty('participant')
    expect(data.invoices[0]?.participantName).toBe('Jane Smith')
  })
})
