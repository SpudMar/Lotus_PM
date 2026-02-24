/**
 * Tests for GET + PATCH /api/provider-portal/profile
 */

jest.mock('@/lib/modules/crm/provider-session', () => ({
  requireProviderSession: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    crmProvider: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { NextRequest } from 'next/server'
import { GET, PATCH } from '../profile/route'
import { requireProviderSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'

const mockRequireSession = requireProviderSession as jest.MockedFunction<typeof requireProviderSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

const mockProvider = {
  id: 'prov-1',
  name: 'Sunrise Support',
  abn: '51824753556',
  email: 'billing@sunrise.com.au',
  phone: '0412345678',
  address: '123 Main St',
  bankBsb: '062-001',
  bankAccount: '12345678',
  bankAccountName: 'Sunrise Support Pty Ltd',
  abnStatus: 'Active',
  abnRegisteredName: 'Sunrise Support Pty Ltd',
  gstRegistered: true,
  providerStatus: 'ACTIVE' as const,
}

const mockSession = {
  user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise', role: 'PROVIDER' },
}

describe('GET /api/provider-portal/profile', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when not authenticated', async () => {
    mockRequireSession.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' })
    )

    const res = await GET()
    expect(res.status).toBe(401)
  })

  test('returns provider profile for authenticated user', async () => {
    mockRequireSession.mockResolvedValue({ session: mockSession, provider: mockProvider })

    const res = await GET()
    expect(res.status).toBe(200)

    const data = await res.json() as { provider: typeof mockProvider }
    expect(data.provider.id).toBe('prov-1')
    expect(data.provider.name).toBe('Sunrise Support')
    expect(data.provider.abn).toBe('51824753556')
  })
})

describe('PATCH /api/provider-portal/profile', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 403 for non-PROVIDER role', async () => {
    mockRequireSession.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
    )

    const req = new NextRequest('http://localhost/api/provider-portal/profile', {
      method: 'PATCH',
      body: JSON.stringify({ phone: '0499000111' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
  })

  test('updates bank details and returns updated profile', async () => {
    mockRequireSession.mockResolvedValue({ session: mockSession, provider: mockProvider })

    const updatedProvider = {
      ...mockProvider,
      bankBsb: '033-022',
      bankAccount: '99887766',
      bankAccountName: 'New Account Name',
    }
    ;(mockPrisma.crmProvider.update as jest.Mock).mockResolvedValue(updatedProvider)

    const req = new NextRequest('http://localhost/api/provider-portal/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        bankBsb: '033-022',
        bankAccount: '99887766',
        bankAccountName: 'New Account Name',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)

    const data = await res.json() as { provider: typeof updatedProvider }
    expect(data.provider.bankBsb).toBe('033-022')

    expect(mockPrisma.crmProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prov-1' },
        data: expect.objectContaining({
          bankBsb: '033-022',
          bankAccount: '99887766',
          bankAccountName: 'New Account Name',
        }),
      })
    )
  })

  test('returns 400 for invalid BSB format', async () => {
    mockRequireSession.mockResolvedValue({ session: mockSession, provider: mockProvider })

    const req = new NextRequest('http://localhost/api/provider-portal/profile', {
      method: 'PATCH',
      body: JSON.stringify({ bankBsb: 'not-a-bsb' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  test('returns 400 for invalid JSON', async () => {
    mockRequireSession.mockResolvedValue({ session: mockSession, provider: mockProvider })

    const req = new NextRequest('http://localhost/api/provider-portal/profile', {
      method: 'PATCH',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
