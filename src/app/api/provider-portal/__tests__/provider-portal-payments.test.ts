/**
 * Tests for GET /api/provider-portal/payments
 */

jest.mock('@/lib/modules/crm/provider-session', () => ({
  requireProviderSession: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    bnkPayment: {
      findMany: jest.fn(),
    },
  },
}))

import { GET } from '../payments/route'
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

describe('GET /api/provider-portal/payments', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when not authenticated', async () => {
    mockRequireSession.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' })
    )

    const res = await GET()
    expect(res.status).toBe(401)
  })

  test('returns 403 for non-PROVIDER role', async () => {
    mockRequireSession.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
    )

    const res = await GET()
    expect(res.status).toBe(403)
  })

  test('returns cleared payments with formatted amounts', async () => {
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise', role: 'PROVIDER' } },
      provider: mockProvider,
    })

    const mockPayments = [
      {
        id: 'pay-1',
        amountCents: 150000,
        status: 'CLEARED',
        processedAt: new Date('2026-02-01'),
        reference: 'REF-001',
        claim: {
          invoice: { id: 'inv-1', invoiceNumber: 'INV-001' },
        },
      },
    ]
    ;(mockPrisma.bnkPayment.findMany as jest.Mock).mockResolvedValue(mockPayments)

    const res = await GET()
    expect(res.status).toBe(200)

    const data = await res.json() as { payments: Array<{ id: string; amountFormatted: string; invoiceNumber: string }> }
    expect(data.payments).toHaveLength(1)
    expect(data.payments[0]?.id).toBe('pay-1')
    expect(data.payments[0]?.amountFormatted).toBe('$1,500.00')
    expect(data.payments[0]?.invoiceNumber).toBe('INV-001')
  })

  test('filters payments by provider ID via claim -> invoice relationship', async () => {
    mockRequireSession.mockResolvedValue({
      session: { user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise', role: 'PROVIDER' } },
      provider: mockProvider,
    })
    ;(mockPrisma.bnkPayment.findMany as jest.Mock).mockResolvedValue([])

    await GET()

    expect(mockPrisma.bnkPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'CLEARED',
          claim: expect.objectContaining({
            invoice: expect.objectContaining({
              providerId: 'prov-1',
            }),
          }),
        }),
      })
    )
  })
})
