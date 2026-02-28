jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('./status-history', () => ({
  recordStatusTransition: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { createNewVersion } from './invoice-versioning'

const mockFindUnique = prisma.invInvoice.findUnique as jest.MockedFunction<typeof prisma.invInvoice.findUnique>
const mockUpdate = prisma.invInvoice.update as jest.MockedFunction<typeof prisma.invInvoice.update>
const mockCreate = prisma.invInvoice.create as jest.MockedFunction<typeof prisma.invInvoice.create>

describe('createNewVersion', () => {
  beforeEach(() => jest.clearAllMocks())

  it('supersedes old invoice and creates new version', async () => {
    const oldInvoice = {
      id: 'inv-001',
      invoiceNumber: 'INV-100',
      invoiceDate: new Date('2026-02-15'),
      participantId: 'part-001',
      providerId: 'prov-001',
      planId: 'plan-001',
      subtotalCents: 5000,
      gstCents: 0,
      totalCents: 5000,
      s3Key: 'invoices/inv-001.pdf',
      s3Bucket: 'lotus-pm',
      version: 1,
      status: 'PENDING_REVIEW',
      lines: [{ supportItemCode: '01_001', quantity: 1, unitPriceCents: 5000, totalCents: 5000 }],
    }

    mockFindUnique.mockResolvedValueOnce(oldInvoice as never)
    mockUpdate
      .mockResolvedValueOnce({ ...oldInvoice, status: 'SUPERSEDED' } as never)
      .mockResolvedValueOnce({ ...oldInvoice, status: 'SUPERSEDED', supersededById: 'inv-002' } as never)
    mockCreate.mockResolvedValueOnce({ id: 'inv-002', version: 2, status: 'RECEIVED' } as never)

    const result = await createNewVersion('inv-001', 'user-001')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-001' },
        data: expect.objectContaining({ status: 'SUPERSEDED', supersededAt: expect.any(Date) }),
      })
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2, status: 'RECEIVED' }),
      })
    )
    expect(result.id).toBe('inv-002')
  })

  it('throws when invoice not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    await expect(createNewVersion('inv-999', 'user-001')).rejects.toThrow('Invoice not found')
  })
})
