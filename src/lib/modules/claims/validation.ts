import { z } from 'zod'

/** Create a claim from an approved invoice */
export const createClaimSchema = z.object({
  invoiceId: z.string().cuid(),
  lines: z.array(
    z.object({
      invoiceLineId: z.string().cuid().optional(),
      supportItemCode: z.string().min(1),
      supportItemName: z.string().min(1),
      categoryCode: z.string().min(2).max(2),
      serviceDate: z.coerce.date(),
      quantity: z.number().min(0),
      unitPriceCents: z.number().int().min(0),
      totalCents: z.number().int().min(0),
      gstCents: z.number().int().min(0).default(0),
    })
  ).min(1, 'At least one claim line is required'),
})

/** Submit a claim (mark as submitted to NDIA) */
export const submitClaimSchema = z.object({
  prodaReference: z.string().optional(),
  notes: z.string().max(500).optional(),
})

/** Record the outcome of a claim from NDIA */
export const recordOutcomeSchema = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED', 'PARTIAL']),
  approvedCents: z.number().int().min(0),
  outcomeNotes: z.string().max(1000).optional(),
  lineOutcomes: z.array(
    z.object({
      claimLineId: z.string().cuid(),
      status: z.enum(['APPROVED', 'REJECTED', 'PARTIAL']),
      approvedCents: z.number().int().min(0),
      outcomeNotes: z.string().max(500).optional(),
    })
  ).optional(),
})

/** Create a batch for bulk claim submission */
export const createBatchSchema = z.object({
  claimIds: z.array(z.string().cuid()).min(1, 'At least one claim is required'),
  notes: z.string().max(500).optional(),
})

/** Submit a batch */
export const submitBatchSchema = z.object({
  prodaBatchId: z.string().optional(),
  notes: z.string().max(500).optional(),
})
