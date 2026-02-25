/**
 * Tests for GET /api/crm/providers/search
 */

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    crmProvider: { findMany: jest.fn() },
  },
}))

import { NextRequest } from 'next/server'
import { GET } from './route'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockFindMany = prisma.crmProvider.findMany as jest.MockedFunction<
  typeof prisma.crmProvider.findMany
>

function makeRequest(query: string, limit?: number): NextRequest {
  const url = new URL('http://localhost/api/crm/providers/search')
  url.searchParams.set('q', query)
  if (limit !== undefined) url.searchParams.set('limit', String(limit))
  return new NextRequest(url)
}

describe('GET /api/crm/providers/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(undefined as never)
    mockFindMany.mockResolvedValue([])
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
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('searches by name and ABN', async () => {
    const mockResult = [
      { id: 'prov1', name: 'Therapy Plus', abn: '12345678901' },
    ]
    mockFindMany.mockResolvedValue(mockResult as never)

    const res = await GET(makeRequest('therapy'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual(mockResult)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'therapy', mode: 'insensitive' } },
            { abn: { contains: 'therapy', mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    )
  })

  it('clamps limit to max 50', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest('test', 200))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    )
  })

  it('requires providers:read permission', async () => {
    await GET(makeRequest('test'))
    expect(mockRequirePermission).toHaveBeenCalledWith('providers:read')
  })
})
