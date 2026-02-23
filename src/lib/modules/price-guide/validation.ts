/**
 * Zod validation schemas for the NDIS Price Guide module.
 * WS-F1 — REQ-014: NDIS Price Guide 2025-26 compliance.
 */

import { z } from 'zod'

export const ImportPriceGuideSchema = z.object({
  label: z.string().min(1).max(100),
  effectiveFrom: z.coerce.date(),
})

export const ListSupportItemsSchema = z.object({
  q: z.string().optional(),
  categoryCode: z.string().optional(),
  versionId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export type ImportPriceGuideInput = z.infer<typeof ImportPriceGuideSchema>
export type ListSupportItemsInput = z.infer<typeof ListSupportItemsSchema>
