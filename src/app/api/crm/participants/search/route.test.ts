/**
 * Tests for GET /api/crm/participants/search
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 403 wrong role
 *   - 200 empty query returns []
 *   - 200 search by name
 *   - 200 limit clamping
 */

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    crmParticipant: { findMany: jest.fn() },
  },
}))

import { NextRequest } from 'next/server'
import { GET } from './route'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockFindMany = prisma.crmParticipant.findMany as jest.MockedFunction<
  typeof prisma.crmParticipant.findMany
>

function makeRequest(query: string, limit?: number): NextRequest {
  const url = new URL('http://localhost/api/crm/participants/search')
  url.searchParams.set('q', query)
  if (limit !== undefined) url.searchParams.set('limit', String(limit))
  return new NextRequest(url)
}

describe('GET /api/crm/participants/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(undefined as never)
    mockFindMany.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(makeRequest('test'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 when lacking permission', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))
    const res = await GET(makeRequest('test'))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.code).toBe('FORBIDDEN')
  })

  it('returns empty array for empty query', async () => {
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns empty array for whitespace-only query', async () => {
    const res = await GET(makeRequest('   '))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('searches by name and NDIS number', async () => {
    const mockResult = [
      { id: 'p1', firstName: 'Jane', lastName: 'Smith', ndisNumber: '431000001' },
    ]
    mockFindMany.mockResolvedValue(mockResult as never)

    const res = await GET(makeRequest('jane'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual(mockResult)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { firstName: { contains: 'jane', mode: 'insensitive' } },
            { lastName: { contains: 'jane', mode: 'insensitive' } },
            { ndisNumber: { contains: 'jane', mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    )
  })

  it('respects custom limit', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest('test', 5))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    )
  })

  it('clamps limit to max 50', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest('test', 200))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    )
  })

  it('requires participants:read permission', async () => {
    await GET(makeRequest('test'))
    expect(mockRequirePermission).toHaveBeenCalledWith('participants:read')
  })
})
