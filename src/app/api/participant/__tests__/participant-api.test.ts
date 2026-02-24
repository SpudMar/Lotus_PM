/**
 * Tests for participant API routes.
 *
 * Covers:
 * - POST /api/participant/auth (login, invalid NDIS, wrong DOB)
 * - JWT generation + verification helper
 * - GET /api/participant/plan (scoped to participant)
 * - GET /api/participant/invoices (scoped, paginated)
 * - GET /api/participant/messages (scoped)
 * - GET /api/participant/profile (scoped)
 */

// ─── Mock Prisma ───────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    crmParticipant: {
      findFirst: jest.fn(),
    },
    planPlan: {
      findFirst: jest.fn(),
    },
    invInvoice: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    crmCommLog: {
      findMany: jest.fn(),
    },
  },
}))

// ─── Mock env ─────────────────────────────────────────────────────────────────

const MOCK_SECRET = 'test-secret-for-participant-api-tests-min-32-chars'
process.env['NEXTAUTH_SECRET'] = MOCK_SECRET

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { POST as authPOST } from '../auth/route'
import { GET as planGET } from '../plan/route'
import { GET as invoicesGET } from '../invoices/route'
import { GET as messagesGET } from '../messages/route'
import { GET as profileGET } from '../profile/route'
import { prisma } from '@/lib/db'
import {
  generateParticipantToken,
  getParticipantFromToken,
} from '@/lib/modules/participant-api/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const MOCK_PARTICIPANT = {
  id: 'part-1',
  firstName: 'Jane',
  lastName: 'Doe',
  ndisNumber: '430123456',
  dateOfBirth: new Date('1985-04-15'),
  email: 'jane@example.com',
  phone: '0412345678',
  assignedTo: {
    name: 'Alice Plan Manager',
    email: 'alice@lotusassist.com.au',
    phone: null,
  },
}

function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): NextRequest {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeAuthToken(participantId = 'part-1', ndisNumber = '430123456'): string {
  return generateParticipantToken({ participantId, ndisNumber })
}

// ─── Auth helper tests ─────────────────────────────────────────────────────────

describe('generateParticipantToken + getParticipantFromToken', () => {
  test('generates a verifiable JWT with correct payload', () => {
    const token = generateParticipantToken({
      participantId: 'part-1',
      ndisNumber: '430123456',
    })
    expect(typeof token).toBe('string')

    const decoded = jwt.verify(token, MOCK_SECRET) as jwt.JwtPayload
    expect(decoded['participantId']).toBe('part-1')
    expect(decoded['ndisNumber']).toBe('430123456')
    expect(decoded['role']).toBe('PARTICIPANT')
  })

  test('getParticipantFromToken returns payload for valid bearer token', () => {
    const token = makeAuthToken()
    const req = makeRequest('GET', '/api/participant/plan', undefined, token)
    const result = getParticipantFromToken(req)
    expect(result).not.toBeNull()
    expect(result?.participantId).toBe('part-1')
    expect(result?.ndisNumber).toBe('430123456')
    expect(result?.role).toBe('PARTICIPANT')
  })

  test('getParticipantFromToken returns null when no Authorization header', () => {
    const req = makeRequest('GET', '/api/participant/plan')
    expect(getParticipantFromToken(req)).toBeNull()
  })

  test('getParticipantFromToken returns null for tampered token', () => {
    const token = makeAuthToken() + 'tampered'
    const req = makeRequest('GET', '/api/participant/plan', undefined, token)
    expect(getParticipantFromToken(req)).toBeNull()
  })

  test('getParticipantFromToken returns null for token signed with wrong secret', () => {
    const badToken = jwt.sign(
      { participantId: 'part-1', ndisNumber: '430123456', role: 'PARTICIPANT' },
      'wrong-secret'
    )
    const req = makeRequest('GET', '/api/participant/plan', undefined, badToken)
    expect(getParticipantFromToken(req)).toBeNull()
  })
})

// ─── POST /api/participant/auth ────────────────────────────────────────────────

describe('POST /api/participant/auth', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns token on valid NDIS number + DOB', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue(MOCK_PARTICIPANT)

    const req = makeRequest('POST', '/api/participant/auth', {
      ndisNumber: '430123456',
      dateOfBirth: '1985-04-15',
    })
    const res = await authPOST(req)
    expect(res.status).toBe(200)

    const data = await res.json() as {
      token: string
      participant: { id: string; firstName: string; ndisNumber: string }
    }
    expect(data.token).toBeTruthy()
    expect(data.participant.id).toBe('part-1')
    expect(data.participant.firstName).toBe('Jane')
    expect(data.participant.ndisNumber).toBe('430123456')

    // Verify JWT is valid
    const decoded = jwt.verify(data.token, MOCK_SECRET) as jwt.JwtPayload
    expect(decoded['participantId']).toBe('part-1')
    expect(decoded['role']).toBe('PARTICIPANT')
  })

  test('returns 401 when NDIS number not found', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue(null)

    const req = makeRequest('POST', '/api/participant/auth', {
      ndisNumber: '999999999',
      dateOfBirth: '1985-04-15',
    })
    const res = await authPOST(req)
    expect(res.status).toBe(401)

    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when date of birth does not match', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue(MOCK_PARTICIPANT)

    const req = makeRequest('POST', '/api/participant/auth', {
      ndisNumber: '430123456',
      dateOfBirth: '1990-01-01', // wrong DOB
    })
    const res = await authPOST(req)
    expect(res.status).toBe(401)
  })

  test('returns 400 when fields are missing', async () => {
    const req = makeRequest('POST', '/api/participant/auth', { ndisNumber: '430123456' })
    const res = await authPOST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('INVALID_INPUT')
  })

  test('returns 400 when DOB format is invalid', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue(MOCK_PARTICIPANT)

    const req = makeRequest('POST', '/api/participant/auth', {
      ndisNumber: '430123456',
      dateOfBirth: 'not-a-date',
    })
    const res = await authPOST(req)
    expect(res.status).toBe(400)
  })

  test('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/participant/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await authPOST(req)
    expect(res.status).toBe(400)
  })
})

// ─── GET /api/participant/plan ─────────────────────────────────────────────────

describe('GET /api/participant/plan', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when no token provided', async () => {
    const req = makeRequest('GET', '/api/participant/plan')
    const res = await planGET(req)
    expect(res.status).toBe(401)
  })

  test('returns 404 when participant has no active plan', async () => {
    ;(mockPrisma.planPlan.findFirst as jest.Mock).mockResolvedValue(null)
    const req = makeRequest('GET', '/api/participant/plan', undefined, makeAuthToken())
    const res = await planGET(req)
    expect(res.status).toBe(404)
  })

  test('returns active plan with budget lines scoped to participant', async () => {
    const mockPlan = {
      id: 'plan-1',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      reviewDate: null,
      status: 'ACTIVE',
      budgetLines: [
        {
          id: 'bl-1',
          categoryCode: '01',
          categoryName: 'Daily Activities',
          allocatedCents: 500000,
          spentCents: 150000,
          reservedCents: 10000,
        },
      ],
    }
    ;(mockPrisma.planPlan.findFirst as jest.Mock).mockResolvedValue(mockPlan)

    const req = makeRequest('GET', '/api/participant/plan', undefined, makeAuthToken())
    const res = await planGET(req)
    expect(res.status).toBe(200)

    const data = await res.json() as {
      data: {
        id: string
        status: string
        budgetLines: Array<{
          categoryCode: string
          allocatedCents: number
          spentCents: number
          availableCents: number
          usedPercent: number
        }>
      }
    }
    expect(data.data.id).toBe('plan-1')
    expect(data.data.status).toBe('ACTIVE')
    expect(data.data.budgetLines).toHaveLength(1)
    expect(data.data.budgetLines[0]?.availableCents).toBe(340000) // 500000 - 150000 - 10000
    expect(data.data.budgetLines[0]?.usedPercent).toBe(30) // 150000/500000 = 30%

    // Verify query was scoped to participant
    expect(mockPrisma.planPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ participantId: 'part-1' }),
      })
    )
  })
})

// ─── GET /api/participant/invoices ─────────────────────────────────────────────

describe('GET /api/participant/invoices', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when no token', async () => {
    const req = makeRequest('GET', '/api/participant/invoices')
    const res = await invoicesGET(req)
    expect(res.status).toBe(401)
  })

  test('returns paginated invoices scoped to participant', async () => {
    const mockInvoices = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date('2026-02-01'),
        receivedAt: new Date('2026-02-02'),
        totalCents: 25000,
        status: 'APPROVED',
        provider: { name: 'Best Support Co' },
      },
    ]
    ;(mockPrisma.invInvoice.findMany as jest.Mock).mockResolvedValue(mockInvoices)
    ;(mockPrisma.invInvoice.count as jest.Mock).mockResolvedValue(1)

    const req = makeRequest('GET', '/api/participant/invoices', undefined, makeAuthToken())
    const res = await invoicesGET(req)
    expect(res.status).toBe(200)

    const data = await res.json() as {
      data: Array<{ id: string; status: string; provider: { name: string } }>
      total: number
      page: number
      pageSize: number
    }
    expect(data.data).toHaveLength(1)
    expect(data.data[0]?.id).toBe('inv-1')
    expect(data.data[0]?.status).toBe('APPROVED')
    expect(data.data[0]?.provider.name).toBe('Best Support Co')
    expect(data.total).toBe(1)
    expect(data.page).toBe(1)

    // Verify query is scoped to participant and excludes deleted
    expect(mockPrisma.invInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: 'part-1',
          deletedAt: null,
        }),
      })
    )
  })

  test('returns empty array when no invoices', async () => {
    ;(mockPrisma.invInvoice.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.invInvoice.count as jest.Mock).mockResolvedValue(0)

    const req = makeRequest('GET', '/api/participant/invoices', undefined, makeAuthToken())
    const res = await invoicesGET(req)
    const data = await res.json() as { data: unknown[] }
    expect(data.data).toHaveLength(0)
  })
})

// ─── GET /api/participant/messages ─────────────────────────────────────────────

describe('GET /api/participant/messages', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when no token', async () => {
    const req = makeRequest('GET', '/api/participant/messages')
    const res = await messagesGET(req)
    expect(res.status).toBe(401)
  })

  test('returns comm logs scoped to participant', async () => {
    const mockLogs = [
      {
        id: 'log-1',
        type: 'EMAIL',
        direction: 'OUTBOUND',
        subject: 'Your plan has been updated',
        body: 'Hi Jane, your plan has been updated.',
        occurredAt: new Date('2026-02-10'),
        createdAt: new Date('2026-02-10'),
      },
    ]
    ;(mockPrisma.crmCommLog.findMany as jest.Mock).mockResolvedValue(mockLogs)

    const req = makeRequest('GET', '/api/participant/messages', undefined, makeAuthToken())
    const res = await messagesGET(req)
    expect(res.status).toBe(200)

    const data = await res.json() as {
      data: Array<{ id: string; type: string; subject: string }>
    }
    expect(data.data).toHaveLength(1)
    expect(data.data[0]?.id).toBe('log-1')
    expect(data.data[0]?.type).toBe('EMAIL')

    expect(mockPrisma.crmCommLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ participantId: 'part-1' }),
      })
    )
  })

  test('returns empty array when no messages', async () => {
    ;(mockPrisma.crmCommLog.findMany as jest.Mock).mockResolvedValue([])
    const req = makeRequest('GET', '/api/participant/messages', undefined, makeAuthToken())
    const res = await messagesGET(req)
    const data = await res.json() as { data: unknown[] }
    expect(data.data).toHaveLength(0)
  })
})

// ─── GET /api/participant/profile ──────────────────────────────────────────────

describe('GET /api/participant/profile', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns 401 when no token', async () => {
    const req = makeRequest('GET', '/api/participant/profile')
    const res = await profileGET(req)
    expect(res.status).toBe(401)
  })

  test('returns 404 when participant not found (deleted)', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue(null)
    const req = makeRequest('GET', '/api/participant/profile', undefined, makeAuthToken())
    const res = await profileGET(req)
    expect(res.status).toBe(404)
  })

  test('returns participant profile with plan manager', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue(MOCK_PARTICIPANT)

    const req = makeRequest('GET', '/api/participant/profile', undefined, makeAuthToken())
    const res = await profileGET(req)
    expect(res.status).toBe(200)

    const data = await res.json() as {
      data: {
        id: string
        firstName: string
        ndisNumber: string
        email: string
        planManager: { name: string }
      }
    }
    expect(data.data.id).toBe('part-1')
    expect(data.data.firstName).toBe('Jane')
    expect(data.data.ndisNumber).toBe('430123456')
    expect(data.data.email).toBe('jane@example.com')
    expect(data.data.planManager?.name).toBe('Alice Plan Manager')

    expect(mockPrisma.crmParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'part-1',
          deletedAt: null,
        }),
      })
    )
  })

  test('returns null planManager when no plan manager assigned', async () => {
    ;(mockPrisma.crmParticipant.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_PARTICIPANT,
      assignedTo: null,
    })

    const req = makeRequest('GET', '/api/participant/profile', undefined, makeAuthToken())
    const res = await profileGET(req)
    const data = await res.json() as { data: { planManager: null } }
    expect(data.data.planManager).toBeNull()
  })
})
