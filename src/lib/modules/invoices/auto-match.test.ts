/**
 * Unit tests for the Auto-Matching Service.
 *
 * Covers:
 *   - Tier 1: ABN exact match, NDIS number exact match, email exact match
 *   - Tier 2: Email domain heuristic, historical match
 *   - Tier 3: No match
 *   - Combined: provider by ABN + participant by NDIS
 *   - Learning loop: recordProviderEmailMatch create + isVerified update
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    crmProvider: { findFirst: jest.fn() },
    crmParticipant: { findFirst: jest.fn() },
    crmProviderEmail: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    invInvoice: { findMany: jest.fn() },
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { autoMatchInvoice, recordProviderEmailMatch } from './auto-match'
import type { ExtractedInvoiceData } from './textract-extraction'

// Cast to mocked versions for type-safe spy access
const mockProvider = prisma.crmProvider as jest.Mocked<typeof prisma.crmProvider>
const mockParticipant = prisma.crmParticipant as jest.Mocked<typeof prisma.crmParticipant>
const mockProviderEmail = prisma.crmProviderEmail as jest.Mocked<typeof prisma.crmProviderEmail>
const mockInvoice = prisma.invInvoice as jest.Mocked<typeof prisma.invInvoice>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeExtracted(overrides: Partial<ExtractedInvoiceData> = {}): ExtractedInvoiceData {
  return {
    invoiceNumber: null,
    invoiceDate: null,
    subtotalCents: null,
    gstCents: null,
    totalCents: null,
    providerAbn: null,
    participantNdisNumber: null,
    lineItems: [],
    confidence: 0,
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function clearAll() {
  jest.clearAllMocks()
  mockProvider.findFirst.mockResolvedValue(null)
  mockParticipant.findFirst.mockResolvedValue(null)
  mockProviderEmail.findFirst.mockResolvedValue(null)
  mockProviderEmail.findMany.mockResolvedValue([])
  mockInvoice.findMany.mockResolvedValue([])
}

// ── autoMatchInvoice ──────────────────────────────────────────────────────────

describe('autoMatchInvoice', () => {
  beforeEach(clearAll)

  // ── TIER 1 ────────────────────────────────────────────────────────────────

  describe('TIER 1 — deterministic', () => {
    it('matches provider by ABN exact match (ABN_EXACT)', async () => {
      const extracted = makeExtracted({ providerAbn: '11111111111' })
      mockProvider.findFirst.mockResolvedValue(
        { id: 'prov-001', name: 'Blue Mountains Allied Health' } as never
      )

      const result = await autoMatchInvoice(extracted, null)

      expect(result.providerId).toBe('prov-001')
      expect(result.matchMethod).toBe('ABN_EXACT')
      expect(result.matchConfidence).toBe(1.0)
      expect(result.providerMatchDetail).toContain('ABN')
      expect(mockProvider.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        })
      )
    })

    it('returns null provider when ABN is not in DB', async () => {
      const extracted = makeExtracted({ providerAbn: '99999999999' })
      // findFirst already returns null by default

      const result = await autoMatchInvoice(extracted, null)

      expect(result.providerId).toBeNull()
      expect(result.matchMethod).toBe('NONE')
      expect(result.matchConfidence).toBe(0.0)
    })

    it('matches participant by NDIS number (NDIS_NUMBER)', async () => {
      const extracted = makeExtracted({ participantNdisNumber: '430111222' })
      mockParticipant.findFirst.mockResolvedValue(
        { id: 'part-001', firstName: 'Michael', lastName: 'Thompson' } as never
      )

      const result = await autoMatchInvoice(extracted, null)

      expect(result.participantId).toBe('part-001')
      expect(result.participantMatchDetail).toContain('430111222')
      expect(mockParticipant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, ndisNumber: '430111222' },
        })
      )
    })

    it('returns null participant when NDIS number not in DB', async () => {
      const extracted = makeExtracted({ participantNdisNumber: '999999999' })

      const result = await autoMatchInvoice(extracted, null)

      expect(result.participantId).toBeNull()
    })

    it('matches provider by email exact match (EMAIL_EXACT)', async () => {
      const extracted = makeExtracted()
      mockProviderEmail.findFirst.mockResolvedValue(
        { provider: { id: 'prov-002', name: 'Metro Transport', deletedAt: null } } as never
      )

      const result = await autoMatchInvoice(extracted, 'billing@metrotransport.com.au')

      expect(result.providerId).toBe('prov-002')
      expect(result.matchMethod).toBe('EMAIL_EXACT')
      expect(result.matchConfidence).toBe(1.0)
      expect(mockProviderEmail.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'billing@metrotransport.com.au' },
        })
      )
    })

    it('does not match via email when the linked provider is soft-deleted', async () => {
      const extracted = makeExtracted()
      mockProviderEmail.findFirst.mockResolvedValue(
        { provider: { id: 'prov-deleted', name: 'Old Provider', deletedAt: new Date() } } as never
      )

      const result = await autoMatchInvoice(extracted, 'billing@oldprovider.com')

      expect(result.providerId).toBeNull()
    })

    it('ABN match takes priority — email lookup is skipped once provider is found', async () => {
      const extracted = makeExtracted({ providerAbn: '11111111111' })
      mockProvider.findFirst.mockResolvedValue(
        { id: 'prov-abn', name: 'ABN Provider' } as never
      )

      const result = await autoMatchInvoice(extracted, 'billing@email-provider.com')

      expect(result.providerId).toBe('prov-abn')
      expect(result.matchMethod).toBe('ABN_EXACT')
      // Email lookup should not have been called (short-circuit after ABN match)
      expect(mockProviderEmail.findFirst).not.toHaveBeenCalled()
    })
  })

  // ── TIER 2 ────────────────────────────────────────────────────────────────

  describe('TIER 2 — heuristic', () => {
    it('matches provider by email domain when exactly one provider uses that domain (EMAIL_DOMAIN)', async () => {
      const extracted = makeExtracted()
      // findMany (domain search) returns one provider
      mockProviderEmail.findMany.mockResolvedValue([{ providerId: 'prov-003' }] as never)
      mockProvider.findFirst.mockResolvedValue(
        { id: 'prov-003', name: 'Sunrise Support' } as never
      )

      const result = await autoMatchInvoice(extracted, 'admin@sunrisesupport.com.au')

      expect(result.providerId).toBe('prov-003')
      expect(result.matchMethod).toBe('EMAIL_DOMAIN')
      expect(result.matchConfidence).toBe(0.7)
      expect(result.providerMatchDetail).toContain('@sunrisesupport.com.au')
    })

    it('does not match by domain when multiple providers share the same domain', async () => {
      const extracted = makeExtracted()
      mockProviderEmail.findMany.mockResolvedValue([
        { providerId: 'prov-A' },
        { providerId: 'prov-B' },
      ] as never)

      const result = await autoMatchInvoice(extracted, 'contact@shared.com.au')

      expect(result.providerId).toBeNull()
    })

    it('matches provider historically when 3+ past invoices share the same sender (HISTORICAL)', async () => {
      const extracted = makeExtracted()
      const historical = Array.from({ length: 4 }, () => ({
        providerId: 'prov-hist',
        participantId: null,
      }))
      mockInvoice.findMany.mockResolvedValue(historical as never)
      mockProvider.findFirst.mockResolvedValue(
        { id: 'prov-hist', name: 'Recurring Provider' } as never
      )

      const result = await autoMatchInvoice(extracted, 'invoices@recurring.com.au')

      expect(result.providerId).toBe('prov-hist')
      expect(result.matchMethod).toBe('HISTORICAL')
      expect(result.matchConfidence).toBe(0.8)
      expect(result.providerMatchDetail).toContain('4 invoices')
    })

    it('does not match historically when fewer than 3 past invoices exist', async () => {
      const extracted = makeExtracted()
      mockInvoice.findMany.mockResolvedValue([
        { providerId: 'prov-hist', participantId: null },
        { providerId: 'prov-hist', participantId: null },
      ] as never)

      const result = await autoMatchInvoice(extracted, 'invoices@new-provider.com')

      expect(result.providerId).toBeNull()
    })

    it('matches participant historically when 3+ past invoices share same participant', async () => {
      const extracted = makeExtracted()
      const historical = Array.from({ length: 3 }, () => ({
        providerId: null,
        participantId: 'part-hist',
      }))
      mockInvoice.findMany.mockResolvedValue(historical as never)
      mockParticipant.findFirst.mockResolvedValue(
        { id: 'part-hist', firstName: 'Jessica', lastName: 'Nguyen' } as never
      )

      const result = await autoMatchInvoice(extracted, 'invoices@provider.com')

      expect(result.participantId).toBe('part-hist')
      expect(result.participantMatchDetail).toContain('Jessica Nguyen')
    })
  })

  // ── TIER 3 ────────────────────────────────────────────────────────────────

  describe('TIER 3 — no match', () => {
    it('returns all-null result when nothing matches', async () => {
      const result = await autoMatchInvoice(makeExtracted(), null)

      expect(result.providerId).toBeNull()
      expect(result.participantId).toBeNull()
      expect(result.matchConfidence).toBe(0.0)
      expect(result.matchMethod).toBe('NONE')
    })

    it('skips email-based matching when sourceEmail is null', async () => {
      await autoMatchInvoice(makeExtracted(), null)

      expect(mockProviderEmail.findFirst).not.toHaveBeenCalled()
      expect(mockInvoice.findMany).not.toHaveBeenCalled()
    })
  })

  // ── Combined ──────────────────────────────────────────────────────────────

  describe('combined matches', () => {
    it('returns provider by ABN AND participant by NDIS in the same call', async () => {
      const extracted = makeExtracted({
        providerAbn: '11111111111',
        participantNdisNumber: '430111222',
      })
      mockProvider.findFirst.mockResolvedValue(
        { id: 'prov-001', name: 'Blue Mountains Allied Health' } as never
      )
      mockParticipant.findFirst.mockResolvedValue(
        { id: 'part-001', firstName: 'Michael', lastName: 'Thompson' } as never
      )

      const result = await autoMatchInvoice(extracted, null)

      expect(result.providerId).toBe('prov-001')
      expect(result.participantId).toBe('part-001')
      expect(result.matchMethod).toBe('ABN_EXACT')
      expect(result.matchConfidence).toBe(1.0)
    })
  })
})

// ── recordProviderEmailMatch ───────────────────────────────────────────────────

describe('recordProviderEmailMatch', () => {
  beforeEach(clearAll)

  it('creates a new unverified CrmProviderEmail record on first call', async () => {
    // No existing record
    mockProviderEmail.findFirst.mockResolvedValue(null)
    mockProviderEmail.create.mockResolvedValue({} as never)

    await recordProviderEmailMatch('prov-001', 'Billing@Provider.COM')

    expect(mockProviderEmail.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'billing@provider.com', providerId: 'prov-001' },
      })
    )
    expect(mockProviderEmail.create).toHaveBeenCalledWith({
      data: { providerId: 'prov-001', email: 'billing@provider.com' },
    })
    expect(mockProviderEmail.update).not.toHaveBeenCalled()
  })

  it('sets isVerified: true on second confirmation (record exists but not yet verified)', async () => {
    mockProviderEmail.findFirst.mockResolvedValue(
      { id: 'pe-001', isVerified: false } as never
    )
    mockProviderEmail.update.mockResolvedValue({} as never)

    await recordProviderEmailMatch('prov-001', 'billing@provider.com')

    expect(mockProviderEmail.create).not.toHaveBeenCalled()
    expect(mockProviderEmail.update).toHaveBeenCalledWith({
      where: { id: 'pe-001' },
      data: { isVerified: true },
    })
  })

  it('is a no-op when the record is already verified', async () => {
    mockProviderEmail.findFirst.mockResolvedValue(
      { id: 'pe-001', isVerified: true } as never
    )

    await recordProviderEmailMatch('prov-001', 'billing@provider.com')

    expect(mockProviderEmail.create).not.toHaveBeenCalled()
    expect(mockProviderEmail.update).not.toHaveBeenCalled()
  })

  it('normalizes email to lowercase before storing or querying', async () => {
    mockProviderEmail.findFirst.mockResolvedValue(null)
    mockProviderEmail.create.mockResolvedValue({} as never)

    await recordProviderEmailMatch('prov-001', 'ACCOUNTS@PROVIDER.COM.AU')

    expect(mockProviderEmail.create).toHaveBeenCalledWith({
      data: { providerId: 'prov-001', email: 'accounts@provider.com.au' },
    })
  })
})
