/**
 * Support Item Pattern Matcher -- WS-F4
 *
 * Suggests NDIS support item codes from historical usage patterns when an
 * invoice arrives without a support item code.
 *
 * Three-tier confidence strategy (in order of priority):
 *   1. High (0.9):   Same provider + participant + categoryCode, occurrences >= 3
 *   2. Medium (0.7): Same provider + categoryCode (any participant), occurrences >= 3
 *   3. Low (0.5):    Most frequent itemNumber for this categoryCode across all providers
 *   4. None:         return null
 *
 * REQ-011: No cross-module imports. All DB access via Prisma singleton.
 * REQ-017: No PII logged.
 */

import { prisma } from '@/lib/db'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum occurrences required before a pattern qualifies for High or Medium confidence */
const MIN_OCCURRENCES = 3

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SuggestResult {
  itemNumber: string
  confidence: number
  source: 'HIGH' | 'MEDIUM' | 'LOW'
}

// ── suggestSupportItem ────────────────────────────────────────────────────────

/**
 * Return the best support item code suggestion for a given provider/participant/category
 * combination, or null if no sufficiently-observed pattern exists.
 *
 * @param providerId    - The provider's DB id
 * @param participantId - The participant's DB id
 * @param categoryCode  - NDIS support category code (two-character string, e.g. "01")
 */
export async function suggestSupportItem(
  providerId: string,
  participantId: string,
  categoryCode: string
): Promise<SuggestResult | null> {
  // -- Tier 1: High confidence — provider + participant + category, >= 3 occurrences ----
  const highPattern = await prisma.invItemPattern.findFirst({
    where: {
      providerId,
      participantId,
      categoryCode,
      occurrences: { gte: MIN_OCCURRENCES },
    },
    orderBy: { occurrences: 'desc' },
    select: { itemNumber: true },
  })

  if (highPattern !== null) {
    return {
      itemNumber: highPattern.itemNumber,
      confidence: 0.9,
      source: 'HIGH',
    }
  }

  // -- Tier 2: Medium confidence — provider + category (any participant), >= 3 occurrences ----
  // Sum occurrences across participants for each itemNumber so the cross-participant
  // count is accurate (one participant having 3 occurrences and another having 0
  // should not qualify for the minimum threshold together unless each has >= 3).
  const mediumPatterns = await prisma.invItemPattern.findMany({
    where: {
      providerId,
      categoryCode,
      occurrences: { gte: MIN_OCCURRENCES },
    },
    orderBy: { occurrences: 'desc' },
    select: { itemNumber: true, occurrences: true },
  })

  if (mediumPatterns.length > 0) {
    // Pick the itemNumber with the most total occurrences
    const totals = new Map<string, number>()
    for (const p of mediumPatterns) {
      totals.set(p.itemNumber, (totals.get(p.itemNumber) ?? 0) + p.occurrences)
    }
    // Sort descending by total occurrences and take the top one
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted[0]
    if (top !== undefined) {
      return {
        itemNumber: top[0],
        confidence: 0.7,
        source: 'MEDIUM',
      }
    }
  }

  // -- Tier 3: Low confidence — most frequent itemNumber for category (all providers) ----
  const lowPatterns = await prisma.invItemPattern.findMany({
    where: { categoryCode },
    select: { itemNumber: true, occurrences: true },
  })

  if (lowPatterns.length > 0) {
    const totals = new Map<string, number>()
    for (const p of lowPatterns) {
      totals.set(p.itemNumber, (totals.get(p.itemNumber) ?? 0) + p.occurrences)
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted[0]
    if (top !== undefined) {
      return {
        itemNumber: top[0],
        confidence: 0.5,
        source: 'LOW',
      }
    }
  }

  return null
}

// ── recordPattern ─────────────────────────────────────────────────────────────

/**
 * Record that a PM confirmed or manually entered a support item code for this
 * provider/participant/category combination.
 *
 * - Creates a new pattern row on first call.
 * - Increments occurrences and updates lastSeenAt on subsequent calls.
 *
 * Called from the invoice line update flow whenever a PM sets or confirms a
 * support item code on an invoice line.
 *
 * @param providerId    - The provider's DB id
 * @param participantId - The participant's DB id
 * @param categoryCode  - NDIS support category code
 * @param itemNumber    - The support item code being recorded
 */
export async function recordPattern(
  providerId: string,
  participantId: string,
  categoryCode: string,
  itemNumber: string
): Promise<void> {
  await prisma.invItemPattern.upsert({
    where: {
      providerId_participantId_categoryCode_itemNumber: {
        providerId,
        participantId,
        categoryCode,
        itemNumber,
      },
    },
    update: {
      occurrences: { increment: 1 },
      lastSeenAt: new Date(),
    },
    create: {
      providerId,
      participantId,
      categoryCode,
      itemNumber,
      occurrences: 1,
      lastSeenAt: new Date(),
    },
  })
}
