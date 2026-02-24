/**
 * Unit tests for the invoice status-history analytics helper.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    invStatusHistory: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    invInvoice: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

import { recordStatusTransition, recordInvoiceCreated } from './status-history'
import { prisma } from '@/lib/db'

const mockHistory = prisma.invStatusHistory as jest.Mocked<typeof prisma.invStatusHistory>
const mockInvoice = prisma.invInvoice as jest.Mocked<typeof prisma.invInvoice>

describe('recordStatusTransition', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHistory.findFirst.mockResolvedValue(null)
    mockHistory.create.mockResolvedValue({} as never)
    mockInvoice.updateMany.mockResolvedValue({ count: 1 })
    mockInvoice.update.mockResolvedValue({} as never)
    mockInvoice.findUnique.mockResolvedValue({ receivedAt: new Date() } as never)
  })

  it('creates a history record', async () => {
    await recordStatusTransition({
      invoiceId: 'inv-1',
      fromStatus: null,
      toStatus: 'RECEIVED',
    })
    expect(mockHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'inv-1',
          fromStatus: null,
          toStatus: 'RECEIVED',
        }),
      })
    )
  })

  it('calculates durationMs from previous record', async () => {
    const prevTime = new Date(Date.now() - 60000) // 1 minute ago
    mockHistory.findFirst.mockResolvedValue({
      changedAt: prevTime,
    } as never)

    await recordStatusTransition({
      invoiceId: 'inv-1',
      fromStatus: 'RECEIVED',
      toStatus: 'APPROVED',
    })

    const createCall = mockHistory.create.mock.calls[0]
    const durationMs = (createCall as unknown as [{ data: { durationMs: number } }])[0].data.durationMs
    expect(durationMs).toBeGreaterThan(55000)
    expect(durationMs).toBeLessThan(65000)
  })

  it('updates firstApprovedAt when status is APPROVED', async () => {
    await recordStatusTransition({
      invoiceId: 'inv-1',
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'APPROVED',
    })
    expect(mockInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firstApprovedAt: null }),
        data: expect.objectContaining({ firstApprovedAt: expect.any(Date) }),
      })
    )
  })

  it('updates firstRejectedAt when status is REJECTED', async () => {
    await recordStatusTransition({
      invoiceId: 'inv-1',
      fromStatus: 'PENDING_REVIEW',
      toStatus: 'REJECTED',
    })
    expect(mockInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firstRejectedAt: null }),
        data: expect.objectContaining({ firstRejectedAt: expect.any(Date) }),
      })
    )
  })

  it('updates totalProcessingMs when status is PAID', async () => {
    await recordStatusTransition({
      invoiceId: 'inv-1',
      fromStatus: 'CLAIMED',
      toStatus: 'PAID',
    })
    expect(mockInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalProcessingMs: expect.any(Number) }),
      })
    )
  })

  it('never throws even if prisma fails', async () => {
    mockHistory.create.mockRejectedValue(new Error('DB error'))
    // Should not throw
    await expect(
      recordStatusTransition({ invoiceId: 'inv-1', fromStatus: null, toStatus: 'RECEIVED' })
    ).resolves.toBeUndefined()
  })

  it('sets durationMs to null when no previous record', async () => {
    mockHistory.findFirst.mockResolvedValue(null)
    await recordStatusTransition({ invoiceId: 'inv-1', fromStatus: null, toStatus: 'RECEIVED' })
    const createCall = mockHistory.create.mock.calls[0]
    const durationMs = (createCall as unknown as [{ data: { durationMs: number | null } }])[0].data.durationMs
    expect(durationMs).toBeNull()
  })
})

describe('recordInvoiceCreated', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHistory.findFirst.mockResolvedValue(null)
    mockHistory.create.mockResolvedValue({} as never)
    mockInvoice.updateMany.mockResolvedValue({ count: 1 })
  })

  it('records initial RECEIVED transition with null fromStatus', async () => {
    await recordInvoiceCreated('inv-abc')
    expect(mockHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'inv-abc',
          fromStatus: null,
          toStatus: 'RECEIVED',
        }),
      })
    )
  })
})
