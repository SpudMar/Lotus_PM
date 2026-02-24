jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/invoices/invoice-validation', () => ({
  validateInvoiceForApproval: jest.fn().mockResolvedValue({ errors: [], warnings: [] }),
}))

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { replacePdf } from './invoices'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>

const USER_ID = 'user_test_123456789012'
const INVOICE_ID = 'inv_test_123456789012'

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    s3Key: 'invoices/2026/01/old-file.pdf',
    s3Bucket: 'lotus-pm-invoices',
    processingCategory: 'AUTO_APPROVED',
    ...overrides,
  }
}

beforeEach(() => { jest.clearAllMocks() })

describe('replacePdf', () => {
  test('updates s3Key, s3Bucket, and resets processingCategory', async () => {
    const invoice = makeInvoice()
    const updated = { ...invoice, s3Key: 'invoices/2026/02/new-file.pdf', s3Bucket: 'new-bucket', processingCategory: null }
    ;(mockPrisma.invInvoice.findFirst as jest.Mock).mockResolvedValue(invoice)
    ;(mockPrisma.invInvoice.update as jest.Mock).mockResolvedValue(updated)

    const result = await replacePdf(INVOICE_ID, 'invoices/2026/02/new-file.pdf', 'new-bucket', USER_ID)

    expect(mockPrisma.invInvoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: { s3Key: 'invoices/2026/02/new-file.pdf', s3Bucket: 'new-bucket', processingCategory: null },
    })
    expect(result.processingCategory).toBeNull()
  })

  test('creates audit log with old and new s3Key', async () => {
    const invoice = makeInvoice()
    ;(mockPrisma.invInvoice.findFirst as jest.Mock).mockResolvedValue(invoice)
    ;(mockPrisma.invInvoice.update as jest.Mock).mockResolvedValue({ ...invoice, s3Key: 'invoices/2026/02/new-file.pdf', s3Bucket: 'new-bucket', processingCategory: null })

    await replacePdf(INVOICE_ID, 'invoices/2026/02/new-file.pdf', 'new-bucket', USER_ID)

    expect(mockCreateAuditLog).toHaveBeenCalledWith({
      userId: USER_ID, action: 'invoice.pdf_replaced', resource: 'invoice', resourceId: INVOICE_ID,
      before: { s3Key: 'invoices/2026/01/old-file.pdf', s3Bucket: 'lotus-pm-invoices' },
      after: { s3Key: 'invoices/2026/02/new-file.pdf', s3Bucket: 'new-bucket' },
    })
  })

  test('throws NOT_FOUND when invoice does not exist', async () => {
    ;(mockPrisma.invInvoice.findFirst as jest.Mock).mockResolvedValue(null)
    await expect(replacePdf('nonexistent', 'key', 'bucket', USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  test('throws NOT_FOUND for soft-deleted invoice', async () => {
    ;(mockPrisma.invInvoice.findFirst as jest.Mock).mockResolvedValue(null)
    await expect(replacePdf(INVOICE_ID, 'key', 'bucket', USER_ID)).rejects.toThrow('NOT_FOUND')
    expect(mockPrisma.invInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: INVOICE_ID, deletedAt: null },
      select: { id: true, s3Key: true, s3Bucket: true },
    })
  })
})
