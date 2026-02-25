/**
 * Tests for GET /api/ndis/support-items/search
 */

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    ndisPriceGuideVersion: { findFirst: jest.fn() },
    ndisSupportItem: { findMany: jest.fn() },
  },
}))

import { NextRequest } from 'next/server'
import { GET } from './route'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockFindFirstVersion = prisma.ndisPriceGuideVersion.findFirst as jest.MockedFunction<
  typeof prisma.ndisPriceGuideVersion.findFirst
>
const mockFindManyItems = prisma.ndisSupportItem.findMany as jest.MockedFunction<
  typeof prisma.ndisSupportItem.findMany
>

function makeRequest(query: string, limit?: number): NextRequest {
  const url = new URL('http://localhost/api/ndis/support-items/search')
  url.searchParams.set('q', query)
  if (limit !== undefined) url.searchParams.set('limit', String(limit))
  return new NextRequest(url)
}

describe('GET /api/ndis/support-items/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(undefined as never)
    mockFindFirstVersion.mockResolvedValue({ id: 'ver-1' } as never)
    mockFindManyItems.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(makeRequest('test'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when lacking permission', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))
    const res = await GET(makeRequest('test'))
    expect(res.status).toBe(403)
  })

  it('returns empty array for empty query', async () => {
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
    expect(mockFindManyItems).not.toHaveBeenCalled()
  })

  it('returns empty array when no price guide version exists', async () => {
    mockFindFirstVersion.mockResolvedValue(null)
    const res = await GET(makeRequest('assistance'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
  })

  it('searches by item number, name, and category', async () => {
    const mockItems = [
      {
        id: 'item-1',
        itemNumber: '15_042_0128_1_3',
        name: 'Assistance with daily life',
        categoryCode: '15',
        categoryName: 'Daily Activities',
        priceStandardCents: 5500,
        unitType: 'H',
      },
    ]
    mockFindManyItems.mockResolvedValue(mockItems as never)

    const res = await GET(makeRequest('daily'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([
      {
        id: 'item-1',
        itemNumber: '15_042_0128_1_3',
        name: 'Assistance with daily life',
        categoryCode: '15',
        categoryName: 'Daily Activities',
        unitPriceCents: 5500,
        unit: 'H',
      },
    ])
  })

  it('maps priceStandardCents to unitPriceCents and unitType to unit', async () => {
    const mockItems = [
      {
        id: 'item-2',
        itemNumber: '01_001_0001_1_1',
        name: 'Test Item',
        categoryCode: '01',
        categoryName: 'Test',
        priceStandardCents: null,
        unitType: 'EA',
      },
    ]
    mockFindManyItems.mockResolvedValue(mockItems as never)

    const res = await GET(makeRequest('test'))
    const json = await res.json()
    expect(json.data[0].unitPriceCents).toBe(0) // null → 0
    expect(json.data[0].unit).toBe('EA')
  })

  it('filters to latest price guide version', async () => {
    mockFindManyItems.mockResolvedValue([] as never)
    await GET(makeRequest('test'))
    expect(mockFindManyItems).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          versionId: 'ver-1',
        }),
      }),
    )
  })

  it('clamps limit to max 100', async () => {
    mockFindManyItems.mockResolvedValue([] as never)
    await GET(makeRequest('test', 500))
    expect(mockFindManyItems).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })

  it('requires invoices:read permission', async () => {
    await GET(makeRequest('test'))
    expect(mockRequirePermission).toHaveBeenCalledWith('invoices:read')
  })
})
