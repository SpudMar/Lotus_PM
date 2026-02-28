jest.mock('@/lib/db', () => ({
  prisma: {
    participantApprovedSupport: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { checkSupportApproved, updateApprovedSupports, getApprovedSupports } from './approved-supports'

const mockFindUnique = prisma.participantApprovedSupport.findUnique as jest.MockedFunction<
  typeof prisma.participantApprovedSupport.findUnique
>

describe('checkSupportApproved', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns approved when no rule exists for category (default = all allowed)', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({ approved: true })
  })

  it('returns approved when category is not in restricted mode', async () => {
    mockFindUnique.mockResolvedValueOnce({ restrictedMode: false } as never)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({ approved: true })
  })

  it('returns approved when item is in allowed list', async () => {
    mockFindUnique.mockResolvedValueOnce({
      restrictedMode: true,
      allowedItemCodes: ['01_001_0101_1_1', '01_002_0102_1_1'],
    } as never)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({ approved: true })
  })

  it('returns not approved when item is NOT in allowed list', async () => {
    mockFindUnique.mockResolvedValueOnce({
      restrictedMode: true,
      allowedItemCodes: ['01_002_0102_1_1'],
    } as never)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({
      approved: false,
      reason: 'Support item 01_001_0101_1_1 is not in the approved list for category 01',
    })
  })
})

describe('updateApprovedSupports', () => {
  it('upserts the rule', async () => {
    const mockUpsert = prisma.participantApprovedSupport.upsert as jest.MockedFunction<
      typeof prisma.participantApprovedSupport.upsert
    >
    mockUpsert.mockResolvedValueOnce({ id: 'as-001' } as never)

    await updateApprovedSupports('part-001', '01', true, ['01_001_0101_1_1'], 'user-001')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { participantId_categoryCode: { participantId: 'part-001', categoryCode: '01' } },
        create: expect.objectContaining({
          participantId: 'part-001',
          categoryCode: '01',
          restrictedMode: true,
          allowedItemCodes: ['01_001_0101_1_1'],
        }),
      })
    )
  })
})

describe('getApprovedSupports', () => {
  it('returns all rules for a participant', async () => {
    const mockFindMany = prisma.participantApprovedSupport.findMany as jest.MockedFunction<
      typeof prisma.participantApprovedSupport.findMany
    >
    mockFindMany.mockResolvedValueOnce([{ id: 'as-001', categoryCode: '01' }] as never)

    const result = await getApprovedSupports('part-001')
    expect(result).toHaveLength(1)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { participantId: 'part-001' },
      })
    )
  })
})
