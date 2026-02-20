import { z } from 'zod'

export const createInvoiceSchema = z.object({
  participantId: z.string().cuid(),
  providerId: z.string().cuid(),
  planId: z.string().cuid().optional(),
  invoiceNumber: z.string().min(1, 'Invoice number is required').max(50),
  invoiceDate: z.coerce.date(),
  subtotalCents: z.number().int().min(0),
  gstCents: z.number().int().min(0).default(0),
  totalCents: z.number().int().min(1, 'Total must be greater than zero'),
  lines: z.array(
    z.object({
      supportItemCode: z.string().min(1),
      supportItemName: z.string().min(1),
      categoryCode: z.string().min(2).max(2),
      serviceDate: z.coerce.date(),
      quantity: z.number().min(0),
      unitPriceCents: z.number().int().min(0),
      totalCents: z.number().int().min(0),
      gstCents: z.number().int().min(0).default(0),
      budgetLineId: z.string().cuid().optional(),
    })
  ).optional(),
})

export const approveInvoiceSchema = z.object({
  planId: z.string().cuid().optional(),
})

export const rejectInvoiceSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
})
