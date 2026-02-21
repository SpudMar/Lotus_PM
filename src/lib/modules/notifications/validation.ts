import { z } from 'zod'

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
