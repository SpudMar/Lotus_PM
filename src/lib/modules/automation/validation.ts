import { z } from 'zod'

// ─── Condition schema ─────────────────────────────────────────────────────────

export const conditionOperatorSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'])

export const autoConditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  op: conditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
})

// ─── Action schemas ───────────────────────────────────────────────────────────

export const logCommActionSchema = z.object({
  type: z.literal('LOG_COMM'),
  params: z.object({
    message: z.string().min(1, 'Message is required').max(1000),
    participantId: z.string().cuid().optional(),
  }),
})

export const notifyStaffActionSchema = z.object({
  type: z.literal('NOTIFY_STAFF'),
  params: z.object({
    message: z.string().min(1, 'Message is required').max(1000),
    notifyRole: z.enum(['GLOBAL_ADMIN', 'PLAN_MANAGER', 'ASSISTANT']),
  }),
})

export const autoActionSchema = z.discriminatedUnion('type', [
  logCommActionSchema,
  notifyStaffActionSchema,
])

// ─── Rule create/update schemas ───────────────────────────────────────────────

const baseRuleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  conditions: z.array(autoConditionSchema).min(1, 'At least one condition is required'),
  actions: z.array(autoActionSchema).min(1, 'At least one action is required'),
})

export const createEventRuleSchema = baseRuleSchema.extend({
  triggerType: z.literal('EVENT'),
  triggerEvent: z.string().min(1, 'Trigger event is required'),
  cronExpression: z.undefined().optional(),
})

export const createScheduleRuleSchema = baseRuleSchema.extend({
  triggerType: z.literal('SCHEDULE'),
  cronExpression: z.string().min(1, 'Cron expression is required').regex(
    /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/,
    'Invalid cron expression'
  ),
  triggerEvent: z.undefined().optional(),
})

export const createRuleSchema = z.discriminatedUnion('triggerType', [
  createEventRuleSchema,
  createScheduleRuleSchema,
])

export const updateRuleSchema = baseRuleSchema.partial().extend({
  triggerType: z.enum(['EVENT', 'SCHEDULE']).optional(),
  triggerEvent: z.string().optional(),
  cronExpression: z.string().optional(),
})

export type CreateRuleInput = z.infer<typeof createRuleSchema>
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>
