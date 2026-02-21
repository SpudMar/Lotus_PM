/**
 * Notifications Module — core send/track logic.
 *
 * All notifications (SMS, future Email/In-App) are recorded in notif_notifications
 * for audit and compliance purposes (REQ-010: 5-year retention for payments/invoices).
 */

import { prisma } from '@/lib/db'
import type { NotifNotification } from '@prisma/client'
import { sendSmsViaClickSend } from './clicksend'
import type { CreateNotificationInput } from './types'

// ─── Core send: SMS ───────────────────────────────────────────────────────────

/**
 * Send an SMS and record the result in notif_notifications.
 * Returns the persisted notification record.
 */
export async function sendSms(
  to: string,
  message: string,
  opts: { participantId?: string; triggeredById?: string } = {}
): Promise<NotifNotification> {
  // Create the record in PENDING state first
  const notification = await prisma.notifNotification.create({
    data: {
      channel: 'SMS',
      recipient: to,
      message,
      status: 'PENDING',
      participantId: opts.participantId,
      triggeredById: opts.triggeredById,
    },
  })

  // Attempt delivery via ClickSend
  const result = await sendSmsViaClickSend({ to, message })

  // Update the record with the delivery result
  const updated = await prisma.notifNotification.update({
    where: { id: notification.id },
    data: {
      status: result.success ? 'SENT' : 'FAILED',
      externalId: result.messageId,
      errorMessage: result.errorMessage,
      sentAt: result.success ? new Date() : undefined,
    },
  })

  return updated
}

// ─── Bulk SMS: notify staff by role ──────────────────────────────────────────

/**
 * Send an SMS to all active staff users with a given role who have a phone number set.
 * Used by the automation engine's NOTIFY_STAFF action.
 */
export async function sendSmsToStaffByRole(
  role: 'DIRECTOR' | 'PLAN_MANAGER' | 'ASSISTANT',
  message: string
): Promise<void> {
  const staffWithPhones = await prisma.coreUser.findMany({
    where: {
      role,
      isActive: true,
      deletedAt: null,
      phone: { not: null },
    },
    select: { id: true, phone: true },
  })

  if (staffWithPhones.length === 0) return

  await Promise.allSettled(
    staffWithPhones.map((user) =>
      sendSms(user.phone!, message, { triggeredById: undefined })
    )
  )
}

// ─── Record (without sending) ─────────────────────────────────────────────────

/**
 * Create a notification record without sending — useful for IN_APP channel
 * or when the send happens outside this module.
 */
export async function createNotificationRecord(
  input: CreateNotificationInput
): Promise<NotifNotification> {
  return prisma.notifNotification.create({
    data: {
      channel: input.channel,
      recipient: input.recipient,
      message: input.message,
      subject: input.subject,
      status: 'PENDING',
      participantId: input.participantId,
      triggeredById: input.triggeredById,
    },
  })
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface ListNotificationsFilter {
  channel?: 'SMS' | 'EMAIL' | 'IN_APP'
  status?: 'PENDING' | 'SENT' | 'FAILED' | 'DELIVERED' | 'UNDELIVERED'
  participantId?: string
  limit?: number
  offset?: number
}

export async function listNotifications(filter: ListNotificationsFilter = {}): Promise<NotifNotification[]> {
  return prisma.notifNotification.findMany({
    where: {
      channel: filter.channel,
      status: filter.status,
      participantId: filter.participantId,
    },
    orderBy: { createdAt: 'desc' },
    take: filter.limit ?? 50,
    skip: filter.offset ?? 0,
  })
}
