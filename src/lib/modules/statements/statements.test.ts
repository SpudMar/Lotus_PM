/**
 * Unit tests for Statement Module.
 *
 * Covers:
 *   - statement-generation.ts: listStatements, getStatementById, softDeleteStatement,
 *     generateStatement, bulkGenerateStatements
 *   - statement-send.ts: sendStatementEmail, sendStatementSms, sendStatement,
 *     getStatementDownloadUrl, getMailList
 *   - statement-verify.ts: createVerificationToken, verifyToken, verifyDob,
 *     resetVerificationAttempts
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    participantStatement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    crmParticipant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    invInvoice: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/notifications/email-send', () => ({
  sendRawEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/notifications/notifications', () => ({
  sendSms: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('@/lib/modules/documents/storage', () => ({
  generateDownloadUrl: jest
    .fn()
    .mockResolvedValue({ downloadUrl: 'https://s3.example.com/test' }),
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import {
  listStatements,
  getStatementById,
  softDeleteStatement,
  generateStatement,
  bulkGenerateStatements,
} from './statement-generation'
import {
  sendStatementEmail,
  sendStatementSms,
  sendStatement,
  getStatementDownloadUrl,
  getMailList,
} from './statement-send'
import {
  createVerificationToken,
  verifyToken,
  verifyDob,
  resetVerificationAttempts,
} from './statement-verify'
import { sendRawEmail } from '@/lib/modules/notifications/email-send'
import { sendSms } from '@/lib/modules/notifications/notifications'
import { generateDownloadUrl } from '@/lib/modules/documents/storage'

// ── Typed Mocks ───────────────────────────────────────────────────────────────

const mockStatementFindMany = prisma.participantStatement.findMany as jest.MockedFunction<
  typeof prisma.participantStatement.findMany
>
const mockStatementFindFirst = prisma.participantStatement.findFirst as jest.MockedFunction<
  typeof prisma.participantStatement.findFirst
>
const mockStatementCount = prisma.participantStatement.count as jest.MockedFunction<
  typeof prisma.participantStatement.count
>
const mockStatementCreate = prisma.participantStatement.create as jest.MockedFunction<
  typeof prisma.participantStatement.create
>
const mockStatementUpdate = prisma.participantStatement.update as jest.MockedFunction<
  typeof prisma.participantStatement.update
>
const mockParticipantFindUnique = prisma.crmParticipant.findUnique as jest.MockedFunction<
  typeof prisma.crmParticipant.findUnique
>
const mockParticipantFindMany = prisma.crmParticipant.findMany as jest.MockedFunction<
  typeof prisma.crmParticipant.findMany
>
const mockInvoiceFindMany = prisma.invInvoice.findMany as jest.MockedFunction<
  typeof prisma.invInvoice.findMany
>
const mockInvoiceAggregate = prisma.invInvoice.aggregate as jest.MockedFunction<
  typeof prisma.invInvoice.aggregate
>
const mockSendRawEmail = sendRawEmail as jest.MockedFunction<typeof sendRawEmail>
const mockSendSms = sendSms as jest.MockedFunction<typeof sendSms>
const mockGenerateDownloadUrl = generateDownloadUrl as jest.MockedFunction<
  typeof generateDownloadUrl
>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PERIOD_START = new Date('2026-01-01T00:00:00.000Z')
const PERIOD_END = new Date('2026-01-31T23:59:59.999Z')

function makeStatement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stmt-001',
    participantId: 'part-001',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    generatedAt: new Date('2026-02-01T00:00:00.000Z'),
    sentAt: null,
    deliveryMethod: 'EMAIL',
    s3Key: null,
    totalInvoicedCents: 150000,
    totalClaimedCents: 120000,
    totalPaidCents: 100000,
    budgetRemainingCents: 50000,
    lineItems: [],
    createdById: 'user-001',
    deletedAt: null,
    participant: {
      id: 'part-001',
      firstName: 'Jane',
      lastName: 'Smith',
      ndisNumber: '430000001',
      email: 'jane@example.com',
      statementEmail: null,
      phone: '0412345678',
      statementPhone: null,
      dateOfBirth: new Date('1990-06-15T00:00:00.000Z'),
      address: '123 Main St',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
    },
    ...overrides,
  }
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date('2026-01-15T00:00:00.000Z'),
    totalCents: 50000,
    status: 'APPROVED',
    deletedAt: null,
    provider: { name: 'Care Provider Pty Ltd' },
    claims: [
      {
        status: 'APPROVED',
        payments: [{ amountCents: 50000, status: 'CLEARED' }],
      },
    ],
    ...overrides,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests: statement-generation.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('statement-generation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── listStatements ────────────────────────────────────────────────────────

  describe('listStatements', () => {
    it('returns paginated results with total count', async () => {
      const stmt = makeStatement()
      mockStatementFindMany.mockResolvedValue([stmt] as never)
      mockStatementCount.mockResolvedValue(1 as never)

      const result = await listStatements({ page: 1, pageSize: 10 })

      expect(result.data).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.data[0]!.id).toBe('stmt-001')
      expect(result.data[0]!.totalInvoicedCents).toBe(150000)
    })

    it('filters by participantId when provided', async () => {
      mockStatementFindMany.mockResolvedValue([] as never)
      mockStatementCount.mockResolvedValue(0 as never)

      await listStatements({
        participantId: 'part-001',
        page: 1,
        pageSize: 10,
      })

      expect(mockStatementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            participantId: 'part-001',
            deletedAt: null,
          }),
        })
      )
    })

    it('filters by deliveryMethod when provided', async () => {
      mockStatementFindMany.mockResolvedValue([] as never)
      mockStatementCount.mockResolvedValue(0 as never)

      await listStatements({
        deliveryMethod: 'SMS',
        page: 1,
        pageSize: 10,
      })

      expect(mockStatementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deliveryMethod: 'SMS',
          }),
        })
      )
    })

    it('filters for sent statements (sentAt not null)', async () => {
      mockStatementFindMany.mockResolvedValue([] as never)
      mockStatementCount.mockResolvedValue(0 as never)

      await listStatements({ sent: true, page: 1, pageSize: 10 })

      expect(mockStatementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sentAt: { not: null },
          }),
        })
      )
    })

    it('filters for unsent statements (sentAt is null)', async () => {
      mockStatementFindMany.mockResolvedValue([] as never)
      mockStatementCount.mockResolvedValue(0 as never)

      await listStatements({ sent: false, page: 1, pageSize: 10 })

      expect(mockStatementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sentAt: null,
          }),
        })
      )
    })

    it('calculates correct skip for pagination', async () => {
      mockStatementFindMany.mockResolvedValue([] as never)
      mockStatementCount.mockResolvedValue(0 as never)

      await listStatements({ page: 3, pageSize: 20 })

      expect(mockStatementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        })
      )
    })
  })

  // ── getStatementById ──────────────────────────────────────────────────────

  describe('getStatementById', () => {
    it('returns statement when found and not soft-deleted', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      const result = await getStatementById('stmt-001')

      expect(result).toBeTruthy()
      expect(result!.id).toBe('stmt-001')
      expect(mockStatementFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'stmt-001', deletedAt: null },
        })
      )
    })

    it('returns null when statement not found', async () => {
      mockStatementFindFirst.mockResolvedValue(null as never)

      const result = await getStatementById('nonexistent')

      expect(result).toBeNull()
    })
  })

  // ── softDeleteStatement ───────────────────────────────────────────────────

  describe('softDeleteStatement', () => {
    it('calls update with deletedAt timestamp', async () => {
      mockStatementUpdate.mockResolvedValue({} as never)

      await softDeleteStatement('stmt-001')

      expect(mockStatementUpdate).toHaveBeenCalledWith({
        where: { id: 'stmt-001' },
        data: { deletedAt: expect.any(Date) },
      })
    })
  })

  // ── generateStatement ─────────────────────────────────────────────────────

  describe('generateStatement', () => {
    it('throws when participant is not found', async () => {
      mockParticipantFindUnique.mockResolvedValue(null as never)

      await expect(
        generateStatement('missing-id', PERIOD_START, PERIOD_END, 'user-001')
      ).rejects.toThrow('Participant not found')
    })

    it('creates statement with correct totals from invoices', async () => {
      mockParticipantFindUnique.mockResolvedValue({
        id: 'part-001',
        statementDelivery: 'EMAIL',
        plans: [
          { budgetLines: [{ allocatedCents: 500000 }] },
        ],
      } as never)

      const inv1 = makeInvoice({
        id: 'inv-001',
        invoiceNumber: 'INV-001',
        totalCents: 50000,
        claims: [
          {
            status: 'APPROVED',
            payments: [{ amountCents: 50000, status: 'CLEARED' }],
          },
        ],
      })
      const inv2 = makeInvoice({
        id: 'inv-002',
        invoiceNumber: 'INV-002',
        totalCents: 30000,
        claims: [
          {
            status: 'SUBMITTED',
            payments: [],
          },
        ],
      })
      mockInvoiceFindMany.mockResolvedValue([inv1, inv2] as never)
      mockInvoiceAggregate.mockResolvedValue({
        _sum: { totalCents: 200000 },
      } as never)

      const created = makeStatement({
        totalInvoicedCents: 80000,
        totalClaimedCents: 80000,
        totalPaidCents: 50000,
        budgetRemainingCents: 300000,
      })
      mockStatementCreate.mockResolvedValue(created as never)

      const result = await generateStatement(
        'part-001',
        PERIOD_START,
        PERIOD_END,
        'user-001'
      )

      expect(result.id).toBe('stmt-001')
      expect(mockStatementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            participantId: 'part-001',
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            deliveryMethod: 'EMAIL',
            totalInvoicedCents: 80000,
            totalClaimedCents: 80000,
            totalPaidCents: 50000,
            createdById: 'user-001',
          }),
        })
      )
    })

    it('calculates budget remaining correctly', async () => {
      mockParticipantFindUnique.mockResolvedValue({
        id: 'part-001',
        statementDelivery: 'EMAIL',
        plans: [
          {
            budgetLines: [
              { allocatedCents: 300000 },
              { allocatedCents: 200000 },
            ],
          },
        ],
      } as never)

      mockInvoiceFindMany.mockResolvedValue([] as never)
      // All-time spent = 400000
      mockInvoiceAggregate.mockResolvedValue({
        _sum: { totalCents: 400000 },
      } as never)

      mockStatementCreate.mockResolvedValue(
        makeStatement({ budgetRemainingCents: 100000 }) as never
      )

      await generateStatement('part-001', PERIOD_START, PERIOD_END, 'user-001')

      expect(mockStatementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // 500000 allocated - 400000 spent = 100000
            budgetRemainingCents: 100000,
          }),
        })
      )
    })

    it('clamps budget remaining to zero (never negative)', async () => {
      mockParticipantFindUnique.mockResolvedValue({
        id: 'part-001',
        statementDelivery: 'EMAIL',
        plans: [
          { budgetLines: [{ allocatedCents: 100000 }] },
        ],
      } as never)

      mockInvoiceFindMany.mockResolvedValue([] as never)
      // Overspent: 200000 spent against 100000 allocated
      mockInvoiceAggregate.mockResolvedValue({
        _sum: { totalCents: 200000 },
      } as never)

      mockStatementCreate.mockResolvedValue(
        makeStatement({ budgetRemainingCents: 0 }) as never
      )

      await generateStatement('part-001', PERIOD_START, PERIOD_END, 'user-001')

      expect(mockStatementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            budgetRemainingCents: 0,
          }),
        })
      )
    })

    it('sums paid amounts only from CLEARED payments', async () => {
      mockParticipantFindUnique.mockResolvedValue({
        id: 'part-001',
        statementDelivery: 'SMS',
        plans: [{ budgetLines: [{ allocatedCents: 500000 }] }],
      } as never)

      const inv = makeInvoice({
        totalCents: 80000,
        claims: [
          {
            status: 'APPROVED',
            payments: [
              { amountCents: 50000, status: 'CLEARED' },
              { amountCents: 30000, status: 'PENDING' }, // should not count
            ],
          },
        ],
      })
      mockInvoiceFindMany.mockResolvedValue([inv] as never)
      mockInvoiceAggregate.mockResolvedValue({
        _sum: { totalCents: 80000 },
      } as never)

      mockStatementCreate.mockResolvedValue(makeStatement() as never)

      await generateStatement('part-001', PERIOD_START, PERIOD_END, 'user-001')

      expect(mockStatementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPaidCents: 50000, // only CLEARED payment
          }),
        })
      )
    })
  })

  // ── bulkGenerateStatements ────────────────────────────────────────────────

  describe('bulkGenerateStatements', () => {
    it('generates for active participants and returns counts', async () => {
      mockParticipantFindMany.mockResolvedValue([
        { id: 'part-001' },
        { id: 'part-002' },
      ] as never)

      // No existing statements
      mockStatementFindFirst.mockResolvedValue(null as never)

      // generateStatement internals
      mockParticipantFindUnique.mockResolvedValue({
        id: 'part-001',
        statementDelivery: 'EMAIL',
        plans: [{ budgetLines: [{ allocatedCents: 500000 }] }],
      } as never)
      mockInvoiceFindMany.mockResolvedValue([] as never)
      mockInvoiceAggregate.mockResolvedValue({
        _sum: { totalCents: 0 },
      } as never)
      mockStatementCreate.mockResolvedValue(makeStatement() as never)

      const result = await bulkGenerateStatements(1, 2026, 'user-001')

      expect(result.generated).toBe(2)
      expect(result.skipped).toBe(0)
    })

    it('skips participants who already have a statement for the period', async () => {
      mockParticipantFindMany.mockResolvedValue([
        { id: 'part-001' },
      ] as never)

      // Existing statement found
      mockStatementFindFirst.mockResolvedValue(makeStatement() as never)

      const result = await bulkGenerateStatements(1, 2026, 'user-001')

      expect(result.generated).toBe(0)
      expect(result.skipped).toBe(1)
      expect(mockStatementCreate).not.toHaveBeenCalled()
    })

    it('counts failed generation attempts as skipped', async () => {
      mockParticipantFindMany.mockResolvedValue([
        { id: 'part-no-plan' },
      ] as never)

      // No existing statement
      mockStatementFindFirst.mockResolvedValue(null as never)

      // generateStatement will throw because participant not found
      mockParticipantFindUnique.mockResolvedValue(null as never)

      const result = await bulkGenerateStatements(1, 2026, 'user-001')

      expect(result.generated).toBe(0)
      expect(result.skipped).toBe(1)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests: statement-send.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('statement-send', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── sendStatementEmail ────────────────────────────────────────────────────

  describe('sendStatementEmail', () => {
    it('sends email with HTML attachment and updates sentAt', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      const result = await sendStatementEmail('stmt-001')

      expect(result.success).toBe(true)
      expect(mockSendRawEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
          subject: expect.stringContaining('Plan Management Statement'),
          htmlBody: expect.stringContaining('Lotus Assist'),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              contentType: 'text/html',
            }),
          ]),
          participantId: 'part-001',
        })
      )
      expect(mockStatementUpdate).toHaveBeenCalledWith({
        where: { id: 'stmt-001' },
        data: { sentAt: expect.any(Date) },
      })
    })

    it('uses statementEmail override when available', async () => {
      const stmt = makeStatement({
        participant: {
          ...makeStatement().participant,
          statementEmail: 'override@example.com',
        },
      })
      mockStatementFindFirst.mockResolvedValue(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      await sendStatementEmail('stmt-001')

      expect(mockSendRawEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'override@example.com',
        })
      )
    })

    it('returns error when participant has no email', async () => {
      const stmt = makeStatement({
        participant: {
          ...makeStatement().participant,
          email: null,
          statementEmail: null,
        },
      })
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      const result = await sendStatementEmail('stmt-001')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('Participant has no email address')
      expect(mockSendRawEmail).not.toHaveBeenCalled()
    })

    it('returns error when statement not found', async () => {
      mockStatementFindFirst.mockResolvedValue(null as never)

      const result = await sendStatementEmail('nonexistent')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('Statement not found')
    })

    it('returns error when sendRawEmail throws', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)
      mockSendRawEmail.mockRejectedValueOnce(new Error('SES rate limit'))

      const result = await sendStatementEmail('stmt-001')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('SES rate limit')
    })

    it('renders line items in HTML when present', async () => {
      const stmt = makeStatement({
        lineItems: [
          {
            date: '2026-01-15T00:00:00.000Z',
            providerName: 'Test & Co',
            invoiceNumber: 'INV-001',
            invoicedCents: 50000,
            claimStatus: 'APPROVED',
            paidCents: 50000,
          },
        ],
      })
      mockStatementFindFirst.mockResolvedValue(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      await sendStatementEmail('stmt-001')

      // HTML should contain escaped provider name and invoice number
      const htmlArg = (mockSendRawEmail.mock.calls[0]![0] as { htmlBody: string }).htmlBody
      expect(htmlArg).toContain('Test &amp; Co')
      expect(htmlArg).toContain('INV-001')
      expect(htmlArg).toContain('Invoice Details')
    })
  })

  // ── sendStatementSms ──────────────────────────────────────────────────────

  describe('sendStatementSms', () => {
    it('sends SMS with verification URL and updates sentAt', async () => {
      const stmt = makeStatement({ deliveryMethod: 'SMS' })
      mockStatementFindFirst.mockResolvedValue(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      const result = await sendStatementSms('stmt-001')

      expect(result.success).toBe(true)
      expect(mockSendSms).toHaveBeenCalledWith(
        '0412345678',
        expect.stringContaining('/api/statements/verify?sid=stmt-001'),
        expect.objectContaining({ participantId: 'part-001' })
      )
      expect(mockStatementUpdate).toHaveBeenCalledWith({
        where: { id: 'stmt-001' },
        data: { sentAt: expect.any(Date) },
      })
    })

    it('uses statementPhone override when available', async () => {
      const stmt = makeStatement({
        participant: {
          ...makeStatement().participant,
          statementPhone: '0498765432',
        },
      })
      mockStatementFindFirst.mockResolvedValue(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      await sendStatementSms('stmt-001')

      expect(mockSendSms).toHaveBeenCalledWith(
        '0498765432',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('returns error when participant has no phone', async () => {
      const stmt = makeStatement({
        participant: {
          ...makeStatement().participant,
          phone: null,
          statementPhone: null,
        },
      })
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      const result = await sendStatementSms('stmt-001')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('Participant has no phone number')
      expect(mockSendSms).not.toHaveBeenCalled()
    })

    it('returns error when statement not found', async () => {
      mockStatementFindFirst.mockResolvedValue(null as never)

      const result = await sendStatementSms('nonexistent')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('Statement not found')
    })
  })

  // ── sendStatement ─────────────────────────────────────────────────────────

  describe('sendStatement', () => {
    it('dispatches to sendStatementEmail for EMAIL method', async () => {
      // First call for sendStatement lookup, second for sendStatementEmail
      const stmt = makeStatement({ deliveryMethod: 'EMAIL' })
      mockStatementFindFirst
        .mockResolvedValueOnce({ deliveryMethod: 'EMAIL' } as never)
        .mockResolvedValueOnce(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      const result = await sendStatement('stmt-001')

      expect(result.success).toBe(true)
    })

    it('dispatches to sendStatementSms for SMS method', async () => {
      const stmt = makeStatement({ deliveryMethod: 'SMS' })
      mockStatementFindFirst
        .mockResolvedValueOnce({ deliveryMethod: 'SMS' } as never)
        .mockResolvedValueOnce(stmt as never)
      mockStatementUpdate.mockResolvedValue({} as never)

      const result = await sendStatement('stmt-001')

      expect(result.success).toBe(true)
    })

    it('returns error for MAIL delivery method', async () => {
      mockStatementFindFirst.mockResolvedValue({
        deliveryMethod: 'MAIL',
      } as never)

      const result = await sendStatement('stmt-001')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe(
        'MAIL statements must be printed manually'
      )
    })

    it('returns error when statement not found', async () => {
      mockStatementFindFirst.mockResolvedValue(null as never)

      const result = await sendStatement('nonexistent')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('Statement not found')
    })
  })

  // ── getStatementDownloadUrl ───────────────────────────────────────────────

  describe('getStatementDownloadUrl', () => {
    it('returns presigned URL when s3Key exists', async () => {
      mockStatementFindFirst.mockResolvedValue({
        s3Key: 'statements/2026-01/stmt-001.html',
      } as never)

      const url = await getStatementDownloadUrl('stmt-001')

      expect(url).toBe('https://s3.example.com/test')
      expect(mockGenerateDownloadUrl).toHaveBeenCalledWith({
        s3Key: 'statements/2026-01/stmt-001.html',
      })
    })

    it('returns null when no s3Key is set', async () => {
      mockStatementFindFirst.mockResolvedValue({ s3Key: null } as never)

      const url = await getStatementDownloadUrl('stmt-001')

      expect(url).toBeNull()
      expect(mockGenerateDownloadUrl).not.toHaveBeenCalled()
    })

    it('returns null when statement not found', async () => {
      mockStatementFindFirst.mockResolvedValue(null as never)

      const url = await getStatementDownloadUrl('nonexistent')

      expect(url).toBeNull()
    })
  })

  // ── getMailList ────────────────────────────────────────────────────────────

  describe('getMailList', () => {
    it('returns entries for MAIL delivery method for the given month', async () => {
      const stmt = makeStatement({ deliveryMethod: 'MAIL' })
      mockStatementFindMany.mockResolvedValue([stmt] as never)

      const result = await getMailList(1, 2026)

      expect(result).toHaveLength(1)
      expect(result[0]!.participantId).toBe('part-001')
      expect(result[0]!.firstName).toBe('Jane')
      expect(result[0]!.lastName).toBe('Smith')
      expect(result[0]!.address).toBe('123 Main St')
      expect(result[0]!.statementId).toBe('stmt-001')

      expect(mockStatementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deliveryMethod: 'MAIL',
            deletedAt: null,
          }),
        })
      )
    })

    it('returns empty array when no MAIL statements exist', async () => {
      mockStatementFindMany.mockResolvedValue([] as never)

      const result = await getMailList(1, 2026)

      expect(result).toHaveLength(0)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests: statement-verify.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('statement-verify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetVerificationAttempts()
  })

  // ── createVerificationToken + verifyToken ─────────────────────────────────

  describe('createVerificationToken / verifyToken', () => {
    it('round-trip: create then verify returns correct payload', () => {
      const token = createVerificationToken('stmt-001', 'part-001')

      const payload = verifyToken(token)

      expect(payload.statementId).toBe('stmt-001')
      expect(payload.participantId).toBe('part-001')
      expect(typeof payload.jti).toBe('string')
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })

    it('throws on tampered token', () => {
      const token = createVerificationToken('stmt-001', 'part-001')
      const tampered = token.slice(0, -5) + 'XXXXX'

      expect(() => verifyToken(tampered)).toThrow('Invalid token signature')
    })

    it('throws on malformed token (missing parts)', () => {
      expect(() => verifyToken('only.two')).toThrow('Invalid token format')
    })

    it('throws on expired token', () => {
      // Mock Date.now to create a token "in the past"
      const realNow = Date.now
      const pastTime = Date.now() - 8 * 24 * 3600 * 1000 // 8 days ago
      jest.spyOn(Date, 'now').mockReturnValue(pastTime)

      const token = createVerificationToken('stmt-001', 'part-001')

      // Restore Date.now so verifyToken sees the token as expired
      Date.now = realNow

      expect(() => verifyToken(token)).toThrow('Token expired')

      jest.restoreAllMocks()
    })
  })

  // ── verifyDob ─────────────────────────────────────────────────────────────

  describe('verifyDob', () => {
    it('returns downloadUrl when DOB matches', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      const result = await verifyDob('stmt-001', '1990-06-15')

      expect(result.success).toBe(true)
      expect(result.downloadUrl).toBeDefined()
      expect(result.downloadUrl).toContain('/api/statements/stmt-001/view?token=')
    })

    it('returns error with remaining attempts on wrong DOB', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      const result = await verifyDob('stmt-001', '1991-01-01')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe(
        'Date of birth does not match our records.'
      )
      expect(result.remainingAttempts).toBe(2)
    })

    it('decrements remaining attempts on successive failures', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      const r1 = await verifyDob('stmt-001', '1991-01-01')
      expect(r1.remainingAttempts).toBe(2)

      const r2 = await verifyDob('stmt-001', '1991-01-01')
      expect(r2.remainingAttempts).toBe(1)
    })

    it('locks access after 3 failed attempts', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      await verifyDob('stmt-001', '1991-01-01') // attempt 1
      await verifyDob('stmt-001', '1991-01-01') // attempt 2
      const r3 = await verifyDob('stmt-001', '1991-01-01') // attempt 3

      expect(r3.success).toBe(false)
      expect(r3.locked).toBe(true)
      expect(r3.remainingAttempts).toBe(0)
      expect(r3.errorMessage).toContain('locked for 1 hour')
    })

    it('rejects attempts while locked even with correct DOB', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      // Lock it
      await verifyDob('stmt-001', '1991-01-01')
      await verifyDob('stmt-001', '1991-01-01')
      await verifyDob('stmt-001', '1991-01-01')

      // Try correct DOB while locked
      const result = await verifyDob('stmt-001', '1990-06-15')

      expect(result.success).toBe(false)
      expect(result.locked).toBe(true)
      expect(result.errorMessage).toContain('Try again in')
    })

    it('unlocks after lock duration expires', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      // Lock it
      await verifyDob('stmt-001', '1991-01-01')
      await verifyDob('stmt-001', '1991-01-01')
      await verifyDob('stmt-001', '1991-01-01')

      // Advance time past the 1-hour lock
      const realNow = Date.now
      jest.spyOn(Date, 'now').mockReturnValue(realNow() + 61 * 60 * 1000)

      const result = await verifyDob('stmt-001', '1990-06-15')

      expect(result.success).toBe(true)
      expect(result.downloadUrl).toBeDefined()

      Date.now = realNow
      jest.restoreAllMocks()
    })

    it('returns error when statement not found', async () => {
      mockStatementFindFirst.mockResolvedValue(null as never)

      const result = await verifyDob('nonexistent', '1990-06-15')

      expect(result.success).toBe(false)
      expect(result.errorMessage).toBe('Statement not found')
    })
  })

  // ── resetVerificationAttempts ─────────────────────────────────────────────

  describe('resetVerificationAttempts', () => {
    it('clears all attempt tracking', async () => {
      const stmt = makeStatement()
      mockStatementFindFirst.mockResolvedValue(stmt as never)

      // Make some failed attempts
      await verifyDob('stmt-001', '1991-01-01')
      await verifyDob('stmt-001', '1991-01-01')

      // Reset
      resetVerificationAttempts()

      // Should be back to 3 remaining
      const result = await verifyDob('stmt-001', '1991-01-01')
      expect(result.remainingAttempts).toBe(2) // first attempt of fresh session
    })
  })
})
