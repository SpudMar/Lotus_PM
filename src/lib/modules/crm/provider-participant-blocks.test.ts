jest.mock('@/lib/db', () => ({
  prisma: {
    providerParticipantBlock: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    crmFlag: { create: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { createBlock, getActiveBlock, resolveBlock, checkProviderBlocked } from './provider-participant-blocks'

const mockCreate = prisma.providerParticipantBlock.create as jest.MockedFunction<
  typeof prisma.providerParticipantBlock.create
>
const mockFindFirst = prisma.providerParticipantBlock.findFirst as jest.MockedFunction<
  typeof prisma.providerParticipantBlock.findFirst
>

describe('provider-participant-blocks', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('createBlock', () => {
    it('creates block and auto-creates BLOCKING flag', async () => {
      mockCreate.mockResolvedValueOnce({ id: 'block-001' } as never)
      ;(prisma.crmFlag.create as jest.Mock).mockResolvedValueOnce({ id: 'flag-001' } as never)

      await createBlock({
        participantId: 'part-001',
        providerId: 'prov-001',
        blockAllLines: true,
        blockedLineItems: [],
        reason: 'Billing irregularities',
      }, 'user-001')

      expect(mockCreate).toHaveBeenCalled()
      expect(prisma.crmFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: 'BLOCKING' }),
        })
      )
    })
  })

  describe('getActiveBlock', () => {
    it('returns null when no active block exists', async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      const result = await getActiveBlock('part-001', 'prov-001')
      expect(result).toBeNull()
    })

    it('returns active block when one exists', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'block-001', blockAllLines: true } as never)
      const result = await getActiveBlock('part-001', 'prov-001')
      expect(result).not.toBeNull()
    })
  })

  describe('checkProviderBlocked', () => {
    it('returns not blocked when no active block', async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      const result = await checkProviderBlocked('part-001', 'prov-001', ['01_001'])
      expect(result.blocked).toBe(false)
    })

    it('returns blocked when blockAllLines is true', async () => {
      mockFindFirst.mockResolvedValueOnce({ blockAllLines: true, reason: 'Fraud', blockedLineItems: [] } as never)
      const result = await checkProviderBlocked('part-001', 'prov-001', ['01_001'])
      expect(result.blocked).toBe(true)
      expect(result.reason).toBe('Fraud')
    })

    it('returns blocked when specific line items match', async () => {
      mockFindFirst.mockResolvedValueOnce({
        blockAllLines: false,
        reason: 'Specific items blocked',
        blockedLineItems: ['01_001_0101_1_1'],
      } as never)
      const result = await checkProviderBlocked('part-001', 'prov-001', ['01_001_0101_1_1', '01_002_0102_1_1'])
      expect(result.blocked).toBe(true)
    })

    it('returns not blocked when no matching line items', async () => {
      mockFindFirst.mockResolvedValueOnce({
        blockAllLines: false,
        reason: 'Specific items blocked',
        blockedLineItems: ['01_001_0101_1_1'],
      } as never)
      const result = await checkProviderBlocked('part-001', 'prov-001', ['01_002_0102_1_1'])
      expect(result.blocked).toBe(false)
    })
  })
})
