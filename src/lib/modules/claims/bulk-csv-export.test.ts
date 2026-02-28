jest.mock('@/lib/db', () => ({
  prisma: {
    clmBatch: { findUnique: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { generateBulkClaimCSV } from './bulk-csv-export'

const mockBatchFind = prisma.clmBatch.findUnique as jest.MockedFunction<typeof prisma.clmBatch.findUnique>

describe('generateBulkClaimCSV', () => {
  beforeEach(() => jest.clearAllMocks())

  it('generates 16-column NDIS format CSV', async () => {
    mockBatchFind.mockResolvedValueOnce({
      id: 'batch-001',
      claims: [{
        id: 'clm-001',
        claimReference: 'CLM-20260228-0001',
        claimType: 'STANDARD',
        invoice: {
          participantApprovalStatus: 'APPROVED',
          participant: { ndisNumber: '430000001' },
          provider: { abn: '12345678901' },
        },
        lines: [{
          supportItemCode: '01_001_0101_1_1',
          serviceDate: new Date('2026-02-15'),
          quantity: 2,
          unitPriceCents: 5000,
          gstCents: 0,
        }],
      }],
    } as never)

    const csv = await generateBulkClaimCSV('batch-001', '4050000001')
    const lines = csv.split('\n')

    // Header row
    expect(lines[0]).toContain('RegistrationNumber')
    expect(lines[0]!.split(',').length).toBe(16)

    // Data row
    expect(lines[1]).toContain('4050000001') // Registration number
    expect(lines[1]).toContain('430000001')  // NDIS number
    expect(lines[1]).toContain('2026/02/15') // Date format YYYY/MM/DD
  })

  it('excludes MANUAL_ENQUIRY claims', async () => {
    mockBatchFind.mockResolvedValueOnce({
      id: 'batch-001',
      claims: [
        { claimType: 'STANDARD', claimReference: 'CLM-001', invoice: { participant: { ndisNumber: '43' }, provider: { abn: '12' }, participantApprovalStatus: 'APPROVED' }, lines: [{ supportItemCode: 'x', serviceDate: new Date(), quantity: 1, unitPriceCents: 100, gstCents: 0 }] },
        { claimType: 'MANUAL_ENQUIRY', claimReference: 'CLM-002', invoice: { participant: { ndisNumber: '44' }, provider: { abn: '13' }, participantApprovalStatus: 'APPROVED' }, lines: [{ supportItemCode: 'y', serviceDate: new Date(), quantity: 1, unitPriceCents: 200, gstCents: 0 }] },
      ],
    } as never)

    const csv = await generateBulkClaimCSV('batch-001', '4050000001')
    const lines = csv.split('\n').filter((l) => l.trim())
    expect(lines.length).toBe(2) // header + 1 data row (manual enquiry excluded)
  })

  it('throws when batch not found', async () => {
    mockBatchFind.mockResolvedValueOnce(null)
    await expect(generateBulkClaimCSV('x', '123')).rejects.toThrow('Batch not found')
  })
})
