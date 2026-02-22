/**
 * Tests for WS6: WordPress webhook ingest.
 *
 * Covers:
 *  - WordPressPayloadSchema validation (valid/invalid payloads)
 *  - processWordPressSubmission business logic (mocked Prisma)
 *  - POST /api/webhooks/service-agreement route handler
 */

// ── Module mocks (must be before imports) ─────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    crmParticipant: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    crmProvider: {
      findUnique: jest.fn(),
    },
    coreUser: {
      findFirst: jest.fn(),
    },
    saServiceAgreement: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import {
  WordPressPayloadSchema,
  processWordPressSubmission,
} from '@/lib/modules/crm/wordpress-ingest'
import { POST } from '@/app/api/webhooks/service-agreement/route'

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockParticipantCreate = prisma.crmParticipant.create as jest.MockedFunction<
  typeof prisma.crmParticipant.create
>
const mockProviderFindUnique = prisma.crmProvider.findUnique as jest.MockedFunction<
  typeof prisma.crmProvider.findUnique
>
const mockUserFindFirst = prisma.coreUser.findFirst as jest.MockedFunction<
  typeof prisma.coreUser.findFirst
>
const mockSaFindUnique = prisma.saServiceAgreement.findUnique as jest.MockedFunction<
  typeof prisma.saServiceAgreement.findUnique
>
const mockSaCreate = prisma.saServiceAgreement.create as jest.MockedFunction<
  typeof prisma.saServiceAgreement.create
>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_SECRET = 'test-wp-secret-xyz'

const FULL_PAYLOAD = {
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane.smith@example.com',
  phone: '0412345678',
  ndisNumber: '430123456',
  dateOfBirth: '1990-05-15',
  providerAbn: '12345678901',
  providerName: 'NDIS Provider Pty Ltd',
  startDate: '2026-03-01',
  endDate: '2027-03-01',
  notes: 'Referred by GP.',
}

const MOCK_PARTICIPANT = {
  id: 'part-001',
  ndisNumber: '430123456',
  firstName: 'Jane',
  lastName: 'Smith',
  dateOfBirth: new Date('1990-05-15'),
  email: 'jane.smith@example.com',
  phone: '0412345678',
  address: null,
  suburb: null,
  state: null,
  postcode: null,
  isActive: false,
  onboardingStatus: 'DRAFT' as const,
  ingestSource: 'WORDPRESS' as const,
  assignedToId: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRel: null,
  invoiceApprovalEnabled: false,
  invoiceApprovalMethod: null,
  onboardedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const MOCK_ADMIN = { id: 'user-admin-001' }

const MOCK_PROVIDER = { id: 'prov-001' }

const MOCK_SA = { id: 'sa-001' }

// ── Helper: make route request ────────────────────────────────────────────────

function makeRequest(
  body: unknown,
  options: { secret?: string } = {}
): NextRequest {
  const { secret = VALID_SECRET } = options
  return new NextRequest('http://localhost/api/webhooks/service-agreement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

// ── Tests: Schema validation ──────────────────────────────────────────────────

describe('WordPressPayloadSchema', () => {
  test('accepts full valid payload', () => {
    const result = WordPressPayloadSchema.safeParse(FULL_PAYLOAD)
    expect(result.success).toBe(true)
  })

  test('accepts minimal payload with email only', () => {
    const result = WordPressPayloadSchema.safeParse({ email: 'test@example.com' })
    expect(result.success).toBe(true)
  })

  test('accepts minimal payload with firstName only', () => {
    const result = WordPressPayloadSchema.safeParse({ firstName: 'Jane' })
    expect(result.success).toBe(true)
  })

  test('rejects payload with neither firstName nor email', () => {
    const result = WordPressPayloadSchema.safeParse({ lastName: 'Smith', phone: '0400000000' })
    expect(result.success).toBe(false)
    expect(result.error?.errors[0]?.message).toMatch(/firstName or email required/)
  })

  test('rejects payload with invalid email format', () => {
    const result = WordPressPayloadSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  test('allows all optional fields to be omitted', () => {
    const result = WordPressPayloadSchema.safeParse({ firstName: 'Jane' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBeUndefined()
      expect(result.data.providerAbn).toBeUndefined()
    }
  })
})

// ── Tests: processWordPressSubmission ─────────────────────────────────────────

describe('processWordPressSubmission', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParticipantCreate.mockResolvedValue(MOCK_PARTICIPANT)
    mockSaFindUnique.mockResolvedValue(null) // No collision on ref
    mockSaCreate.mockResolvedValue(MOCK_SA as never)
  })

  test('creates participant + SA for full valid payload with known provider ABN', async () => {
    mockUserFindFirst.mockResolvedValue(MOCK_ADMIN as never)
    mockProviderFindUnique.mockResolvedValue(MOCK_PROVIDER as never)

    const result = await processWordPressSubmission(FULL_PAYLOAD)

    expect(result.participantId).toBe('part-001')
    expect(result.serviceAgreementId).toBe('sa-001')
    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          onboardingStatus: 'DRAFT',
          ingestSource: 'WORDPRESS',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        }),
      })
    )
    expect(mockSaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participantId: 'part-001',
          providerId: 'prov-001',
          status: 'DRAFT',
          managedById: 'user-admin-001',
        }),
      })
    )
  })

  test('creates participant + SA without provider when ABN not found', async () => {
    mockUserFindFirst.mockResolvedValue(MOCK_ADMIN as never)
    mockProviderFindUnique.mockResolvedValue(null) // ABN not in DB

    const result = await processWordPressSubmission(FULL_PAYLOAD)

    expect(result.participantId).toBe('part-001')
    expect(result.serviceAgreementId).toBe('sa-001')
    expect(mockSaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerId: undefined,
        }),
      })
    )
  })

  test('creates participant with minimal payload (email only)', async () => {
    mockUserFindFirst.mockResolvedValue(MOCK_ADMIN as never)

    const result = await processWordPressSubmission({ email: 'minimal@example.com' })

    expect(result.participantId).toBe('part-001')
    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'minimal@example.com',
          firstName: '(Unknown)',
          ingestSource: 'WORDPRESS',
        }),
      })
    )
  })

  test('skips SA creation if no GLOBAL_ADMIN user found', async () => {
    mockUserFindFirst.mockResolvedValue(null) // No admin

    const result = await processWordPressSubmission({ firstName: 'Jane' })

    expect(result.participantId).toBe('part-001')
    expect(result.serviceAgreementId).toBeNull()
    expect(mockSaCreate).not.toHaveBeenCalled()
  })

  test('creates SA without provider when no providerAbn in payload', async () => {
    mockUserFindFirst.mockResolvedValue(MOCK_ADMIN as never)

    const payloadWithoutAbn = { firstName: 'Jane', email: 'jane@example.com' }
    await processWordPressSubmission(payloadWithoutAbn)

    expect(mockProviderFindUnique).not.toHaveBeenCalled()
    expect(mockSaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerId: undefined,
        }),
      })
    )
  })

  test('agreementRef follows SA-YYYYMMDD-XXXX format', async () => {
    mockUserFindFirst.mockResolvedValue(MOCK_ADMIN as never)

    await processWordPressSubmission({ firstName: 'Jane' })

    const saCreateCall = mockSaCreate.mock.calls[0]
    const ref = saCreateCall?.[0]?.data?.agreementRef as string
    expect(ref).toMatch(/^SA-\d{8}-[A-Z0-9]{4}$/)
  })
})

// ── Tests: POST /api/webhooks/service-agreement ───────────────────────────────

describe('POST /api/webhooks/service-agreement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.WORDPRESS_WEBHOOK_SECRET = VALID_SECRET
    // Default happy-path mocks
    mockParticipantCreate.mockResolvedValue(MOCK_PARTICIPANT)
    mockSaFindUnique.mockResolvedValue(null)
    mockSaCreate.mockResolvedValue(MOCK_SA as never)
    mockUserFindFirst.mockResolvedValue(MOCK_ADMIN as never)
    mockProviderFindUnique.mockResolvedValue(null)
  })

  afterEach(() => {
    delete process.env.WORDPRESS_WEBHOOK_SECRET
  })

  // ── Auth ────────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/service-agreement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(FULL_PAYLOAD),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('UNAUTHORIZED')
  })

  test('returns 401 when Bearer token is wrong', async () => {
    const req = makeRequest(FULL_PAYLOAD, { secret: 'wrong-token' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when WORDPRESS_WEBHOOK_SECRET env var is not set', async () => {
    delete process.env.WORDPRESS_WEBHOOK_SECRET
    const req = makeRequest(FULL_PAYLOAD)
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  test('returns 400 when payload has neither firstName nor email', async () => {
    const req = makeRequest({ lastName: 'Smith', phone: '0400000000' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  test('returns 400 when email format is invalid', async () => {
    const req = makeRequest({ email: 'not-valid' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json() as { code: string }
    expect(data.code).toBe('VALIDATION_ERROR')
  })

  // ── Success ─────────────────────────────────────────────────────────────────

  test('returns 201 with participantId and serviceAgreementId on success', async () => {
    const req = makeRequest(FULL_PAYLOAD)
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json() as {
      participantId: string
      serviceAgreementId: string
      message: string
    }
    expect(data.participantId).toBe('part-001')
    expect(data.serviceAgreementId).toBe('sa-001')
    expect(data.message).toBe('Created')
  })

  test('returns 201 with minimal payload (email only)', async () => {
    const req = makeRequest({ email: 'only@example.com' })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json() as { participantId: string }
    expect(data.participantId).toBe('part-001')
  })

  test('returns 201 with null serviceAgreementId when no admin user exists', async () => {
    mockUserFindFirst.mockResolvedValue(null)
    const req = makeRequest({ firstName: 'Jane' })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json() as { serviceAgreementId: string | null }
    expect(data.serviceAgreementId).toBeNull()
  })
})
