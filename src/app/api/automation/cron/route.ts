/**
 * POST /api/automation/cron
 *
 * Cron runner endpoint called by GitHub Actions every 5 minutes.
 * Finds all active SCHEDULE rules, evaluates whether their cron expression
 * was due in the last 5 minutes, and triggers matching rules.
 *
 * Auth: CRON_SECRET bearer token (not session auth — called by CI/CD).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { Cron } from 'croner'
import { findScheduledRules } from '@/lib/modules/automation/rules'
import { triggerRule } from '@/lib/modules/automation/engine'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { RuleExecutionResult } from '@/lib/modules/automation/types'

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Verify the Authorization: Bearer <token> header matches CRON_SECRET.
 * Returns true if valid, false otherwise.
 */
function verifyToken(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false

  return parts[1] === cronSecret
}

// ─── Cron expression check ────────────────────────────────────────────────────

/**
 * Check whether a cron expression was due within the last 5 minutes.
 * Uses croner in paused mode so no actual scheduling occurs.
 */
function isDue(expression: string): boolean {
  try {
    const job = new Cron(expression, { paused: true })
    const prev = job.previousRun()
    if (prev === null) return false
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    return prev >= fiveMinAgo
  } catch {
    // Invalid cron expression — treat as not due
    return false
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check (CRON_SECRET, not session)
  if (!verifyToken(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    // 2. Find all active scheduled rules
    const scheduledRules = await findScheduledRules()

    const context = {
      triggeredAt: new Date().toISOString(),
      triggerType: 'SCHEDULE' as const,
    }

    let triggered = 0
    let skipped = 0
    const results: RuleExecutionResult[] = []

    // 3. For each rule, check if its cron expression was due in the last 5 minutes
    for (const rule of scheduledRules) {
      if (!rule.cronExpression || !isDue(rule.cronExpression)) {
        skipped++
        continue
      }

      // 4. Trigger the rule
      const result = await triggerRule(rule.id, context, 'schedule')
      results.push(result)
      triggered++
    }

    // 5. Audit log
    await createAuditLog({
      userId: 'system',
      action: 'automation.cron.run',
      resource: 'AutoRule',
      resourceId: 'batch',
      after: { triggered, skipped, totalRules: scheduledRules.length },
    })

    // 6. Return summary
    return NextResponse.json({ triggered, skipped, results })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
