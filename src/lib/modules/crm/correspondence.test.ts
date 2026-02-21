/**
 * Unit tests for the CRM Correspondence module.
 * Prisma client is mocked — no real DB calls.
 */

import {
  listCorrespondence,
  getCorrespondence,
  createCorrespondence,
  createFromEmailIngest,
  linkCorrespondenceToParticipant,
  linkCorrespondenceToProvider,
} from './correspondence'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    crmCorrespondence: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'corr-001',
    type: 'EMAIL_INBOUND' as const,
    subject: 'Invoice from Blue Mountains Allied Health',
    body: 'Please find attached our invoice for services rendered.',
    fromAddress: 'billing@bluemountains.com.au',
    toAddress: null,
    participantId: 'part-001',
    providerId: null,
    invoiceId: 'inv-001',
    documentId: null,
    createdById: null,
    metadata: { s3Key: 'invoices/2026/02/abc.pdf', originalFilename: 'invoice.pdf' },
    createdAt: new Date('2026-02-21T10:00:00Z'),
    participant: { id: 'part-001', firstName: 'Michael', lastName: 'Thompson', ndisNumber: '430167234' },
    provider: null,
    invoice: { id: 'inv-001', invoiceNumber: 'PENDING', totalCents: 0 },
    createdBy: null,
    ...overrides,
  }
}

// ── listCorrespondence ────────────────────────────────────────────────────────

describe('listCorrespondence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns paginated results filtered by participantId', async () => {
    const entries = [makeEntry()]
    mockPrisma.crmCorrespondence.findMany.mockResolvedValue(entries)
    mockPrisma.crmCorrespondence.count.mockResolvedValue(1)

    const result = await listCorrespondence({ participantId: 'part-001' })

    expect(mockPrisma.crmCorrespondence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ participantId: 'part-001' }),
      })
    )
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('filters by providerId', async () => {
    mockPrisma.crmCorrespondence.findMany.mockResolvedValue([])
    mockPrisma.crmCorrespondence.count.mockResolvedValue(0)

    await listCorrespondence({ providerId: 'prov-001' })

    expect(mockPrisma.crmCorrespondence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerId: 'prov-001' }),
      })
    )
  })

  it('filters by invoiceId', async () => {
    mockPrisma.crmCorrespondence.findMany.mockResolvedValue([])
    mockPrisma.crmCorrespondence.count.mockResolvedValue(0)

    await listCorrespondence({ invoiceId: 'inv-001' })

    expect(mockPrisma.crmCorrespondence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invoiceId: 'inv-001' }),
      })
    )
  })

  it('filters by type', async () => {
    mockPrisma.crmCorrespondence.findMany.mockResolvedValue([])
    mockPrisma.crmCorrespondence.count.mockResolvedValue(0)

    await listCorrespondence({ type: 'NOTE' })

    expect(mockPrisma.crmCorrespondence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'NOTE' }),
      })
    )
  })

  it('applies default pagination', async () => {
    mockPrisma.crmCorrespondence.findMany.mockResolvedValue([])
    mockPrisma.crmCorrespondence.count.mockResolvedValue(0)

    await listCorrespondence({})

    expect(mockPrisma.crmCorrespondence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 })
    )
  })

  it('applies custom pagination', async () => {
    mockPrisma.crmCorrespondence.findMany.mockResolvedValue([])
    mockPrisma.crmCorrespondence.count.mockResolvedValue(0)

    await listCorrespondence({ page: 2, pageSize: 10 })

    expect(mockPrisma.crmCorrespondence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    )
  })
})

// ── getCorrespondence ─────────────────────────────────────────────────────────

describe('getCorrespondence', () => {
  it('returns entry by id', async () => {
    const entry = makeEntry()
    mockPrisma.crmCorrespondence.findUnique.mockResolvedValue(entry)

    const result = await getCorrespondence('corr-001')
    expect(result).toEqual(entry)
    expect(mockPrisma.crmCorrespondence.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'corr-001' } })
    )
  })

  it('returns null if not found', async () => {
    mockPrisma.crmCorrespondence.findUnique.mockResolvedValue(null)
    const result = await getCorrespondence('nonexistent')
    expect(result).toBeNull()
  })
})

// ── createCorrespondence ──────────────────────────────────────────────────────

describe('createCorrespondence', () => {
  it('creates a NOTE entry and writes audit log', async () => {
    const created = makeEntry({ type: 'NOTE', createdById: 'user-001', participantId: 'part-001' })
    mockPrisma.crmCorrespondence.create.mockResolvedValue(created)

    const { createAuditLog } = await import('@/lib/modules/core/audit')

    const result = await createCorrespondence(
      {
        type: 'NOTE',
        body: 'Spoke with participant about upcoming review.',
        participantId: 'part-001',
      },
      'user-001'
    )

    expect(mockPrisma.crmCorrespondence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'NOTE',
          body: 'Spoke with participant about upcoming review.',
          participantId: 'part-001',
          createdById: 'user-001',
        }),
      })
    )
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-001',
        action: 'correspondence.created',
        resource: 'correspondence',
      })
    )
    expect(result).toEqual(created)
  })

  it('creates EMAIL_OUTBOUND with fromAddress/toAddress', async () => {
    const created = makeEntry({ type: 'EMAIL_OUTBOUND', fromAddress: 'pm@lotus.com', toAddress: 'provider@test.com' })
    mockPrisma.crmCorrespondence.create.mockResolvedValue(created)

    await createCorrespondence(
      {
        type: 'EMAIL_OUTBOUND',
        subject: 'Re: Invoice query',
        body: 'Thank you for your invoice.',
        fromAddress: 'pm@lotus.com',
        toAddress: 'provider@test.com',
        providerId: 'prov-001',
      },
      'user-001'
    )

    expect(mockPrisma.crmCorrespondence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'EMAIL_OUTBOUND',
          fromAddress: 'pm@lotus.com',
          toAddress: 'provider@test.com',
        }),
      })
    )
  })
})

// ── createFromEmailIngest ─────────────────────────────────────────────────────

describe('createFromEmailIngest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates EMAIL_INBOUND with invoiceId and truncates body to 5000 chars', async () => {
    const longBody = 'x'.repeat(10000)
    const created = makeEntry({ type: 'EMAIL_INBOUND', invoiceId: 'inv-001', participantId: null })
    mockPrisma.crmCorrespondence.create.mockResolvedValue(created)

    await createFromEmailIngest({
      invoiceId: 'inv-001',
      fromAddress: 'billing@provider.com',
      subject: 'Invoice attached',
      body: longBody,
      metadata: { s3Key: 'invoices/2026/02/abc.pdf', originalFilename: 'inv.pdf' },
    })

    const createCall = mockPrisma.crmCorrespondence.create.mock.calls[0][0]
    expect(createCall.data.type).toBe('EMAIL_INBOUND')
    expect(createCall.data.invoiceId).toBe('inv-001')
    expect(createCall.data.fromAddress).toBe('billing@provider.com')
    expect(createCall.data.body).toHaveLength(5000)
    expect(createCall.data.participantId).toBeUndefined()
    expect(createCall.data.providerId).toBeUndefined()
  })

  it('does not set participantId or providerId (resolved during triage)', async () => {
    mockPrisma.crmCorrespondence.create.mockResolvedValue(makeEntry())

    await createFromEmailIngest({
      invoiceId: 'inv-001',
      fromAddress: 'test@test.com',
      subject: 'Test',
      body: 'body',
    })

    const createCall = mockPrisma.crmCorrespondence.create.mock.calls[0][0]
    expect(createCall.data.participantId).toBeUndefined()
    expect(createCall.data.providerId).toBeUndefined()
  })
})

// ── linkCorrespondenceToParticipant / linkCorrespondenceToProvider ─────────────

describe('linkCorrespondenceToParticipant', () => {
  it('updates participantId on the entry', async () => {
    const updated = makeEntry({ participantId: 'part-002' })
    mockPrisma.crmCorrespondence.update.mockResolvedValue(updated)

    const result = await linkCorrespondenceToParticipant('corr-001', 'part-002')

    expect(mockPrisma.crmCorrespondence.update).toHaveBeenCalledWith({
      where: { id: 'corr-001' },
      data: { participantId: 'part-002' },
    })
    expect(result).toEqual(updated)
  })
})

describe('linkCorrespondenceToProvider', () => {
  it('updates providerId on the entry', async () => {
    const updated = makeEntry({ providerId: 'prov-002' })
    mockPrisma.crmCorrespondence.update.mockResolvedValue(updated)

    const result = await linkCorrespondenceToProvider('corr-001', 'prov-002')

    expect(mockPrisma.crmCorrespondence.update).toHaveBeenCalledWith({
      where: { id: 'corr-001' },
      data: { providerId: 'prov-002' },
    })
    expect(result).toEqual(updated)
  })
})
