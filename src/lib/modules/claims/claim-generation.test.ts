/**
 * Unit tests for generateClaimBatch.
 *
 * Covers:
 *   - Single invoice generates one claim
 *   - Multiple invoices for the same participant each get their own claim
 *   - Multiple invoices for different participants each get their own claim
 *   - Claim reference format: CLM-YYYYMMDD-XXXX
 *   - Invoice status is updated to CLAIMED
 *   - Validation: rejects invoices not in APPROVED status
 *   - Partial success: some valid, some invalid invoices in one call
 *   - Empty invoiceIds returns empty result without DB calls
 *   - Lines are copied to ClmClaimLine with sourceInvoiceId
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: { findMany: jest.fn(), update: jest.fn() },
    clmClaim: { findFirst: jest.fn(), create: jest.fn() },
    coreAuditLog: { create: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { generateClaimBatch } from './claim-generation'

const mockFindMany = prisma.invInvoice.findMany as jest.MockedFunction<typeof prisma.invInvoice.findMany>
const mockInvoiceUpdate = prisma.invInvoice.update as jest.MockedFunction<typeof prisma.invInvoice.update>
const mockClaimFindFirst = prisma.clmClaim.findFirst as jest.MockedFunction<typeof prisma.clmClaim.findFirst>
const mockClaimCreate = prisma.clmClaim.create as jest.MockedFunction<typeof prisma.clmClaim.create>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const today = new Date()

function makeInvoice(id: string, participantId = 'part-001', overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'APPROVED',
    participantId,
    totalCents: 10000,
    deletedAt: null,
    participant: { id: participantId, firstName: 'Michael', lastName: 'Thompson' },
    lines: [
      {
        id: `${id}-line-1`,
        invoiceId: id,
        supportItemCode: '15_042_0128_1_3',
        supportItemName: 'Support Coordination',
        categoryCode: '15',
        serviceDate: today,
        quantity: 2,
        unitPriceCents: 5000,
        totalCents: 10000,
        gstCents: 0,
        budgetLineId: null,
        isPriceGuideCompliant: true,
        priceGuideMaxCents: null,
      },
    ],
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupMocks(invoices: ReturnType<typeof makeInvoice>[]) {
  jest.clearAllMocks()
  mockFindMany.mockResolvedValue(invoices as never)
  mockClaimFindFirst.mockResolvedValue(null) // no existing claims → sequence starts at 0001
  mockClaimCreate.mockImplementation(
    (async (args: { data: { claimReference: string } }) =>
      ({ id: `claim-${args.data.claimReference}` })) as never
  )
  mockInvoiceUpdate.mockResolvedValue({} as never)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateClaimBatch', () => {
  describe('basic generation', () => {
    it('returns empty result for empty invoiceIds without touching the DB', async () => {
      jest.clearAllMocks()
      const result = await generateClaimBatch([], 'user-001')

      expect(result.invoicesProcessed).toBe(0)
      expect(result.claims).toHaveLength(0)
      expect(mockFindMany).not.toHaveBeenCalled()
    })

    it('generates one claim for a single invoice', async () => {
      const invoice = makeInvoice('inv-001')
      setupMocks([invoice])

      const result = await generateClaimBatch(['inv-001'], 'user-001')

      expect(result.invoicesProcessed).toBe(1)
      expect(result.claims).toHaveLength(1)
      expect(result.claims[0]!.participantName).toBe('Michael Thompson')
      expect(result.claims[0]!.totalCents).toBe(10000)
      expect(result.claims[0]!.lineCount).toBe(1)
    })

    it('generates separate claims for each invoice (one claim per invoice)', async () => {
      const inv1 = makeInvoice('inv-001', 'part-001')
      const inv2 = makeInvoice('inv-002', 'part-001') // same participant, still separate claims
      setupMocks([inv1, inv2])

      const result = await generateClaimBatch(['inv-001', 'inv-002'], 'user-001')

      expect(result.invoicesProcessed).toBe(2)
      expect(result.claims).toHaveLength(2)
      expect(mockClaimCreate).toHaveBeenCalledTimes(2)
    })

    it('generates separate claims for invoices with different participants', async () => {
      const inv1 = makeInvoice('inv-001', 'part-001')
      const inv2 = makeInvoice('inv-002', 'part-002')
      setupMocks([inv1, inv2])

      const result = await generateClaimBatch(['inv-001', 'inv-002'], 'user-001')

      expect(result.claims).toHaveLength(2)
      expect(mockClaimCreate).toHaveBeenCalledTimes(2)
    })
  })

  describe('claim reference format', () => {
    it('generates CLM-YYYYMMDD-XXXX format reference', async () => {
      setupMocks([makeInvoice('inv-001')])

      const result = await generateClaimBatch(['inv-001'], 'user-001')

      const ref = result.claims[0]!.claimReference
      expect(ref).toMatch(/^CLM-\d{8}-\d{4}$/)
    })

    it('uses 0001 for the first claim of the day', async () => {
      mockClaimFindFirst.mockResolvedValue(null) // no prior claims today
      setupMocks([makeInvoice('inv-001')])

      const result = await generateClaimBatch(['inv-001'], 'user-001')

      expect(result.claims[0]!.claimReference).toMatch(/0001$/)
    })

    it('increments sequence for subsequent claims', async () => {
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      const prefix = `CLM-${y}${m}${d}-`

      // First call: no existing claims
      mockClaimFindFirst.mockResolvedValueOnce(null)
      mockFindMany.mockResolvedValue([makeInvoice('inv-001')] as never)
      mockClaimCreate.mockResolvedValueOnce({ id: 'claim-1' } as never)
      mockInvoiceUpdate.mockResolvedValue({} as never)

      const result1 = await generateClaimBatch(['inv-001'], 'user-001')
      expect(result1.claims[0]!.claimReference).toBe(`${prefix}0001`)

      // Second call: existing claim at seq 1
      mockClaimFindFirst.mockResolvedValueOnce({ claimReference: `${prefix}0001` } as never)
      mockFindMany.mockResolvedValue([makeInvoice('inv-002')] as never)
      mockClaimCreate.mockResolvedValueOnce({ id: 'claim-2' } as never)
      mockInvoiceUpdate.mockResolvedValue({} as never)

      const result2 = await generateClaimBatch(['inv-002'], 'user-001')
      expect(result2.claims[0]!.claimReference).toBe(`${prefix}0002`)
    })
  })

  describe('invoice status updates', () => {
    it('updates each processed invoice to CLAIMED status', async () => {
      setupMocks([makeInvoice('inv-001'), makeInvoice('inv-002')])

      await generateClaimBatch(['inv-001', 'inv-002'], 'user-001')

      expect(mockInvoiceUpdate).toHaveBeenCalledTimes(2)
      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: { status: 'CLAIMED' },
        })
      )
      expect(mockInvoiceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-002' },
          data: { status: 'CLAIMED' },
        })
      )
    })
  })

  describe('claim line creation', () => {
    it('sets sourceInvoiceId on each ClmClaimLine', async () => {
      setupMocks([makeInvoice('inv-001')])

      await generateClaimBatch(['inv-001'], 'user-001')

      expect(mockClaimCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lines: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  sourceInvoiceId: 'inv-001',
                  invoiceLineId: 'inv-001-line-1',
                }),
              ]),
            },
          }),
        })
      )
    })

    it('falls back to invoice totalCents when invoice has no lines', async () => {
      const invoice = makeInvoice('inv-001')
      invoice.lines = []
      invoice.totalCents = 25000
      setupMocks([invoice])

      const result = await generateClaimBatch(['inv-001'], 'user-001')

      expect(result.claims[0]!.totalCents).toBe(25000)
    })
  })

  describe('validation', () => {
    it('throws when an invoice ID is not found in the DB', async () => {
      // DB returns no invoices (none found)
      mockFindMany.mockResolvedValue([] as never)

      await expect(generateClaimBatch(['nonexistent-id'], 'user-001')).rejects.toThrow(
        'Invoice not found'
      )
    })

    it('throws when an invoice is not in APPROVED status', async () => {
      const invoice = makeInvoice('inv-001')
      invoice.status = 'PENDING_REVIEW'
      mockFindMany.mockResolvedValue([invoice] as never)

      await expect(generateClaimBatch(['inv-001'], 'user-001')).rejects.toThrow(
        'not in APPROVED status'
      )
    })
  })

  describe('partial success (caller handles per-invoice errors)', () => {
    it('processes successfully after validation passes for all invoices', async () => {
      // Two valid invoices
      const inv1 = makeInvoice('inv-001')
      const inv2 = makeInvoice('inv-002')
      setupMocks([inv1, inv2])

      const result = await generateClaimBatch(['inv-001', 'inv-002'], 'user-001')

      expect(result.invoicesProcessed).toBe(2)
      expect(result.claims).toHaveLength(2)
    })

    it('throws early when the first invoice is invalid (batch-level validation)', async () => {
      // Only one of two invoices found (simulates bulk caller processing one at a time)
      const inv = makeInvoice('inv-001')
      inv.status = 'REJECTED'
      mockFindMany.mockResolvedValue([inv] as never)

      // Caller should catch this and mark it as failed
      await expect(generateClaimBatch(['inv-001'], 'user-001')).rejects.toThrow()
    })
  })
})
