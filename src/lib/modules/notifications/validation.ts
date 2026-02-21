import { z } from 'zod'

export const createNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['INFO', 'WARNING', 'ACTION_REQUIRED', 'SUCCESS']),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  link: z.string().max(500).optional(),
  category: z.enum(['INVOICE', 'CLAIM', 'PAYMENT', 'PLAN', 'COMPLIANCE', 'SYSTEM']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS'])).optional(),
})

export const markReadSchema = z.object({
  action: z.literal('read'),
})

export const markAllReadSchema = z.object({
  action: z.literal('read-all'),
})

export const dismissSchema = z.object({
  action: z.literal('dismiss'),
})

export const notificationActionSchema = z.discriminatedUnion('action', [
  markReadSchema,
  markAllReadSchema,
  dismissSchema,
])
