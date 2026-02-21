import { prisma } from '@/lib/db'
import type { NtfCategory, NtfChannel, NtfPriority, NtfType } from '@prisma/client'

// ─── Types ───────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string
  type: NtfType
  title: string
  body: string
  link?: string
  category: NtfCategory
  priority?: NtfPriority
  channels?: NtfChannel[]
}

// ─── Create ──────────────────────────────────────────────

/** Create a single in-app notification for a user */
export async function createNotification(input: CreateNotificationInput) {
  return prisma.ntfNotification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      category: input.category,
      priority: input.priority ?? 'NORMAL',
      channels: input.channels ?? ['IN_APP'],
    },
  })
}

/** Send a notification to all users with a given role */
export async function notifyByRole(
  role: 'DIRECTOR' | 'PLAN_MANAGER' | 'ASSISTANT',
  input: Omit<CreateNotificationInput, 'userId'>,
) {
  const users = await prisma.coreUser.findMany({
    where: { role, isActive: true, deletedAt: null },
    select: { id: true },
  })

  const notifications = await prisma.ntfNotification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      category: input.category,
      priority: input.priority ?? 'NORMAL',
      channels: input.channels ?? ['IN_APP'],
    })),
  })

  return { sent: notifications.count, recipientIds: users.map((u) => u.id) }
}

// ─── List & Read ─────────────────────────────────────────

/** List notifications for a specific user */
export async function listNotifications(params: {
  userId: string
  page: number
  pageSize: number
  unreadOnly?: boolean
  category?: NtfCategory
}) {
  const { userId, page, pageSize, unreadOnly, category } = params
  const where = {
    userId,
    dismissedAt: null,
    ...(unreadOnly ? { readAt: null } : {}),
    ...(category ? { category } : {}),
  }

  const [data, total, unreadCount] = await Promise.all([
    prisma.ntfNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ntfNotification.count({ where }),
    prisma.ntfNotification.count({
      where: { userId, readAt: null, dismissedAt: null },
    }),
  ])

  return { data, total, unreadCount }
}

/** Get unread notification count for a user */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.ntfNotification.count({
    where: { userId, readAt: null, dismissedAt: null },
  })
}

// ─── Mark Read / Dismiss ─────────────────────────────────

/** Mark a single notification as read */
export async function markAsRead(id: string, userId: string) {
  return prisma.ntfNotification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  })
}

/** Mark all notifications as read for a user */
export async function markAllAsRead(userId: string) {
  return prisma.ntfNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
}

/** Dismiss a notification (hides it from the list) */
export async function dismissNotification(id: string, userId: string) {
  return prisma.ntfNotification.updateMany({
    where: { id, userId },
    data: { dismissedAt: new Date() },
  })
}

// ─── Convenience helpers for common notifications ────────

/** Notify PM/Director that a new invoice has arrived */
export async function notifyInvoiceReceived(invoiceNumber: string, providerName: string): Promise<void> {
  const pmAndDirectors = await prisma.coreUser.findMany({
    where: { role: { in: ['DIRECTOR', 'PLAN_MANAGER'] }, isActive: true, deletedAt: null },
    select: { id: true },
  })

  if (pmAndDirectors.length > 0) {
    await prisma.ntfNotification.createMany({
      data: pmAndDirectors.map((u) => ({
        userId: u.id,
        type: 'INFO' as const,
        title: 'New invoice received',
        body: `Invoice ${invoiceNumber} from ${providerName} is ready for review.`,
        link: '/invoices?status=RECEIVED',
        category: 'INVOICE' as const,
        priority: 'NORMAL' as const,
        channels: ['IN_APP'] as NtfChannel[],
      })),
    })
  }
}

/** Notify about NDIS compliance deadline approaching */
export async function notifyComplianceRisk(
  invoiceNumber: string,
  businessDaysElapsed: number,
): Promise<void> {
  const pmAndDirectors = await prisma.coreUser.findMany({
    where: { role: { in: ['DIRECTOR', 'PLAN_MANAGER'] }, isActive: true, deletedAt: null },
    select: { id: true },
  })

  if (pmAndDirectors.length > 0) {
    const isOverdue = businessDaysElapsed > 5
    await prisma.ntfNotification.createMany({
      data: pmAndDirectors.map((u) => ({
        userId: u.id,
        type: (isOverdue ? 'WARNING' : 'ACTION_REQUIRED') as NtfType,
        title: isOverdue ? 'Invoice overdue' : 'Invoice processing deadline approaching',
        body: isOverdue
          ? `Invoice ${invoiceNumber} has exceeded the 5 business day processing window (${businessDaysElapsed} days).`
          : `Invoice ${invoiceNumber} has been pending for ${businessDaysElapsed} business days. NDIS requires processing within 5.`,
        link: '/invoices?status=PENDING_REVIEW',
        category: 'COMPLIANCE' as const,
        priority: (isOverdue ? 'URGENT' : 'HIGH') as NtfPriority,
        channels: ['IN_APP'] as NtfChannel[],
      })),
    })
  }
}

/** Notify that a claim outcome has been received */
export async function notifyClaimOutcome(
  claimReference: string,
  outcome: string,
  approvedAmount: string,
): Promise<void> {
  const pmAndDirectors = await prisma.coreUser.findMany({
    where: { role: { in: ['DIRECTOR', 'PLAN_MANAGER'] }, isActive: true, deletedAt: null },
    select: { id: true },
  })

  if (pmAndDirectors.length > 0) {
    await prisma.ntfNotification.createMany({
      data: pmAndDirectors.map((u) => ({
        userId: u.id,
        type: (outcome === 'REJECTED' ? 'WARNING' : 'SUCCESS') as NtfType,
        title: `Claim ${outcome.toLowerCase()}`,
        body: `Claim ${claimReference} has been ${outcome.toLowerCase()}. Approved: ${approvedAmount}.`,
        link: '/claims',
        category: 'CLAIM' as const,
        priority: (outcome === 'REJECTED' ? 'HIGH' : 'NORMAL') as NtfPriority,
        channels: ['IN_APP'] as NtfChannel[],
      })),
    })
  }
}
