/**
 * Zod validation schemas for the Fund Quarantine module.
 * WS2: Earmarked budget per provider, optionally linked to a service agreement.
 */

import { z } from 'zod'

export const createQuarantineSchema = z.object({
  serviceAgreementId: z.string().cuid('Invalid service agreement ID').optional(),
  budgetLineId: z.string().cuid('Invalid budget line ID'),
  providerId: z.string().cuid('Invalid provider ID'),
  supportItemCode: z.string().max(50).optional(),
  quarantinedCents: z.number().int().positive('Quarantined amount must be a positive integer (cents)'),
  fundingPeriodId: z.string().cuid().optional(),
  notes: z.string().max(2000).optional(),
})

export const updateQuarantineSchema = z.object({
  supportItemCode: z.string().max(50).nullable().optional(),
  quarantinedCents: z.number().int().positive().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export const listQuarantinesSchema = z.object({
  budgetLineId: z.string().cuid().optional(),
  providerId: z.string().cuid().optional(),
  serviceAgreementId: z.string().cuid().optional(),
  status: z.enum(['ACTIVE', 'RELEASED', 'EXPIRED']).optional(),
})

export type CreateQuarantineInput = z.infer<typeof createQuarantineSchema>
export type UpdateQuarantineInput = z.infer<typeof updateQuarantineSchema>
export type ListQuarantinesInput = z.infer<typeof listQuarantinesSchema>
