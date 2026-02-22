/**
 * Unit tests for Participant Invoice Approval Module — WS7
 *
 * Covers:
 *   - JWT token generation and verification
 *   - Token expiry and tampering rejection
 *   - hashToken determinism
 *   - requestParticipantApproval: creates token, updates invoice, throws if disabled
 *   - processApprovalResponse: APPROVED / REJECTED paths, expired/used token rejection
 *   - skipExpiredApprovals: updates correct invoices, returns count
 *   - getApprovalStatus: returns status without hash, respects token validity
 *   - Single-use enforcement (second call with same token fails)
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    crmParticipant: {
      findFirst: jest.fn(),
    },
    notifEmailTemplate: {
      findFirst: jest.fn(),
    },
    notifNotification: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/modules/notifications/notifications', () => ({
  createNotificationRecord: jest.fn().mockResolvedValue({ id: 'notif-1' }),
}))

jest.mock('@/lib/modules/notifications/email-send', () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({ id: 'sent-1' }),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import {
  generateApprovalToken,
  verifyApprovalToken,
  hashToken,
  requestParticipantApproval,
  processApprovalResponse,
  skipExpiredApprovals,
  getApprovalStatus,
} from './participant-approval'

// ── Casts ─────────────────────────────────────────────────────────────────────

const mockInvoice = prisma.invInvoice as jest.Mocked<typeof prisma.invInvoice>
const mockEmailTemplate = prisma.notifEmailTemplate as jest.Mocked<typeof prisma.notifEmailTemplate>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PARTICIPANT_ID = 'part-001'
const INVOICE_ID = 'inv-001'

function makeParticipant(overrides: Partial<{
  invoiceApprovalEnabled: boolean
  invoiceApprovalMethod: 'APP' | 'EMAIL' | 'SMS' | null
  email: string | null
  phone: string | null
}> = {}) {
  return {
    id: PARTICIPANT_ID,
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '+61400000000',
    invoiceApprovalEnabled: true,
    invoiceApprovalMethod: 'APP' as const,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<{
  status: string
  participantId: string | null
  approvalTokenHash: string | null
  approvalTokenExpiresAt: Date | null
}> = {}) {
  return {
    id: INVOICE_ID,
    participantId: PARTICIPANT_ID,
    totalCents: 15000,
    invoiceDate: new Date('2026-02-01'),
    invoiceNumber: 'INV-001',
    status: 'PENDING_REVIEW',
    participant: makeParticipant(),
    provider: { id: 'prov-1', name: 'Allied Health Co' },
    approvalTokenHash: null,
    approvalTokenExpiresAt: null,
    deletedAt: null,
    ...overrides,
  }
}

// ── JWT Helpers ───────────────────────────────────────────────────────────────

describe('generateApprovalToken + verifyApprovalToken', () => {
  it('generates a token that can be verified', () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const payload = verifyApprovalToken(token)
    expect(payload.invoiceId).toBe(INVOICE_ID)
    expect(payload.participantId).toBe(PARTICIPANT_ID)
    expect(payload.jti).toBeTruthy()
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
  })

  it('token has correct 3-part JWT structure', () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    expect(token.split('.')).toHaveLength(3)
  })

  it('rejects a token with tampered signature', () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const [header, body] = token.split('.')
    const tampered = `${header}.${body}.invalidsignature`
    expect(() => verifyApprovalToken(tampered)).toThrow('Invalid token signature')
  })

  it('rejects a token with tampered body', () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const parts = token.split('.')
    // Modify the body to change the invoiceId
    const fakePayload = { invoiceId: 'other-id', participantId: PARTICIPANT_ID, jti: 'x', exp: 9999999999, iat: 0 }
    const fakeBody = Buffer.from(JSON.stringify(fakePayload)).toString('base64url')
    const tampered = `${parts[0]}.${fakeBody}.${parts[2]}`
    expect(() => verifyApprovalToken(tampered)).toThrow('Invalid token signature')
  })

  it('rejects a token that is not 3 parts', () => {
    expect(() => verifyApprovalToken('notavalidtoken')).toThrow('Invalid token format')
    expect(() => verifyApprovalToken('a.b')).toThrow('Invalid token format')
  })

  it('rejects an expired token', () => {
    // Build a token with exp in the past
    const { createHmac } = require('crypto') as typeof import('crypto')
    const secret = 'dev-approval-secret-change-in-prod'
    const payload = {
      invoiceId: INVOICE_ID,
      participantId: PARTICIPANT_ID,
      jti: 'test-jti',
      exp: Math.floor(Date.now() / 1000) - 1, // already expired
      iat: Math.floor(Date.now() / 1000) - 100,
    }
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const expiredToken = `${header}.${body}.${sig}`
    expect(() => verifyApprovalToken(expiredToken)).toThrow('Token expired')
  })
})

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('produces different hashes for different tokens', () => {
    const t1 = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const t2 = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    // Two different tokens (different jti) → different hashes
    expect(hashToken(t1)).not.toBe(hashToken(t2))
  })

  it('returns a hex string', () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    expect(hashToken(token)).toMatch(/^[0-9a-f]+$/)
  })
})

// ── requestParticipantApproval ────────────────────────────────────────────────

describe('requestParticipantApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEmailTemplate.findFirst.mockResolvedValue(null)
  })

  it('creates a token and updates invoice status to PENDING_PARTICIPANT_APPROVAL', async () => {
    mockInvoice.findFirst.mockResolvedValue(makeInvoice() as never)
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)

    const result = await requestParticipantApproval(INVOICE_ID, 'user-1')

    expect(result.token).toBeTruthy()
    expect(result.token.split('.')).toHaveLength(3)
    expect(mockInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({
          status: 'PENDING_PARTICIPANT_APPROVAL',
          participantApprovalStatus: 'PENDING',
          approvalTokenHash: expect.any(String),
          approvalTokenExpiresAt: expect.any(Date),
          approvalSentAt: expect.any(Date),
        }),
      })
    )
  })

  it('throws if the invoice is not found', async () => {
    mockInvoice.findFirst.mockResolvedValue(null)
    await expect(requestParticipantApproval(INVOICE_ID, 'user-1')).rejects.toThrow('NOT_FOUND')
  })

  it('throws if the invoice has no participant', async () => {
    mockInvoice.findFirst.mockResolvedValue({ ...makeInvoice(), participant: null } as never)
    await expect(requestParticipantApproval(INVOICE_ID, 'user-1')).rejects.toThrow(
      'Participant approval not enabled for this participant'
    )
  })

  it('throws if invoiceApprovalEnabled is false', async () => {
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({ participant: makeParticipant({ invoiceApprovalEnabled: false }) } as never) as never
    )
    await expect(requestParticipantApproval(INVOICE_ID, 'user-1')).rejects.toThrow(
      'Participant approval not enabled for this participant'
    )
  })

  it('sends via EMAIL method when participant has email and template exists', async () => {
    const { sendTemplatedEmail } = jest.requireMock('@/lib/modules/notifications/email-send') as {
      sendTemplatedEmail: jest.Mock
    }
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({ participant: makeParticipant({ invoiceApprovalMethod: 'EMAIL' }) } as never) as never
    )
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)
    mockEmailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      isActive: true,
      type: 'APPROVAL_REQUEST',
    } as never)

    await requestParticipantApproval(INVOICE_ID, 'user-1')

    expect(sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'tmpl-1',
        recipientEmail: 'jane@example.com',
        mergeFieldValues: expect.objectContaining({
          first_name: 'Jane',
          approval_url: expect.stringContaining('/approval/'),
        }),
      })
    )
  })

  it('falls back to notification record for EMAIL without template', async () => {
    const { createNotificationRecord } = jest.requireMock(
      '@/lib/modules/notifications/notifications'
    ) as { createNotificationRecord: jest.Mock }
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({ participant: makeParticipant({ invoiceApprovalMethod: 'EMAIL' }) } as never) as never
    )
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)
    mockEmailTemplate.findFirst.mockResolvedValue(null)

    await requestParticipantApproval(INVOICE_ID, 'user-1')

    expect(createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'EMAIL' })
    )
  })

  it('sends SMS notification for SMS method', async () => {
    const { createNotificationRecord } = jest.requireMock(
      '@/lib/modules/notifications/notifications'
    ) as { createNotificationRecord: jest.Mock }
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({ participant: makeParticipant({ invoiceApprovalMethod: 'SMS' }) } as never) as never
    )
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)

    await requestParticipantApproval(INVOICE_ID, 'user-1')

    expect(createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'SMS' })
    )
  })

  it('sends IN_APP notification for APP method', async () => {
    const { createNotificationRecord } = jest.requireMock(
      '@/lib/modules/notifications/notifications'
    ) as { createNotificationRecord: jest.Mock }
    mockInvoice.findFirst.mockResolvedValue(makeInvoice() as never)
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)

    await requestParticipantApproval(INVOICE_ID, 'user-1')

    expect(createNotificationRecord).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'IN_APP' })
    )
  })
})

// ── processApprovalResponse ───────────────────────────────────────────────────

describe('processApprovalResponse', () => {
  beforeEach(() => jest.clearAllMocks())

  it('APPROVED: sets status to APPROVED and clears token hash', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const tokenHash = hashToken(token)
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: tokenHash,
      }) as never
    )
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)

    await processApprovalResponse(token, 'APPROVED')

    expect(mockInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({
          status: 'APPROVED',
          participantApprovalStatus: 'APPROVED',
          approvalTokenHash: null,
          participantApprovedAt: expect.any(Date),
        }),
      })
    )
  })

  it('REJECTED: sets status to PENDING_REVIEW and clears token hash', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const tokenHash = hashToken(token)
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: tokenHash,
      }) as never
    )
    mockInvoice.update.mockResolvedValue(makeInvoice() as never)

    await processApprovalResponse(token, 'REJECTED')

    expect(mockInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({
          status: 'PENDING_REVIEW',
          participantApprovalStatus: 'REJECTED',
          approvalTokenHash: null,
        }),
      })
    )
  })

  it('throws NOT_FOUND if invoice does not exist', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    mockInvoice.findFirst.mockResolvedValue(null)
    await expect(processApprovalResponse(token, 'APPROVED')).rejects.toThrow('NOT_FOUND')
  })

  it('throws Token already used if approvalTokenHash is null (already cleared)', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: null,
      }) as never
    )
    await expect(processApprovalResponse(token, 'APPROVED')).rejects.toThrow('Token already used')
  })

  it('throws Token already used if hash does not match (tampered or reused)', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: 'different-hash',
      }) as never
    )
    await expect(processApprovalResponse(token, 'APPROVED')).rejects.toThrow('Token already used')
  })

  it('throws if invoice status is not PENDING_PARTICIPANT_APPROVAL', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const tokenHash = hashToken(token)
    mockInvoice.findFirst.mockResolvedValue(
      makeInvoice({
        status: 'APPROVED',
        approvalTokenHash: tokenHash,
      }) as never
    )
    await expect(processApprovalResponse(token, 'APPROVED')).rejects.toThrow(
      'Invoice is not pending participant approval'
    )
  })

  it('rejects an expired token before DB lookup', async () => {
    const { createHmac } = require('crypto') as typeof import('crypto')
    const secret = 'dev-approval-secret-change-in-prod'
    const payload = {
      invoiceId: INVOICE_ID,
      participantId: PARTICIPANT_ID,
      jti: 'x',
      exp: Math.floor(Date.now() / 1000) - 10,
      iat: Math.floor(Date.now() / 1000) - 100,
    }
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const expiredToken = `${header}.${body}.${sig}`

    await expect(processApprovalResponse(expiredToken, 'APPROVED')).rejects.toThrow('Token expired')
  })

  it('enforces single-use: second call with same token fails because hash is cleared', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    const tokenHash = hashToken(token)

    // First call succeeds
    mockInvoice.findFirst.mockResolvedValueOnce(
      makeInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: tokenHash,
      }) as never
    )
    mockInvoice.update.mockResolvedValueOnce(makeInvoice() as never)
    await processApprovalResponse(token, 'APPROVED')

    // Second call: approvalTokenHash is now null (cleared by first call)
    mockInvoice.findFirst.mockResolvedValueOnce(
      makeInvoice({
        status: 'APPROVED',
        approvalTokenHash: null,
      }) as never
    )

    // Fails because status is no longer PENDING_PARTICIPANT_APPROVAL (or hash is null)
    await expect(processApprovalResponse(token, 'APPROVED')).rejects.toThrow()
  })
})

// ── skipExpiredApprovals ──────────────────────────────────────────────────────

describe('skipExpiredApprovals', () => {
  beforeEach(() => jest.clearAllMocks())

  it('skips invoices with expired tokens and returns count', async () => {
    const expired = [
      { id: 'inv-a', participantId: 'part-1' },
      { id: 'inv-b', participantId: 'part-2' },
    ]
    mockInvoice.findMany.mockResolvedValue(expired as never)
    mockInvoice.updateMany.mockResolvedValue({ count: 2 } as never)

    const count = await skipExpiredApprovals()

    expect(count).toBe(2)
    expect(mockInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['inv-a', 'inv-b'] } },
        data: expect.objectContaining({
          status: 'PENDING_REVIEW',
          participantApprovalStatus: 'SKIPPED',
          approvalTokenHash: null,
          approvalSkippedAt: expect.any(Date),
        }),
      })
    )
  })

  it('returns 0 and does not call updateMany when no expired invoices', async () => {
    mockInvoice.findMany.mockResolvedValue([] as never)

    const count = await skipExpiredApprovals()

    expect(count).toBe(0)
    expect(mockInvoice.updateMany).not.toHaveBeenCalled()
  })

  it('queries for PENDING_PARTICIPANT_APPROVAL status with expired tokens', async () => {
    mockInvoice.findMany.mockResolvedValue([] as never)
    await skipExpiredApprovals()

    expect(mockInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING_PARTICIPANT_APPROVAL',
          approvalTokenExpiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      })
    )
  })
})

// ── getApprovalStatus ─────────────────────────────────────────────────────────

describe('getApprovalStatus', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns invoice status without sensitive data', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    mockInvoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      status: 'PENDING_PARTICIPANT_APPROVAL',
      participantApprovalStatus: 'PENDING',
      totalCents: 15000,
      invoiceDate: new Date('2026-02-01'),
      provider: { name: 'Allied Health Co' },
    } as never)

    const result = await getApprovalStatus(token)

    expect(result.invoiceId).toBe(INVOICE_ID)
    expect(result.status).toBe('PENDING_PARTICIPANT_APPROVAL')
    expect(result.participantApprovalStatus).toBe('PENDING')
    expect(result.totalCents).toBe(15000)
    expect(result.providerName).toBe('Allied Health Co')
    // approvalTokenHash must NOT be present
    expect(result).not.toHaveProperty('approvalTokenHash')
  })

  it('throws NOT_FOUND if invoice does not exist', async () => {
    const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
    mockInvoice.findFirst.mockResolvedValue(null)
    await expect(getApprovalStatus(token)).rejects.toThrow('NOT_FOUND')
  })

  it('throws for expired token', () => {
    const { createHmac } = require('crypto') as typeof import('crypto')
    const secret = 'dev-approval-secret-change-in-prod'
    const payload = {
      invoiceId: INVOICE_ID,
      participantId: PARTICIPANT_ID,
      jti: 'x',
      exp: Math.floor(Date.now() / 1000) - 1,
      iat: 0,
    }
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const expired = `${header}.${body}.${sig}`
    expect(getApprovalStatus(expired)).rejects.toThrow('Token expired')
  })
})
