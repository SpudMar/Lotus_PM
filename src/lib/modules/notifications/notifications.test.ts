/**
 * Unit tests for the notifications module core logic.
 * Prisma client and ClickSend client are mocked.
 */

import { sendSms, sendSmsToStaffByRole, listNotifications } from './notifications'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    notifNotification: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    coreUser: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('./clicksend', () => ({
  sendSmsViaClickSend: jest.fn(),
}))

import { prisma } from '@/lib/db'
import { sendSmsViaClickSend } from './clicksend'
import type { NotifNotification } from '@prisma/client'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendSms = sendSmsViaClickSend as jest.MockedFunction<typeof sendSmsViaClickSend>

function makeNotification(overrides: Partial<NotifNotification> = {}): NotifNotification {
  return {
    id: 'notif-001',
    channel: 'SMS',
    recipient: '+61412345678',
    subject: null,
    message: 'Test message',
    status: 'PENDING',
    externalId: null,
    errorMessage: null,
    sentAt: null,
    participantId: null,
    triggeredById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ─── sendSms ──────────────────────────────────────────────────────────────────

describe('sendSms', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('creates PENDING record, sends via ClickSend, updates to SENT on success', async () => {
    const pendingNotif = makeNotification({ status: 'PENDING' })
    const sentNotif = makeNotification({
      status: 'SENT',
      externalId: 'cs-msg-001',
      sentAt: new Date(),
    })

    ;(mockPrisma.notifNotification.create as jest.Mock).mockResolvedValueOnce(pendingNotif)
    mockSendSms.mockResolvedValueOnce({
      success: true,
      messageId: 'cs-msg-001',
      clickSendStatus: 'SUCCESS',
    })
    ;(mockPrisma.notifNotification.update as jest.Mock).mockResolvedValueOnce(sentNotif)

    const result = await sendSms('+61412345678', 'Test message')

    expect(mockPrisma.notifNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'SMS',
        recipient: '+61412345678',
        message: 'Test message',
        status: 'PENDING',
      }),
    })

    expect(mockSendSms).toHaveBeenCalledWith({
      to: '+61412345678',
      message: 'Test message',
    })

    expect(mockPrisma.notifNotification.update).toHaveBeenCalledWith({
      where: { id: 'notif-001' },
      data: expect.objectContaining({
        status: 'SENT',
        externalId: 'cs-msg-001',
        errorMessage: undefined,
      }),
    })

    expect(result.status).toBe('SENT')
  })

  test('updates record to FAILED when ClickSend delivery fails', async () => {
    const pendingNotif = makeNotification({ status: 'PENDING' })
    const failedNotif = makeNotification({
      status: 'FAILED',
      errorMessage: 'Invalid number',
    })

    ;(mockPrisma.notifNotification.create as jest.Mock).mockResolvedValueOnce(pendingNotif)
    mockSendSms.mockResolvedValueOnce({
      success: false,
      errorMessage: 'Invalid number',
      clickSendStatus: 'INVALID_RECIPIENT',
    })
    ;(mockPrisma.notifNotification.update as jest.Mock).mockResolvedValueOnce(failedNotif)

    const result = await sendSms('+61400000000', 'Test')

    expect(mockPrisma.notifNotification.update).toHaveBeenCalledWith({
      where: { id: 'notif-001' },
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'Invalid number',
      }),
    })

    expect(result.status).toBe('FAILED')
  })

  test('passes participantId and triggeredById when provided', async () => {
    ;(mockPrisma.notifNotification.create as jest.Mock).mockResolvedValueOnce(
      makeNotification({ participantId: 'part-001' })
    )
    mockSendSms.mockResolvedValueOnce({ success: true, messageId: 'msg-x', clickSendStatus: 'SUCCESS' })
    ;(mockPrisma.notifNotification.update as jest.Mock).mockResolvedValueOnce(makeNotification())

    await sendSms('+61412345678', 'Hello', {
      participantId: 'part-001',
      triggeredById: 'user-001',
    })

    expect(mockPrisma.notifNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        participantId: 'part-001',
        triggeredById: 'user-001',
      }),
    })
  })
})

// ─── sendSmsToStaffByRole ─────────────────────────────────────────────────────

describe('sendSmsToStaffByRole', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('sends SMS to all active staff with matching role and phone set', async () => {
    ;(mockPrisma.coreUser.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'user-001', phone: '+61412111111' },
      { id: 'user-002', phone: '+61412222222' },
    ])
    ;(mockPrisma.notifNotification.create as jest.Mock).mockResolvedValue(makeNotification())
    mockSendSms.mockResolvedValue({ success: true, messageId: 'msg-x', clickSendStatus: 'SUCCESS' })
    ;(mockPrisma.notifNotification.update as jest.Mock).mockResolvedValue(makeNotification())

    await sendSmsToStaffByRole('DIRECTOR', 'Budget alert!')

    expect(mockPrisma.coreUser.findMany).toHaveBeenCalledWith({
      where: { role: 'DIRECTOR', isActive: true, deletedAt: null, phone: { not: null } },
      select: { id: true, phone: true },
    })

    // Should have created 2 notification records
    expect(mockPrisma.notifNotification.create).toHaveBeenCalledTimes(2)
  })

  test('does nothing when no staff have phones set', async () => {
    ;(mockPrisma.coreUser.findMany as jest.Mock).mockResolvedValueOnce([])

    await sendSmsToStaffByRole('PLAN_MANAGER', 'Alert!')

    expect(mockPrisma.notifNotification.create).not.toHaveBeenCalled()
    expect(mockSendSms).not.toHaveBeenCalled()
  })
})

// ─── listNotifications ────────────────────────────────────────────────────────

describe('listNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('queries with default limit and offset', async () => {
    ;(mockPrisma.notifNotification.findMany as jest.Mock).mockResolvedValueOnce([])

    await listNotifications()

    expect(mockPrisma.notifNotification.findMany).toHaveBeenCalledWith({
      where: { channel: undefined, status: undefined, participantId: undefined },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    })
  })

  test('applies channel and status filters', async () => {
    ;(mockPrisma.notifNotification.findMany as jest.Mock).mockResolvedValueOnce([])

    await listNotifications({ channel: 'SMS', status: 'FAILED', limit: 10, offset: 20 })

    expect(mockPrisma.notifNotification.findMany).toHaveBeenCalledWith({
      where: { channel: 'SMS', status: 'FAILED', participantId: undefined },
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 20,
    })
  })
})
