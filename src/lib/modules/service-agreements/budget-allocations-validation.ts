/**
 * Zod validation schemas for the SA Budget Allocation feature (WS-F6).
 */

import { z } from 'zod'

export const allocateBudgetSchema = z.object({
  serviceAgreementId: z.string().cuid(),
  budgetLineId: z.string().cuid(),
  allocatedCents: z.number().int().positive(),
  note: z.string().max(500).optional(),
})

export const removeAllocationSchema = z.object({
  id: z.string().cuid(),
})

export type AllocateBudgetInput = z.infer<typeof allocateBudgetSchema>
export type RemoveAllocationInput = z.infer<typeof removeAllocationSchema>
