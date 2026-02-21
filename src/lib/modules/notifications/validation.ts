import { z } from 'zod'

// ── In-app / DB notification schemas ──────────────────────────────────────────

export const createNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['INFO', 'WARNING', 'ACTION_REQUIRED', 'SUCCESS']),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  link: z.string().optional(),
  category: z.enum(['INVOICE', 'CLAIM', 'PAYMENT', 'PLAN', 'COMPLIANCE', 'SYSTEM']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS'])).optional(),
})

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>

export const notificationActionSchema = z.object({
  action: z.enum(['read', 'read-all', 'dismiss']),
  notificationId: z.string().optional(),
})

export type NotificationActionInput = z.infer<typeof notificationActionSchema>

// ── SMS schemas ────────────────────────────────────────────────────────────────

/**
 * Validates phone numbers in common Australian formats.
 * Accepts: +61XXXXXXXXX, 04XXXXXXXX, 61XXXXXXXXX
 * The clicksend module normalises to E.164 before sending.
 */
const phoneSchema = z
  .string()
  .min(8)
  .max(20)
  .regex(
    /^\+?[0-9\s\-().]{8,20}$/,
    'Invalid phone number — use format +61XXXXXXXXX or 04XXXXXXXX'
  )

export const sendSmsSchema = z.object({
  to: phoneSchema,
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1600, 'Message exceeds 10 SMS parts (1,600 chars max)'),
  participantId: z.string().cuid().optional(),
})

export type SendSmsInput = z.infer<typeof sendSmsSchema>
