/**
 * Tests for provider magic link authentication module.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    coreUser: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    coreProviderMagicLink: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/notifications/ses-client', () => ({
  sendSesEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
}))

import { prisma } from '@/lib/db'
import { sendSesEmail } from '@/lib/modules/notifications/ses-client'
import { requestProviderMagicLink, verifyProviderMagicLink } from '../provider-magic-link'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendSesEmail = sendSesEmail as jest.MockedFunction<typeof sendSesEmail>

describe('requestProviderMagicLink', () => {
  beforeEach(() => jest.clearAllMocks())

  test('creates token and sends email for registered provider', async () => {
    ;(mockPrisma.coreUser.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      name: 'Sunrise Support',
    })
    ;(mockPrisma.coreProviderMagicLink.deleteMany as jest.Mock).mockResolvedValue({})
    ;(mockPrisma.coreProviderMagicLink.create as jest.Mock).mockResolvedValue({})

    await requestProviderMagicLink('billing@sunrise.com.au')

    expect(mockPrisma.coreProviderMagicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
    )

    expect(mockSendSesEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@sunrise.com.au',
        subject: 'Your Lotus Assist provider portal login link',
      })
    )
  })

  test('silently succeeds for unregistered email (prevents enumeration)', async () => {
    ;(mockPrisma.coreUser.findFirst as jest.Mock).mockResolvedValue(null)

    await requestProviderMagicLink('notregistered@example.com')

    expect(mockPrisma.coreProviderMagicLink.create).not.toHaveBeenCalled()
    expect(mockSendSesEmail).not.toHaveBeenCalled()
  })

  test('invalidates existing tokens before creating a new one', async () => {
    ;(mockPrisma.coreUser.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      name: 'Test Provider',
    })
    ;(mockPrisma.coreProviderMagicLink.deleteMany as jest.Mock).mockResolvedValue({})
    ;(mockPrisma.coreProviderMagicLink.create as jest.Mock).mockResolvedValue({})

    await requestProviderMagicLink('test@test.com')

    expect(mockPrisma.coreProviderMagicLink.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })
})

describe('verifyProviderMagicLink', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns user data for valid token', async () => {
    ;(mockPrisma.coreProviderMagicLink.findFirst as jest.Mock).mockResolvedValue({
      id: 'ml-1',
      token: 'valid-token-abc',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
      user: {
        id: 'user-1',
        email: 'billing@sunrise.com.au',
        name: 'Sunrise Support',
        role: 'PROVIDER',
        isActive: true,
        deletedAt: null,
      },
    })
    ;(mockPrisma.coreProviderMagicLink.delete as jest.Mock).mockResolvedValue({})
    ;(mockPrisma.coreUser.update as jest.Mock).mockResolvedValue({})

    const result = await verifyProviderMagicLink('valid-token-abc')

    expect(result.userId).toBe('user-1')
    expect(result.email).toBe('billing@sunrise.com.au')
    expect(result.role).toBe('PROVIDER')

    // Token should be consumed
    expect(mockPrisma.coreProviderMagicLink.delete).toHaveBeenCalledWith({
      where: { id: 'ml-1' },
    })
  })

  test('throws TOKEN_INVALID for unknown token', async () => {
    ;(mockPrisma.coreProviderMagicLink.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(verifyProviderMagicLink('bad-token')).rejects.toThrow('TOKEN_INVALID')
  })

  test('throws TOKEN_EXPIRED for expired token', async () => {
    ;(mockPrisma.coreProviderMagicLink.findFirst as jest.Mock).mockResolvedValue({
      id: 'ml-2',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
      user: {
        id: 'user-1',
        email: 'billing@sunrise.com.au',
        name: 'Sunrise Support',
        role: 'PROVIDER',
        isActive: true,
        deletedAt: null,
      },
    })
    ;(mockPrisma.coreProviderMagicLink.delete as jest.Mock).mockResolvedValue({})

    await expect(verifyProviderMagicLink('expired-token')).rejects.toThrow('TOKEN_EXPIRED')
    // Expired token should still be deleted
    expect(mockPrisma.coreProviderMagicLink.delete).toHaveBeenCalled()
  })
})
