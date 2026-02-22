/**
 * Automation Rule Engine
 *
 * Evaluates conditions against a trigger context and executes actions
 * when all conditions are satisfied. Logs every execution to auto_execution_logs.
 */

import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { AutoCondition, AutoAction, TriggerContext, RuleExecutionResult } from './types'
import { sendSmsToStaffByRole } from '@/lib/modules/notifications/notifications'
import { sendTemplatedEmail } from '@/lib/modules/notifications/email-send'

// ─── Condition evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a single condition against the trigger context.
 * Returns true if the condition is satisfied.
 */
export function evaluateCondition(condition: AutoCondition, context: TriggerContext): boolean {
  const contextValue = context[condition.field]

  // Field not present in context — condition cannot be satisfied
  if (contextValue === undefined || contextValue === null) return false

  const { op, value } = condition

  switch (op) {
    case 'eq':
      return contextValue === value
    case 'ne':
      return contextValue !== value
    case 'gt':
      return typeof contextValue === 'number' && typeof value === 'number' && contextValue > value
    case 'gte':
      return typeof contextValue === 'number' && typeof value === 'number' && contextValue >= value
    case 'lt':
      return typeof contextValue === 'number' && typeof value === 'number' && contextValue < value
    case 'lte':
      return typeof contextValue === 'number' && typeof value === 'number' && contextValue <= value
    case 'contains':
      return (
        typeof contextValue === 'string' &&
        typeof value === 'string' &&
        contextValue.toLowerCase().includes(value.toLowerCase())
      )
    default:
      return false
  }
}

/**
 * Evaluate all conditions for a rule. Returns true if ALL conditions pass.
 */
export function evaluateConditions(conditions: AutoCondition[], context: TriggerContext): boolean {
  if (conditions.length === 0) return true
  return conditions.every((c) => evaluateCondition(c, context))
}

// ─── Template interpolation ───────────────────────────────────────────────────

/**
 * Replace {field} placeholders in a message template with context values.
 * e.g. "Budget for {categoryCode} is at {usedPercent}%" with context
 *      { categoryCode: "01", usedPercent: 85 } → "Budget for 01 is at 85%"
 */
export function interpolateTemplate(template: string, context: TriggerContext): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = context[key]
    return val !== undefined && val !== null ? String(val) : `{${key}}`
  })
}

// ─── Action execution ─────────────────────────────────────────────────────────

/**
 * Execute a single action. Returns true on success, false on failure.
 */
async function executeAction(action: AutoAction, context: TriggerContext): Promise<boolean> {
  try {
    switch (action.type) {
      case 'LOG_COMM': {
        const message = interpolateTemplate(action.params.message, context)
        const participantId =
          action.params.participantId ??
          (typeof context['participantId'] === 'string' ? context['participantId'] : undefined)

        // We need a system user ID for comm log — use a sentinel value; real implementations
        // would resolve a "system" CoreUser row. Skip silently if no participant is resolvable.
        if (!participantId) return true

        await prisma.crmCommLog.create({
          data: {
            type: 'NOTE',
            direction: 'INTERNAL',
            subject: 'Automation Rule',
            body: message,
            participantId,
            // userId is required — use a placeholder that downstream can filter
            // In production this would be a dedicated "system" user cuid
            userId: 'system',
          },
        })
        return true
      }

      case 'NOTIFY_STAFF': {
        const message = interpolateTemplate(action.params.message, context)
        await sendSmsToStaffByRole(action.params.notifyRole, message)
        return true
      }

      case 'SEND_EMAIL': {
        const recipientType = action.params.recipientType
        let recipientEmail: string | undefined

        if (recipientType === 'custom') {
          recipientEmail = action.params.customEmail
        } else if (recipientType === 'participant') {
          const participantId =
            typeof context['participantId'] === 'string' ? context['participantId'] : undefined
          if (participantId) {
            const participant = await prisma.crmParticipant.findUnique({
              where: { id: participantId },
              select: { email: true },
            })
            recipientEmail = participant?.email ?? undefined
          }
        }
        // 'staff' type: not resolved here — would require a specific user ID in context
        // Skipped gracefully if no email resolved

        if (!recipientEmail) return true // no recipient to send to — skip silently

        const mergeValues: Record<string, string> = {}
        for (const [k, v] of Object.entries(context)) {
          if (v !== null && v !== undefined) {
            mergeValues[k] = String(v)
          }
        }

        await sendTemplatedEmail({
          templateId: action.params.templateId,
          recipientEmail,
          mergeFieldValues: mergeValues,
          triggeredById: undefined,
        })
        return true
      }

      default:
        return false
    }
  } catch {
    return false
  }
}

// ─── Rule execution ───────────────────────────────────────────────────────────

/**
 * Trigger a specific rule with the given context.
 * Evaluates conditions, runs actions if conditions pass, and logs the execution.
 */
export async function triggerRule(
  ruleId: string,
  context: TriggerContext,
  triggeredBy: string
): Promise<RuleExecutionResult> {
  const start = Date.now()

  const rule = await prisma.autoRule.findFirst({
    where: { id: ruleId, deletedAt: null },
  })

  if (!rule) {
    return { ruleId, result: 'FAILED', actionsRun: 0, errorMessage: 'Rule not found', durationMs: 0 }
  }

  let result: 'SUCCESS' | 'SKIPPED' | 'FAILED' = 'SUCCESS'
  let actionsRun = 0
  let errorMessage: string | undefined

  try {
    const conditions = rule.conditions as unknown as AutoCondition[]
    const actions = rule.actions as unknown as AutoAction[]

    const conditionsMet = evaluateConditions(conditions, context)

    if (!conditionsMet) {
      result = 'SKIPPED'
    } else {
      for (const action of actions) {
        const ok = await executeAction(action, context)
        if (ok) actionsRun++
      }
      if (actionsRun === 0 && actions.length > 0) {
        result = 'FAILED'
        errorMessage = 'All actions failed'
      }
    }
  } catch (err) {
    result = 'FAILED'
    errorMessage = err instanceof Error ? err.message : 'Unknown error'
  }

  const durationMs = Date.now() - start

  // Log execution
  await prisma.autoExecutionLog.create({
    data: {
      ruleId,
      triggeredBy,
      context: context as unknown as Prisma.InputJsonObject,
      result,
      actionsRun,
      errorMessage,
      durationMs,
    },
  })

  // Update rule stats (only for non-SKIPPED executions, or always — track all)
  await prisma.autoRule.update({
    where: { id: ruleId },
    data: {
      lastTriggeredAt: new Date(),
      executionCount: { increment: 1 },
    },
  })

  return { ruleId, result, actionsRun, errorMessage, durationMs }
}

/**
 * Process an incoming event: find matching rules and trigger each one.
 * Called when an EventBridge event arrives (or is simulated in dev).
 */
export async function processEvent(
  eventType: string,
  context: TriggerContext
): Promise<RuleExecutionResult[]> {
  const rules = await prisma.autoRule.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      triggerType: 'EVENT',
      triggerEvent: eventType,
    },
    select: { id: true },
  })

  return Promise.all(rules.map((r) => triggerRule(r.id, context, eventType)))
}
