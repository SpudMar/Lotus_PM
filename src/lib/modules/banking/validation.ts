import { z } from 'zod'

/** Create a payment from an approved claim */
export const createPaymentSchema = z.object({
  claimId: z.string().cuid(),
  amountCents: z.number().int().min(1, 'Amount must be greater than zero'),
  bsb: z.string().regex(/^\d{3}-?\d{3}$/, 'BSB must be 6 digits (e.g. 062-000)'),
  accountNumber: z.string().min(5).max(9),
  accountName: z.string().min(1).max(32),
  reference: z.string().max(18).optional(),
})

/** Generate an ABA file from pending payments */
export const generateAbaSchema = z.object({
  paymentIds: z.array(z.string().cuid()).min(1, 'At least one payment is required'),
})

/** Mark ABA file as submitted to bank */
export const submitAbaSchema = z.object({
  bankReference: z.string().min(1).max(50),
})

/** Mark payments as cleared/reconciled */
export const reconcilePaymentsSchema = z.object({
  paymentIds: z.array(z.string().cuid()).min(1),
})
