/**
 * Zod validation schemas for the Service Agreements module.
 */

import { z } from 'zod'

export const createServiceAgreementSchema = z.object({
  participantId: z.string().cuid('Invalid participant ID'),
  providerId: z.string().cuid('Invalid provider ID'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reviewDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  managedById: z.string().cuid('Invalid manager ID'),
}).refine((data) => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
})

export const updateServiceAgreementSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  reviewDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  managedById: z.string().cuid().optional(),
})

export const listServiceAgreementsSchema = z.object({
  participantId: z.string().cuid().optional(),
  providerId: z.string().cuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED']).optional(),
})

export const createRateLineSchema = z.object({
  categoryCode: z.string().min(1).max(10),
  categoryName: z.string().min(1).max(255),
  supportItemCode: z.string().max(50).optional(),
  supportItemName: z.string().max(255).optional(),
  agreedRateCents: z.number().int().min(0),
  maxQuantity: z.number().min(0).optional(),
  unitType: z.string().max(50).optional(),
})

export const updateRateLineSchema = z.object({
  categoryCode: z.string().min(1).max(10).optional(),
  categoryName: z.string().min(1).max(255).optional(),
  supportItemCode: z.string().max(50).nullable().optional(),
  supportItemName: z.string().max(255).nullable().optional(),
  agreedRateCents: z.number().int().min(0).optional(),
  maxQuantity: z.number().min(0).nullable().optional(),
  unitType: z.string().max(50).nullable().optional(),
})

export type CreateServiceAgreementInput = z.infer<typeof createServiceAgreementSchema>
export type UpdateServiceAgreementInput = z.infer<typeof updateServiceAgreementSchema>
export type ListServiceAgreementsInput = z.infer<typeof listServiceAgreementsSchema>
export type CreateRateLineInput = z.infer<typeof createRateLineSchema>
export type UpdateRateLineInput = z.infer<typeof updateRateLineSchema>
