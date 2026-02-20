import { z } from 'zod'

export const createPlanSchema = z.object({
  participantId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reviewDate: z.coerce.date().optional(),
  prodaPlanId: z.string().optional(),
  budgetLines: z.array(
    z.object({
      categoryCode: z.string().min(2).max(2),
      categoryName: z.string().min(1),
      allocatedCents: z.number().int().min(0),
    })
  ).min(1, 'At least one budget line is required'),
}).refine((data) => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
})

export const updatePlanSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  reviewDate: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'UNDER_REVIEW', 'INACTIVE']).optional(),
})

export const updateBudgetLineSchema = z.object({
  allocatedCents: z.number().int().min(0).optional(),
  categoryName: z.string().min(1).optional(),
})
