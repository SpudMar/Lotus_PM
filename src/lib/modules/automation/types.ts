/**
 * Automation Engine — shared TypeScript types.
 * Conditions and actions are stored as JSON in the DB.
 * These types define the shape of those JSON arrays.
 */

// ─── Conditions ───────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'eq'       // equal
  | 'ne'       // not equal
  | 'gt'       // greater than
  | 'gte'      // greater than or equal
  | 'lt'       // less than
  | 'lte'      // less than or equal
  | 'contains' // string contains (case-insensitive)

export interface AutoCondition {
  field: string
  op: ConditionOperator
  value: string | number | boolean
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type AutoActionType =
  | 'LOG_COMM'       // Create a CRM communication log entry
  | 'NOTIFY_STAFF'   // Future: send in-app / email notification (Phase 2 Notifications)

export interface LogCommAction {
  type: 'LOG_COMM'
  params: {
    message: string           // Template — supports {field} interpolation from context
    participantId?: string    // Fixed participant, or sourced from context if omitted
  }
}

export interface NotifyStaffAction {
  type: 'NOTIFY_STAFF'
  params: {
    message: string
    notifyRole: 'DIRECTOR' | 'PLAN_MANAGER' | 'ASSISTANT'
  }
}

export type AutoAction = LogCommAction | NotifyStaffAction

// ─── Trigger context ──────────────────────────────────────────────────────────

/**
 * The context object passed to the rule engine when a rule is triggered.
 * Contains the event payload (for EVENT rules) or scheduled metadata.
 * Condition fields are evaluated against this flat object.
 */
export type TriggerContext = Record<string, string | number | boolean | null | undefined>

// ─── Rule execution result ────────────────────────────────────────────────────

export interface RuleExecutionResult {
  ruleId: string
  result: 'SUCCESS' | 'SKIPPED' | 'FAILED'
  actionsRun: number
  errorMessage?: string
  durationMs: number
}
