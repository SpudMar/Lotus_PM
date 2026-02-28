jest.mock('@/lib/db', () => ({
  prisma: {
    clmClaim: { findUnique: jest.fn(), update: jest.fn() },
    clmClaimLine: { updateMany: jest.fn() },
    invInvoice: { update: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { importProdaRemittance } from './proda-remittance-import'

const mockClaimFind = prisma.clmClaim.findUnique as jest.MockedFunction<typeof prisma.clmClaim.findUnique>
const mockClaimUpdate = prisma.clmClaim.update as jest.MockedFunction<typeof prisma.clmClaim.update>

describe('importProdaRemittance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('parses CSV and updates claim statuses', async () => {
    const csv = `ClaimReference,Status,ApprovedAmount,RejectionReason
CLM-20260228-0001,Paid,100.00,
CLM-20260228-0002,Rejected,0.00,Duplicate claim`

    mockClaimFind
      .mockResolvedValueOnce({ id: 'clm-001', invoiceId: 'inv-001', status: 'SUBMITTED' } as never)
      .mockResolvedValueOnce({ id: 'clm-002', invoiceId: 'inv-002', status: 'SUBMITTED' } as never)
    mockClaimUpdate.mockResolvedValue({} as never)
    ;(prisma.invInvoice.update as jest.Mock).mockResolvedValue({} as never)

    const result = await importProdaRemittance(csv, 'user-001')

    expect(result.approved).toBe(1)
    expect(result.rejected).toBe(1)
    expect(result.unmatched).toBe(0)
  })

  it('sets NDIA_REJECTED on invoice when claim rejected', async () => {
    const csv = `ClaimReference,Status,ApprovedAmount,RejectionReason
CLM-20260228-0001,Rejected,0.00,Insufficient funding`

    mockClaimFind.mockResolvedValueOnce({ id: 'clm-001', invoiceId: 'inv-001', status: 'SUBMITTED' } as never)
    mockClaimUpdate.mockResolvedValue({} as never)
    ;(prisma.invInvoice.update as jest.Mock).mockResolvedValue({} as never)

    await importProdaRemittance(csv, 'user-001')

    expect(prisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rejectionSource: 'NDIA_REJECTED' }),
      })
    )
  })

  it('counts unmatched claims correctly', async () => {
    const csv = `ClaimReference,Status,ApprovedAmount,RejectionReason
CLM-MISSING-001,Paid,50.00,`

    mockClaimFind.mockResolvedValueOnce(null)

    const result = await importProdaRemittance(csv, 'user-001')

    expect(result.unmatched).toBe(1)
    expect(result.approved).toBe(0)
  })

  it('handles empty CSV', async () => {
    const result = await importProdaRemittance('ClaimReference,Status', 'user-001')
    expect(result.approved).toBe(0)
    expect(result.rejected).toBe(0)
    expect(result.unmatched).toBe(0)
  })
})
