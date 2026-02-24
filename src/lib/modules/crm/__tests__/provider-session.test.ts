/**
 * Tests for provider-session helper.
 * Mocks Prisma and NextAuth — no real DB or auth calls.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    crmProvider: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth/config', () => ({
  authOptions: {},
}))

import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { getProviderForSession, requireProviderSession } from '../provider-session'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

const mockProvider = {
  id: 'prov-1',
  name: 'Sunrise Support',
  abn: '51824753556',
  email: 'billing@sunrise.com.au',
  phone: '0412345678',
  address: '123 Main St, Sydney NSW 2000',
  bankBsb: '062-001',
  bankAccount: '12345678',
  bankAccountName: 'Sunrise Support Pty Ltd',
  abnStatus: 'Active',
  abnRegisteredName: 'Sunrise Support Pty Ltd',
  gstRegistered: true,
  providerStatus: 'ACTIVE' as const,
}

describe('getProviderForSession', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns provider when linked to user', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(mockProvider)

    const result = await getProviderForSession('user-1')

    expect(result).toEqual(mockProvider)
    expect(mockPrisma.crmProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          portalUserId: 'user-1',
          providerStatus: 'ACTIVE',
          deletedAt: null,
        }),
      })
    )
  })

  test('returns null when no provider linked to user', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await getProviderForSession('user-no-provider')
    expect(result).toBeNull()
  })

  test('returns null for suspended provider', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await getProviderForSession('user-suspended')
    expect(result).toBeNull()
    // The query filters by providerStatus: 'ACTIVE' so suspended providers return null
    expect(mockPrisma.crmProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerStatus: 'ACTIVE' }),
      })
    )
  })
})

describe('requireProviderSession', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns session and provider for valid PROVIDER session', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1', email: 'billing@sunrise.com.au', name: 'Sunrise Support', role: 'PROVIDER' },
      expires: '2026-12-31',
    })
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(mockProvider)

    const { session, provider } = await requireProviderSession()
    expect(session.user.role).toBe('PROVIDER')
    expect(provider.id).toBe('prov-1')
  })

  test('throws UNAUTHORIZED when no session', async () => {
    mockGetServerSession.mockResolvedValue(null)

    await expect(requireProviderSession()).rejects.toThrow('Unauthorized')
  })

  test('throws FORBIDDEN when session role is not PROVIDER', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-pm', email: 'pm@lotus.com.au', name: 'Plan Manager', role: 'PLAN_MANAGER' },
      expires: '2026-12-31',
    })

    await expect(requireProviderSession()).rejects.toThrow('Forbidden')
  })

  test('throws NOT_FOUND when provider not linked', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-orphan', email: 'orphan@test.com', name: 'Orphan', role: 'PROVIDER' },
      expires: '2026-12-31',
    })
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(requireProviderSession()).rejects.toThrow('Provider account not found')
  })
})
