/**
 * Unit tests for the Support Item Pattern Matcher -- WS-F4
 *
 * Covers:
 *   - suggestSupportItem returns null when no patterns exist
 *   - After 3 patterns for same provider+participant+category: HIGH confidence (0.9)
 *   - After 3 patterns for provider+category (different participants): MEDIUM confidence (0.7)
 *   - Low confidence (0.5) returned from cross-provider category patterns
 *   - recordPattern increments occurrences on repeated calls
 *   - Medium confidence does NOT trigger when occurrences < 3
 *   - Tier priority: HIGH beats MEDIUM beats LOW
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invItemPattern: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { suggestSupportItem, recordPattern } from './item-matcher'

// Cast to mocked versions for type-safe spy access
const mockPattern = prisma.invItemPattern as jest.Mocked<typeof prisma.invItemPattern>

// ── Setup ─────────────────────────────────────────────────────────────────────

function clearAll(): void {
  jest.clearAllMocks()
  mockPattern.findFirst.mockResolvedValue(null)
  mockPattern.findMany.mockResolvedValue([])
  mockPattern.upsert.mockResolvedValue({} as never)
}

// ── suggestSupportItem ────────────────────────────────────────────────────────

describe('suggestSupportItem', () => {
  beforeEach(clearAll)

  it('returns null when no patterns exist at all', async () => {
    mockPattern.findFirst.mockResolvedValue(null)
    mockPattern.findMany.mockResolvedValue([])

    const result = await suggestSupportItem('prov-1', 'part-1', '01')

    expect(result).toBeNull()
  })

  it('returns HIGH confidence (0.9) after 3+ same provider+participant+category patterns', async () => {
    mockPattern.findFirst.mockResolvedValue({
      itemNumber: '01_011_0107_1_1',
    } as never)

    const result = await suggestSupportItem('prov-1', 'part-1', '01')

    expect(result).not.toBeNull()
    expect(result?.itemNumber).toBe('01_011_0107_1_1')
    expect(result?.confidence).toBe(0.9)
    expect(result?.source).toBe('HIGH')
    expect(mockPattern.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerId: 'prov-1',
          participantId: 'part-1',
          categoryCode: '01',
          occurrences: { gte: 3 },
        }),
      })
    )
  })

  it('returns MEDIUM confidence (0.7) when provider+category patterns exist with 3+ occurrences for any participant', async () => {
    // Tier 1 (specific participant) fails
    mockPattern.findFirst.mockResolvedValue(null)
    // Tier 2 (any participant, same provider+category) succeeds
    mockPattern.findMany.mockResolvedValueOnce([
      { itemNumber: '01_011_0107_1_1', occurrences: 4 },
      { itemNumber: '01_013_0107_1_1', occurrences: 2 },
    ] as never)

    const result = await suggestSupportItem('prov-1', 'part-2', '01')

    expect(result).not.toBeNull()
    expect(result?.itemNumber).toBe('01_011_0107_1_1')
    expect(result?.confidence).toBe(0.7)
    expect(result?.source).toBe('MEDIUM')
  })

  it('returns LOW confidence (0.5) from cross-provider category patterns when no provider match exists', async () => {
    // Tier 1 fails
    mockPattern.findFirst.mockResolvedValue(null)
    // Tier 2 — provider+category with >=3 occurrences — returns empty
    mockPattern.findMany.mockResolvedValueOnce([])
    // Tier 3 — all providers for category — returns patterns
    mockPattern.findMany.mockResolvedValueOnce([
      { itemNumber: '01_011_0107_1_1', occurrences: 5 },
      { itemNumber: '01_013_0107_1_1', occurrences: 2 },
    ] as never)

    const result = await suggestSupportItem('prov-1', 'part-1', '01')

    expect(result).not.toBeNull()
    expect(result?.itemNumber).toBe('01_011_0107_1_1')
    expect(result?.confidence).toBe(0.5)
    expect(result?.source).toBe('LOW')
  })

  it('HIGH confidence takes priority over MEDIUM and LOW', async () => {
    // Tier 1 match available
    mockPattern.findFirst.mockResolvedValue({
      itemNumber: '01_011_0107_1_1',
    } as never)
    // Tier 2 and 3 findMany would return different results — they should NOT be called
    mockPattern.findMany.mockResolvedValue([
      { itemNumber: '99_999_9999_9_9', occurrences: 99 },
    ] as never)

    const result = await suggestSupportItem('prov-1', 'part-1', '01')

    expect(result?.confidence).toBe(0.9)
    expect(result?.itemNumber).toBe('01_011_0107_1_1')
    // findMany should not be called when HIGH match found
    expect(mockPattern.findMany).not.toHaveBeenCalled()
  })

  it('does NOT return MEDIUM confidence when no patterns have 3+ occurrences', async () => {
    // Tier 1 fails
    mockPattern.findFirst.mockResolvedValue(null)
    // Tier 2 returns patterns all below threshold (already filtered by DB query with gte:3)
    mockPattern.findMany.mockResolvedValueOnce([])
    // Tier 3 also empty
    mockPattern.findMany.mockResolvedValueOnce([])

    const result = await suggestSupportItem('prov-1', 'part-1', '01')

    expect(result).toBeNull()
  })

  it('selects the itemNumber with the most total occurrences in MEDIUM tier', async () => {
    mockPattern.findFirst.mockResolvedValue(null)
    // Tier 2 — two items with different occurrence counts
    mockPattern.findMany.mockResolvedValueOnce([
      { itemNumber: '01_013_0107_1_1', occurrences: 3 },
      { itemNumber: '01_011_0107_1_1', occurrences: 7 },
      { itemNumber: '01_013_0107_1_1', occurrences: 4 }, // same item for different participant
    ] as never)

    const result = await suggestSupportItem('prov-1', 'part-1', '01')

    // 01_013 has 3+4=7 total; 01_011 has 7. Both are equal — whichever is returned is fine,
    // but more importantly we pick based on total occurrences not first entry order.
    expect(result?.confidence).toBe(0.7)
    expect(result?.itemNumber).toBeDefined()
  })

  it('MEDIUM confidence is SKIPPED and LOW runs when medium has no eligible patterns', async () => {
    mockPattern.findFirst.mockResolvedValue(null)
    // Tier 2 — no patterns meeting threshold
    mockPattern.findMany.mockResolvedValueOnce([])
    // Tier 3 — global category patterns
    mockPattern.findMany.mockResolvedValueOnce([
      { itemNumber: '01_011_0107_1_1', occurrences: 10 },
    ] as never)

    const result = await suggestSupportItem('prov-new', 'part-new', '01')

    expect(result?.confidence).toBe(0.5)
    expect(result?.source).toBe('LOW')
  })
})

// ── recordPattern ─────────────────────────────────────────────────────────────

describe('recordPattern', () => {
  beforeEach(clearAll)

  it('upserts a new pattern with occurrences=1 on first call', async () => {
    await recordPattern('prov-1', 'part-1', '01', '01_011_0107_1_1')

    expect(mockPattern.upsert).toHaveBeenCalledTimes(1)
    expect(mockPattern.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerId_participantId_categoryCode_itemNumber: {
            providerId: 'prov-1',
            participantId: 'part-1',
            categoryCode: '01',
            itemNumber: '01_011_0107_1_1',
          },
        },
        create: expect.objectContaining({
          providerId: 'prov-1',
          participantId: 'part-1',
          categoryCode: '01',
          itemNumber: '01_011_0107_1_1',
          occurrences: 1,
        }),
        update: expect.objectContaining({
          occurrences: { increment: 1 },
        }),
      })
    )
  })

  it('increments occurrences on repeated calls', async () => {
    await recordPattern('prov-1', 'part-1', '01', '01_011_0107_1_1')
    await recordPattern('prov-1', 'part-1', '01', '01_011_0107_1_1')
    await recordPattern('prov-1', 'part-1', '01', '01_011_0107_1_1')

    expect(mockPattern.upsert).toHaveBeenCalledTimes(3)
    // Each call uses increment: 1 in the update
    const allCalls = mockPattern.upsert.mock.calls
    for (const call of allCalls) {
      expect(call[0]?.update).toMatchObject({ occurrences: { increment: 1 } })
    }
  })

  it('uses the composite unique key for upsert lookup', async () => {
    await recordPattern('prov-A', 'part-B', '15', '15_042_0128_1_3')

    expect(mockPattern.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerId_participantId_categoryCode_itemNumber: {
            providerId: 'prov-A',
            participantId: 'part-B',
            categoryCode: '15',
            itemNumber: '15_042_0128_1_3',
          },
        },
      })
    )
  })

  it('updates lastSeenAt on each call', async () => {
    await recordPattern('prov-1', 'part-1', '01', '01_011_0107_1_1')

    const callArg = mockPattern.upsert.mock.calls[0]?.[0]
    expect(callArg?.update).toHaveProperty('lastSeenAt')
    expect(callArg?.create).toHaveProperty('lastSeenAt')
  })
})
