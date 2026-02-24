/**
 * Tests for provider-onboarding module.
 * Mocks Prisma and SES — no real DB or email calls.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    crmProvider: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/notifications/ses-client', () => ({
  sendSesEmail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { sendSesEmail } from '@/lib/modules/notifications/ses-client'
import {
  createProviderFromInvoice,
  sendProviderInvite,
  approveProvider,
  rejectProvider,
  getPendingProviders,
  completeProviderProfile,
} from '@/lib/modules/crm/provider-onboarding'

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>
const mockSendSesEmail = sendSesEmail as jest.MockedFunction<typeof sendSesEmail>

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createProviderFromInvoice', () => {
  beforeEach(() => jest.clearAllMocks())

  test('creates provider with DRAFT status', async () => {
    const created = { id: 'prov-1', name: 'Sunrise Support', abn: '51824753556' }
    ;(mockPrisma.crmProvider.create as jest.Mock).mockResolvedValue(created)

    const result = await createProviderFromInvoice(
      { name: 'Sunrise Support', abn: '51824753556', email: 'test@sunrise.com.au' },
      'user-1'
    )

    expect(mockPrisma.crmProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: 'DRAFT',
          name: 'Sunrise Support',
          abn: '51824753556',
        }),
      })
    )
    expect(result.id).toBe('prov-1')
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resource: 'CrmProvider',
        resourceId: 'prov-1',
      })
    )
  })

  test('uses abnRegisteredName as fallback when name is not provided', async () => {
    const created = { id: 'prov-2', name: 'ACME PTY LTD', abn: '12345678901' }
    ;(mockPrisma.crmProvider.create as jest.Mock).mockResolvedValue(created)

    await createProviderFromInvoice(
      { abn: '12345678901', abnRegisteredName: 'ACME PTY LTD' },
      'user-1'
    )

    expect(mockPrisma.crmProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'ACME PTY LTD' }),
      })
    )
  })

  test('uses Unknown Provider as final fallback', async () => {
    const created = { id: 'prov-3', name: 'Unknown Provider', abn: '' }
    ;(mockPrisma.crmProvider.create as jest.Mock).mockResolvedValue(created)

    await createProviderFromInvoice({}, 'user-1')

    expect(mockPrisma.crmProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Unknown Provider' }),
      })
    )
  })

  test('stores ABR-enriched fields when provided', async () => {
    const created = { id: 'prov-4', name: 'Test Co', abn: '51824753556' }
    ;(mockPrisma.crmProvider.create as jest.Mock).mockResolvedValue(created)

    await createProviderFromInvoice(
      {
        abn: '51824753556',
        name: 'Test Co',
        abnStatus: 'Active',
        abnRegisteredName: 'TEST CO PTY LTD',
        gstRegistered: true,
      },
      'user-1'
    )

    expect(mockPrisma.crmProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          abnStatus: 'Active',
          abnRegisteredName: 'TEST CO PTY LTD',
          gstRegistered: true,
        }),
      })
    )
  })
})

describe('sendProviderInvite', () => {
  beforeEach(() => jest.clearAllMocks())

  test('generates a token and sends invite email', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'prov-1',
      name: 'Sunrise Support',
      email: 'pm@sunrise.com.au',
      providerStatus: 'DRAFT',
    })
    ;(mockPrisma.crmProvider.update as jest.Mock).mockResolvedValue({})

    const result = await sendProviderInvite('prov-1', 'user-1')

    expect(result.token).toHaveLength(64) // 32 bytes = 64 hex chars
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())

    expect(mockPrisma.crmProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prov-1' },
        data: expect.objectContaining({
          inviteToken: result.token,
          providerStatus: 'INVITED',
        }),
      })
    )

    expect(mockSendSesEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pm@sunrise.com.au',
        subject: expect.stringContaining("You've been invited"),
      })
    )

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVITE_SENT',
        resource: 'CrmProvider',
        resourceId: 'prov-1',
      })
    )
  })

  test('throws when provider not found', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)
    await expect(sendProviderInvite('missing', 'user-1')).rejects.toThrow('Provider not found')
  })

  test('throws when provider has no email', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'prov-1',
      name: 'No Email Provider',
      email: null,
      providerStatus: 'DRAFT',
    })
    await expect(sendProviderInvite('prov-1', 'user-1')).rejects.toThrow('no email address')
  })
})

describe('approveProvider', () => {
  beforeEach(() => jest.clearAllMocks())

  test('sets providerStatus to ACTIVE', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'prov-1',
      providerStatus: 'PENDING_APPROVAL',
    })
    ;(mockPrisma.crmProvider.update as jest.Mock).mockResolvedValue({})

    await approveProvider('prov-1', 'user-1')

    expect(mockPrisma.crmProvider.update).toHaveBeenCalledWith({
      where: { id: 'prov-1' },
      data: { providerStatus: 'ACTIVE' },
    })

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVE',
        before: { providerStatus: 'PENDING_APPROVAL' },
        after: { providerStatus: 'ACTIVE' },
      })
    )
  })

  test('throws when provider not found', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)
    await expect(approveProvider('missing', 'user-1')).rejects.toThrow('Provider not found')
  })
})

describe('rejectProvider', () => {
  beforeEach(() => jest.clearAllMocks())

  test('sets providerStatus back to DRAFT and clears invite', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'prov-1',
      providerStatus: 'PENDING_APPROVAL',
    })
    ;(mockPrisma.crmProvider.update as jest.Mock).mockResolvedValue({})

    await rejectProvider('prov-1', 'Missing bank details', 'user-1')

    expect(mockPrisma.crmProvider.update).toHaveBeenCalledWith({
      where: { id: 'prov-1' },
      data: {
        providerStatus: 'DRAFT',
        inviteToken: null,
        inviteExpiresAt: null,
      },
    })

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REJECT',
        after: expect.objectContaining({ reason: 'Missing bank details' }),
      })
    )
  })

  test('throws when provider not found', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)
    await expect(rejectProvider('missing', undefined, 'user-1')).rejects.toThrow('Provider not found')
  })
})

describe('getPendingProviders', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns providers with PENDING_APPROVAL status', async () => {
    const mockData = [
      {
        id: 'p1', name: 'A Provider', abn: '11111111111',
        email: null, phone: null, address: null,
        abnStatus: 'Active', abnRegisteredName: 'A PROVIDER PTY LTD', gstRegistered: true,
        bankBsb: null, bankAccount: null, bankAccountName: null,
        providerStatus: 'PENDING_APPROVAL', createdAt: new Date(), updatedAt: new Date(),
      },
    ]
    ;(mockPrisma.crmProvider.findMany as jest.Mock).mockResolvedValue(mockData)

    const result = await getPendingProviders()

    expect(mockPrisma.crmProvider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerStatus: 'PENDING_APPROVAL', deletedAt: null },
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.providerStatus).toBe('PENDING_APPROVAL')
  })
})

describe('completeProviderProfile', () => {
  beforeEach(() => jest.clearAllMocks())

  test('updates provider and sets PENDING_APPROVAL status', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'prov-1',
      name: 'Sunrise Support',
      abn: '51824753556',
      inviteExpiresAt: futureDate,
      providerStatus: 'INVITED',
    })
    ;(mockPrisma.crmProvider.update as jest.Mock).mockResolvedValue({})

    const result = await completeProviderProfile('valid-token', {
      name: 'Sunrise Support Services',
      email: 'billing@sunrise.com.au',
      phone: '02 9000 0000',
      bankBsb: '062-000',
      bankAccount: '12345678',
      bankAccountName: 'SUNRISE SUPPORT SERVICES PTY LTD',
    })

    expect(result.providerId).toBe('prov-1')

    expect(mockPrisma.crmProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prov-1' },
        data: expect.objectContaining({
          providerStatus: 'PENDING_APPROVAL',
          name: 'Sunrise Support Services',
          email: 'billing@sunrise.com.au',
        }),
      })
    )

    expect(mockSendSesEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Sunrise Support Services'),
      })
    )
  })

  test('throws TOKEN_INVALID when token not found', async () => {
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      completeProviderProfile('bad-token', { name: 'Test', email: 'test@example.com' })
    ).rejects.toThrow('TOKEN_INVALID')
  })

  test('throws TOKEN_EXPIRED when invite has expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    ;(mockPrisma.crmProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'prov-1',
      name: 'Old Provider',
      abn: '51824753556',
      inviteExpiresAt: pastDate,
      providerStatus: 'INVITED',
    })

    await expect(
      completeProviderProfile('expired-token', { name: 'Test', email: 'test@example.com' })
    ).rejects.toThrow('TOKEN_EXPIRED')
  })
})
