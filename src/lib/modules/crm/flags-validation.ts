/**
 * Zod schemas for the Flag/Hold module (WS-F3).
 * Used for input validation in API routes.
 */

import { z } from 'zod'

export const CreateFlagSchema = z
  .object({
    severity: z.enum(['ADVISORY', 'BLOCKING']),
    reason: z.string().min(1).max(1000),
    participantId: z.string().optional(),
    providerId: z.string().optional(),
  })
  .refine(
    (data) => (data.participantId != null) !== (data.providerId != null),
    { message: 'Exactly one of participantId or providerId must be provided' }
  )

export const ResolveFlagSchema = z.object({
  note: z.string().min(1).max(1000),
})

export const ListFlagsSchema = z.object({
  participantId: z.string().optional(),
  providerId: z.string().optional(),
  includeResolved: z.coerce.boolean().default(false),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
})
