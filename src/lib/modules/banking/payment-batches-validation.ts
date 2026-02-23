import { z } from 'zod'

export const createBatchSchema = z.object({
  description: z.string().max(255).optional(),
  scheduledDate: z.string().datetime().optional(),
})

export const addPaymentsSchema = z.object({
  paymentIds: z.array(z.string().cuid()).min(1).max(500),
})

export const removePaymentSchema = z.object({
  paymentId: z.string().cuid(),
})

export const batchStatusSchema = z.enum(['PENDING', 'ABA_GENERATED', 'UPLOADED', 'CONFIRMED']).optional()
