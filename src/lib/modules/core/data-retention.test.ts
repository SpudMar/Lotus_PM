/**
 * Unit tests for Data Retention module (REQ-010).
 *
 * Covers:
 *   - RETENTION_YEARS constants match REQ-010 requirements
 *   - getRetentionCutoff() returns correct dates for each category
 *   - purgeExpiredRecords() calls deleteMany with correct where clauses
 *   - Audit log purge uses `createdAt` filter (no deletedAt on CoreAuditLog)
 *   - InvInvoice purge uses `deletedAt` filter (soft-delete pattern)
 *   - DocDocument purge uses `deletedAt` filter
 *   - BnkPayment, ClmClaim, CrmCommLog use `createdAt` filter (no deletedAt)
 *   - Purge returns correct summary with totals
 *   - getEligibleCounts() uses count queries, not deletes
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    bnkPayment: { deleteMany: jest.fn(), count: jest.fn() },
    clmClaimLine: { deleteMany: jest.fn(), count: jest.fn() },
    clmClaim: { deleteMany: jest.fn(), count: jest.fn() },
    invStatusHistory: { deleteMany: jest.fn(), count: jest.fn() },
    invInvoiceLine: { deleteMany: jest.fn(), count: jest.fn() },
    invInvoice: { deleteMany: jest.fn(), count: jest.fn() },
    docDocument: { deleteMany: jest.fn(), count: jest.fn() },
    crmCommLog: { deleteMany: jest.fn(), count: jest.fn() },
    coreAuditLog: { deleteMany: jest.fn(), count: jest.fn() },
  },
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import {
  RETENTION_YEARS,
  getRetentionCutoff,
  purgeExpiredRecords,
  getEligibleCounts,
  type RetentionCategory,
} from './data-retention'

// Typed mock helpers
const mockBnkPaymentDeleteMany = prisma.bnkPayment.deleteMany as jest.MockedFunction<typeof prisma.bnkPayment.deleteMany>
const mockClmClaimLineDeleteMany = prisma.clmClaimLine.deleteMany as jest.MockedFunction<typeof prisma.clmClaimLine.deleteMany>
const mockClmClaimDeleteMany = prisma.clmClaim.deleteMany as jest.MockedFunction<typeof prisma.clmClaim.deleteMany>
const mockInvStatusHistoryDeleteMany = prisma.invStatusHistory.deleteMany as jest.MockedFunction<typeof prisma.invStatusHistory.deleteMany>
const mockInvInvoiceLineDeleteMany = prisma.invInvoiceLine.deleteMany as jest.MockedFunction<typeof prisma.invInvoiceLine.deleteMany>
const mockInvInvoiceDeleteMany = prisma.invInvoice.deleteMany as jest.MockedFunction<typeof prisma.invInvoice.deleteMany>
const mockDocDocumentDeleteMany = prisma.docDocument.deleteMany as jest.MockedFunction<typeof prisma.docDocument.deleteMany>
const mockCrmCommLogDeleteMany = prisma.crmCommLog.deleteMany as jest.MockedFunction<typeof prisma.crmCommLog.deleteMany>
const mockCoreAuditLogDeleteMany = prisma.coreAuditLog.deleteMany as jest.MockedFunction<typeof prisma.coreAuditLog.deleteMany>

const mockBnkPaymentCount = prisma.bnkPayment.count as jest.MockedFunction<typeof prisma.bnkPayment.count>
const mockClmClaimLineCount = prisma.clmClaimLine.count as jest.MockedFunction<typeof prisma.clmClaimLine.count>
const mockClmClaimCount = prisma.clmClaim.count as jest.MockedFunction<typeof prisma.clmClaim.count>
const mockInvStatusHistoryCount = prisma.invStatusHistory.count as jest.MockedFunction<typeof prisma.invStatusHistory.count>
const mockInvInvoiceLineCount = prisma.invInvoiceLine.count as jest.MockedFunction<typeof prisma.invInvoiceLine.count>
const mockInvInvoiceCount = prisma.invInvoice.count as jest.MockedFunction<typeof prisma.invInvoice.count>
const mockDocDocumentCount = prisma.docDocument.count as jest.MockedFunction<typeof prisma.docDocument.count>
const mockCrmCommLogCount = prisma.crmCommLog.count as jest.MockedFunction<typeof prisma.crmCommLog.count>
const mockCoreAuditLogCount = prisma.coreAuditLog.count as jest.MockedFunction<typeof prisma.coreAuditLog.count>

// ── Tests: RETENTION_YEARS constants ─────────────────────────────────────────

describe('RETENTION_YEARS', () => {
  it('has 7-year retention for audit logs (REQ-010: incidents)', () => {
    expect(RETENTION_YEARS.auditLogs).toBe(7)
  })

  it('has 5-year retention for invoices (REQ-010: invoices)', () => {
    expect(RETENTION_YEARS.invoices).toBe(5)
  })

  it('has 5-year retention for line items (same as invoices)', () => {
    expect(RETENTION_YEARS.lineItems).toBe(5)
  })

  it('has 5-year retention for payments (REQ-010: payments)', () => {
    expect(RETENTION_YEARS.payments).toBe(5)
  })

  it('has 5-year retention for claims (REQ-010: payments/invoices category)', () => {
    expect(RETENTION_YEARS.claims).toBe(5)
  })

  it('has 7-year retention for documents', () => {
    expect(RETENTION_YEARS.documents).toBe(7)
  })

  it('has 7-year retention for comm logs (correspondence)', () => {
    expect(RETENTION_YEARS.commLogs).toBe(7)
  })

  it('has 7-year retention for participants', () => {
    expect(RETENTION_YEARS.participants).toBe(7)
  })

  it('has 7-year retention for providers', () => {
    expect(RETENTION_YEARS.providers).toBe(7)
  })
})

// ── Tests: getRetentionCutoff ─────────────────────────────────────────────────

describe('getRetentionCutoff', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-25T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns a date 7 years ago for auditLogs', () => {
    const cutoff = getRetentionCutoff('auditLogs')
    expect(cutoff.getFullYear()).toBe(2019)
    expect(cutoff.getMonth()).toBe(1) // February (0-indexed)
    expect(cutoff.getDate()).toBe(25)
  })

  it('returns a date 5 years ago for invoices', () => {
    const cutoff = getRetentionCutoff('invoices')
    expect(cutoff.getFullYear()).toBe(2021)
    expect(cutoff.getMonth()).toBe(1) // February (0-indexed)
    expect(cutoff.getDate()).toBe(25)
  })

  it('returns a date 5 years ago for payments', () => {
    const cutoff = getRetentionCutoff('payments')
    expect(cutoff.getFullYear()).toBe(2021)
  })

  it('returns a date 5 years ago for claims', () => {
    const cutoff = getRetentionCutoff('claims')
    expect(cutoff.getFullYear()).toBe(2021)
  })

  it('returns a date 7 years ago for documents', () => {
    const cutoff = getRetentionCutoff('documents')
    expect(cutoff.getFullYear()).toBe(2019)
  })

  it('returns a date 7 years ago for commLogs', () => {
    const cutoff = getRetentionCutoff('commLogs')
    expect(cutoff.getFullYear()).toBe(2019)
  })

  it('returns a Date instance', () => {
    const cutoff = getRetentionCutoff('invoices')
    expect(cutoff).toBeInstanceOf(Date)
  })

  it('returns correct cutoff for every category', () => {
    const categories: RetentionCategory[] = [
      'auditLogs', 'invoices', 'lineItems', 'payments', 'claims',
      'documents', 'commLogs', 'participants', 'providers',
    ]
    categories.forEach((category) => {
      const cutoff = getRetentionCutoff(category)
      expect(cutoff).toBeInstanceOf(Date)
      expect(cutoff.getFullYear()).toBe(2026 - RETENTION_YEARS[category])
    })
  })
})

// ── Tests: purgeExpiredRecords ────────────────────────────────────────────────

describe('purgeExpiredRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: all deletes return 0 affected rows
    mockBnkPaymentDeleteMany.mockResolvedValue({ count: 0 })
    mockClmClaimLineDeleteMany.mockResolvedValue({ count: 0 })
    mockClmClaimDeleteMany.mockResolvedValue({ count: 0 })
    mockInvStatusHistoryDeleteMany.mockResolvedValue({ count: 0 })
    mockInvInvoiceLineDeleteMany.mockResolvedValue({ count: 0 })
    mockInvInvoiceDeleteMany.mockResolvedValue({ count: 0 })
    mockDocDocumentDeleteMany.mockResolvedValue({ count: 0 })
    mockCrmCommLogDeleteMany.mockResolvedValue({ count: 0 })
    mockCoreAuditLogDeleteMany.mockResolvedValue({ count: 0 })
  })

  it('calls deleteMany on all target tables', async () => {
    await purgeExpiredRecords()

    expect(mockBnkPaymentDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockClmClaimLineDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockClmClaimDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockInvStatusHistoryDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockInvInvoiceLineDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockInvInvoiceDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockDocDocumentDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockCrmCommLogDeleteMany).toHaveBeenCalledTimes(1)
    expect(mockCoreAuditLogDeleteMany).toHaveBeenCalledTimes(1)
  })

  it('purges CoreAuditLog using createdAt filter (no deletedAt on audit log)', async () => {
    await purgeExpiredRecords()

    const call = mockCoreAuditLogDeleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date }; deletedAt?: unknown } }
    expect(call.where).toHaveProperty('createdAt')
    expect(call.where).not.toHaveProperty('deletedAt')
    expect(call.where.createdAt).toHaveProperty('lt')
    expect(call.where.createdAt.lt).toBeInstanceOf(Date)
  })

  it('purges InvInvoice using deletedAt filter (soft-delete pattern)', async () => {
    await purgeExpiredRecords()

    const call = mockInvInvoiceDeleteMany.mock.calls[0]![0] as {
      where: { deletedAt: { not: null; lt: Date } }
    }
    expect(call.where).toHaveProperty('deletedAt')
    expect(call.where.deletedAt).toHaveProperty('not', null)
    expect(call.where.deletedAt).toHaveProperty('lt')
    expect(call.where.deletedAt.lt).toBeInstanceOf(Date)
  })

  it('purges DocDocument using deletedAt filter (soft-delete pattern)', async () => {
    await purgeExpiredRecords()

    const call = mockDocDocumentDeleteMany.mock.calls[0]![0] as {
      where: { deletedAt: { not: null; lt: Date } }
    }
    expect(call.where).toHaveProperty('deletedAt')
    expect(call.where.deletedAt).toHaveProperty('not', null)
    expect(call.where.deletedAt.lt).toBeInstanceOf(Date)
  })

  it('purges BnkPayment using createdAt filter (no deletedAt on payments)', async () => {
    await purgeExpiredRecords()

    const call = mockBnkPaymentDeleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date }; deletedAt?: unknown } }
    expect(call.where).toHaveProperty('createdAt')
    expect(call.where).not.toHaveProperty('deletedAt')
    expect(call.where.createdAt.lt).toBeInstanceOf(Date)
  })

  it('purges ClmClaim using createdAt filter (no deletedAt on claims)', async () => {
    await purgeExpiredRecords()

    const call = mockClmClaimDeleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date }; deletedAt?: unknown } }
    expect(call.where).toHaveProperty('createdAt')
    expect(call.where).not.toHaveProperty('deletedAt')
    expect(call.where.createdAt.lt).toBeInstanceOf(Date)
  })

  it('purges CrmCommLog using createdAt filter (no deletedAt on comm logs)', async () => {
    await purgeExpiredRecords()

    const call = mockCrmCommLogDeleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date }; deletedAt?: unknown } }
    expect(call.where).toHaveProperty('createdAt')
    expect(call.where).not.toHaveProperty('deletedAt')
    expect(call.where.createdAt.lt).toBeInstanceOf(Date)
  })

  it('uses 5-year cutoff for invoices (not 7-year)', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-25T00:00:00.000Z'))

    // Invoice cutoff should be 2021, not 2019
    const invoiceCutoff = getRetentionCutoff('invoices')
    const auditCutoff = getRetentionCutoff('auditLogs')

    expect(invoiceCutoff.getFullYear()).toBe(2021)
    expect(auditCutoff.getFullYear()).toBe(2019)
    expect(invoiceCutoff > auditCutoff).toBe(true) // 5-year cutoff is more recent than 7-year

    jest.useRealTimers()
  })

  it('uses 5-year cutoff for payments (not 7-year)', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-02-25T00:00:00.000Z'))

    const paymentCutoff = getRetentionCutoff('payments')
    expect(paymentCutoff.getFullYear()).toBe(2021)

    jest.useRealTimers()
  })

  it('returns a summary with counts per table', async () => {
    mockBnkPaymentDeleteMany.mockResolvedValue({ count: 3 })
    mockClmClaimLineDeleteMany.mockResolvedValue({ count: 5 })
    mockClmClaimDeleteMany.mockResolvedValue({ count: 2 })
    mockInvStatusHistoryDeleteMany.mockResolvedValue({ count: 10 })
    mockInvInvoiceLineDeleteMany.mockResolvedValue({ count: 8 })
    mockInvInvoiceDeleteMany.mockResolvedValue({ count: 4 })
    mockDocDocumentDeleteMany.mockResolvedValue({ count: 1 })
    mockCrmCommLogDeleteMany.mockResolvedValue({ count: 6 })
    mockCoreAuditLogDeleteMany.mockResolvedValue({ count: 100 })

    const summary = await purgeExpiredRecords()

    expect(summary.bnkPayment).toBe(3)
    expect(summary.clmClaimLine).toBe(5)
    expect(summary.clmClaim).toBe(2)
    expect(summary.invStatusHistory).toBe(10)
    expect(summary.invInvoiceLine).toBe(8)
    expect(summary.invInvoice).toBe(4)
    expect(summary.docDocument).toBe(1)
    expect(summary.crmCommLog).toBe(6)
    expect(summary.coreAuditLog).toBe(100)
  })

  it('calculates correct total in the summary', async () => {
    mockBnkPaymentDeleteMany.mockResolvedValue({ count: 3 })
    mockClmClaimLineDeleteMany.mockResolvedValue({ count: 5 })
    mockClmClaimDeleteMany.mockResolvedValue({ count: 2 })
    mockInvStatusHistoryDeleteMany.mockResolvedValue({ count: 10 })
    mockInvInvoiceLineDeleteMany.mockResolvedValue({ count: 8 })
    mockInvInvoiceDeleteMany.mockResolvedValue({ count: 4 })
    mockDocDocumentDeleteMany.mockResolvedValue({ count: 1 })
    mockCrmCommLogDeleteMany.mockResolvedValue({ count: 6 })
    mockCoreAuditLogDeleteMany.mockResolvedValue({ count: 100 })

    const summary = await purgeExpiredRecords()

    expect(summary.total).toBe(3 + 5 + 2 + 10 + 8 + 4 + 1 + 6 + 100)
    expect(summary.total).toBe(139)
  })

  it('returns zero total when nothing is eligible', async () => {
    const summary = await purgeExpiredRecords()
    expect(summary.total).toBe(0)
  })

  it('is idempotent — second run returns zero if first run cleared everything', async () => {
    // First run returns counts
    mockBnkPaymentDeleteMany.mockResolvedValueOnce({ count: 5 })
    mockCoreAuditLogDeleteMany.mockResolvedValueOnce({ count: 10 })

    const first = await purgeExpiredRecords()
    expect(first.bnkPayment).toBe(5)
    expect(first.coreAuditLog).toBe(10)

    // Second run returns zero (nothing left to purge)
    const second = await purgeExpiredRecords()
    expect(second.bnkPayment).toBe(0)
    expect(second.coreAuditLog).toBe(0)
    expect(second.total).toBe(0)
  })
})

// ── Tests: getEligibleCounts ──────────────────────────────────────────────────

describe('getEligibleCounts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBnkPaymentCount.mockResolvedValue(0)
    mockClmClaimLineCount.mockResolvedValue(0)
    mockClmClaimCount.mockResolvedValue(0)
    mockInvStatusHistoryCount.mockResolvedValue(0)
    mockInvInvoiceLineCount.mockResolvedValue(0)
    mockInvInvoiceCount.mockResolvedValue(0)
    mockDocDocumentCount.mockResolvedValue(0)
    mockCrmCommLogCount.mockResolvedValue(0)
    mockCoreAuditLogCount.mockResolvedValue(0)
  })

  it('uses count (not deleteMany) — dry run only', async () => {
    await getEligibleCounts()

    expect(mockBnkPaymentCount).toHaveBeenCalled()
    expect(mockBnkPaymentDeleteMany).not.toHaveBeenCalled()
    expect(mockInvInvoiceCount).toHaveBeenCalled()
    expect(mockInvInvoiceDeleteMany).not.toHaveBeenCalled()
    expect(mockCoreAuditLogCount).toHaveBeenCalled()
    expect(mockCoreAuditLogDeleteMany).not.toHaveBeenCalled()
  })

  it('returns counts for all tables', async () => {
    mockBnkPaymentCount.mockResolvedValue(3)
    mockClmClaimLineCount.mockResolvedValue(7)
    mockClmClaimCount.mockResolvedValue(2)
    mockInvStatusHistoryCount.mockResolvedValue(15)
    mockInvInvoiceLineCount.mockResolvedValue(9)
    mockInvInvoiceCount.mockResolvedValue(4)
    mockDocDocumentCount.mockResolvedValue(1)
    mockCrmCommLogCount.mockResolvedValue(6)
    mockCoreAuditLogCount.mockResolvedValue(50)

    const counts = await getEligibleCounts()

    expect(counts.bnkPayment).toBe(3)
    expect(counts.clmClaimLine).toBe(7)
    expect(counts.clmClaim).toBe(2)
    expect(counts.invStatusHistory).toBe(15)
    expect(counts.invInvoiceLine).toBe(9)
    expect(counts.invInvoice).toBe(4)
    expect(counts.docDocument).toBe(1)
    expect(counts.crmCommLog).toBe(6)
    expect(counts.coreAuditLog).toBe(50)
  })

  it('returns zeros when no records are eligible', async () => {
    const counts = await getEligibleCounts()

    expect(counts.bnkPayment).toBe(0)
    expect(counts.invInvoice).toBe(0)
    expect(counts.coreAuditLog).toBe(0)
  })
})
