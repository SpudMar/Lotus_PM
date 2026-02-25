/**
 * Tests for GET /api/plans/search
 */

jest.mock('@/lib/auth/session', () => ({
  requirePermission: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    planPlan: { findMany: jest.fn() },
  },
}))

import { NextRequest } from 'next/server'
import { GET } from './route'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>
const mockFindMany = prisma.planPlan.findMany as jest.MockedFunction<
  typeof prisma.planPlan.findMany
>

function makeRequest(params: { q?: string; participantId?: string; limit?: number }): NextRequest {
  const url = new URL('http://localhost/api/plans/search')
  if (params.q !== undefined) url.searchParams.set('q', params.q)
  if (params.participantId) url.searchParams.set('participantId', params.participantId)
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit))
  return new NextRequest(url)
}

describe('GET /api/plans/search', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirePermission.mockResolvedValue(undefined as never)
    mockFindMany.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(makeRequest({ q: 'test' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when lacking permission', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'))
    const res = await GET(makeRequest({ q: 'test' }))
    expect(res.status).toBe(403)
  })

  it('returns plans when no query provided (lists all up to limit)', async () => {
    const mockResult = [
      {
        id: 'plan-1',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        status: 'ACTIVE',
        participant: { firstName: 'John', lastName: 'Doe', ndisNumber: '431000001' },
      },
    ]
    mockFindMany.mockResolvedValue(mockResult as never)

    const res = await GET(makeRequest({}))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual(mockResult)
  })

  it('searches by participant name', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest({ q: 'john' }))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { participant: { firstName: { contains: 'john', mode: 'insensitive' } } },
            { participant: { lastName: { contains: 'john', mode: 'insensitive' } } },
            { participant: { ndisNumber: { contains: 'john', mode: 'insensitive' } } },
          ],
        }),
      }),
    )
  })

  it('filters by participantId when provided', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest({ participantId: 'part-123' }))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: 'part-123',
        }),
      }),
    )
  })

  it('combines participantId filter with search query', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest({ q: 'active', participantId: 'part-123' }))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: 'part-123',
          OR: expect.any(Array),
        }),
      }),
    )
  })

  it('clamps limit to max 50', async () => {
    mockFindMany.mockResolvedValue([] as never)
    await GET(makeRequest({ q: 'test', limit: 200 }))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    )
  })

  it('requires plans:read permission', async () => {
    await GET(makeRequest({ q: 'test' }))
    expect(mockRequirePermission).toHaveBeenCalledWith('plans:read')
  })
})
