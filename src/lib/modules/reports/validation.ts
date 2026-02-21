import { z } from 'zod'

/** Date range filter for financial reports */
export const dateRangeSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
}).refine(
  (data) => data.periodStart <= data.periodEnd,
  { message: 'periodStart must be before periodEnd' },
)

/** Report type query param */
export const reportTypeSchema = z.object({
  type: z.enum(['dashboard', 'financial', 'compliance', 'providers', 'budget']),
})
