/**
 * Auto-Matching Service — links email-ingested invoices to providers and participants.
 *
 * Three-tier matching strategy:
 *   TIER 1 — Deterministic (confidence 1.0):
 *     • Provider by ABN exact match
 *     • Participant by NDIS number exact match
 *     • Provider by email exact match (CrmProviderEmail lookup)
 *
 *   TIER 2 — Heuristic (confidence 0.5–0.8):
 *     • Provider by email domain (if exactly one provider has that domain)
 *     • Historical match (same sender email, consistent matches, 3+ occurrences in 90 days)
 *
 *   TIER 3 — No match (confidence 0.0):
 *     • Returns nulls with method "NONE"
 *
 * Provider and participant are matched independently; the result contains both.
 * REQ-011: All DB queries use the Prisma singleton (no direct AWS calls here).
 * REQ-017: No PII logged.
 */

import { prisma } from '@/lib/db'
import type { ExtractedInvoiceData } from './textract-extraction'

// ── Exported types ─────────────────────────────────────────────────────────────

export interface AutoMatchResult {
  /** Matched provider ID, or null if no match found */
  providerId: string | null
  /** Matched participant ID, or null if no match found */
  participantId: string | null
  /**
   * Overall confidence of the match (0.0–1.0).
   * Reflects the primary (provider) match if found, otherwise participant match.
   */
  matchConfidence: number
  /**
   * Method used for the primary (provider) match.
   * One of: "ABN_EXACT" | "EMAIL_EXACT" | "EMAIL_DOMAIN" | "HISTORICAL" | "NDIS_NUMBER" | "NONE"
   */
  matchMethod: string
  /** Human-readable explanation of how the provider was (or was not) matched */
  providerMatchDetail: string
  /** Human-readable explanation of how the participant was (or was not) matched */
  participantMatchDetail: string
}

// ── 90-day lookback window for historical matching ─────────────────────────────

const HISTORICAL_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000
const HISTORICAL_MIN_COUNT = 3

// ── Learning loop ──────────────────────────────────────────────────────────────

/**
 * Record that a provider email address produced a confirmed match.
 *
 * - First call (no existing record): creates CrmProviderEmail with isVerified: false
 * - Subsequent calls (record exists, isVerified: false): sets isVerified: true
 * - Already verified: no-op
 *
 * Called from the triage PUT route whenever a PM saves/confirms a provider on an
 * email-ingested invoice that has a sourceEmail address.
 */
export async function recordProviderEmailMatch(
  providerId: string,
  email: string
): Promise<void> {
  const emailLower = email.toLowerCase()
  const existing = await prisma.crmProviderEmail.findFirst({
    where: { email: emailLower, providerId },
    select: { id: true, isVerified: true },
  })

  if (!existing) {
    await prisma.crmProviderEmail.create({
      data: { providerId, email: emailLower },
    })
  } else if (!existing.isVerified) {
    await prisma.crmProviderEmail.update({
      where: { id: existing.id },
      data: { isVerified: true },
    })
  }
  // Already verified — no action needed
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Attempt to match an email-ingested invoice to a provider and participant.
 *
 * @param extracted - Structured data extracted from the invoice PDF by Textract
 * @param sourceEmail - Sender email address from the inbound email (null if unknown)
 */
export async function autoMatchInvoice(
  extracted: ExtractedInvoiceData,
  sourceEmail: string | null
): Promise<AutoMatchResult> {
  let providerId: string | null = null
  let participantId: string | null = null
  let providerMatchMethod = 'NONE'
  let providerMatchConfidence = 0.0
  let providerMatchDetail = 'No provider match found'
  let participantMatchDetail = 'No participant match found'

  // ── TIER 1: Deterministic matching (confidence 1.0) ──────────────────────────

  // Provider by ABN exact match
  if (!providerId && extracted.providerAbn) {
    const abn = extracted.providerAbn
    // Also try the spaced variant stored in some legacy records ("12 345 678 901")
    const abnSpaced = abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')
    const found = await prisma.crmProvider.findFirst({
      where: { deletedAt: null, OR: [{ abn }, { abn: abnSpaced }] },
      select: { id: true, name: true },
    })
    if (found) {
      providerId = found.id
      providerMatchMethod = 'ABN_EXACT'
      providerMatchConfidence = 1.0
      providerMatchDetail = `Matched by ABN ${abn} → ${found.name}`
    }
  }

  // Participant by NDIS number exact match
  if (!participantId && extracted.participantNdisNumber) {
    const found = await prisma.crmParticipant.findFirst({
      where: { deletedAt: null, ndisNumber: extracted.participantNdisNumber },
      select: { id: true, firstName: true, lastName: true },
    })
    if (found) {
      participantId = found.id
      participantMatchDetail = `Matched by NDIS number ${extracted.participantNdisNumber} → ${found.firstName} ${found.lastName}`
    }
  }

  // Provider by email exact match (via CrmProviderEmail lookup table)
  if (!providerId && sourceEmail) {
    const emailLower = sourceEmail.toLowerCase()
    const emailRecord = await prisma.crmProviderEmail.findFirst({
      where: { email: emailLower },
      select: {
        provider: { select: { id: true, name: true, deletedAt: true } },
      },
    })
    if (emailRecord && !emailRecord.provider.deletedAt) {
      providerId = emailRecord.provider.id
      providerMatchMethod = 'EMAIL_EXACT'
      providerMatchConfidence = 1.0
      providerMatchDetail = `Matched by email ${sourceEmail} → ${emailRecord.provider.name}`
    }
  }

  // ── TIER 2: Heuristic matching ────────────────────────────────────────────────

  // Provider by email domain — only if exactly one provider uses that domain
  if (!providerId && sourceEmail) {
    const domain = sourceEmail.split('@')[1]?.toLowerCase()
    if (domain) {
      const providerIdMatches = await prisma.crmProviderEmail.findMany({
        where: { email: { endsWith: `@${domain}` } },
        select: { providerId: true },
        distinct: ['providerId'],
      })
      if (providerIdMatches.length === 1) {
        const matchedId = providerIdMatches[0]!.providerId
        const found = await prisma.crmProvider.findFirst({
          where: { id: matchedId, deletedAt: null },
          select: { id: true, name: true },
        })
        if (found) {
          providerId = found.id
          providerMatchMethod = 'EMAIL_DOMAIN'
          providerMatchConfidence = 0.7
          providerMatchDetail = `Matched by email domain @${domain} → ${found.name}`
        }
      }
    }
  }

  // Historical match — same sender email, consistent provider/participant over last 90 days
  if ((!providerId || !participantId) && sourceEmail) {
    const since = new Date(Date.now() - HISTORICAL_LOOKBACK_MS)
    const recentInvoices = await prisma.invInvoice.findMany({
      where: {
        deletedAt: null,
        sourceEmail: { equals: sourceEmail, mode: 'insensitive' },
        matchMethod: { not: null }, // only invoices that were previously matched
        receivedAt: { gte: since },
      },
      select: { providerId: true, participantId: true },
    })

    // Count occurrences per provider
    if (!providerId) {
      const providerCounts: Record<string, number> = {}
      for (const inv of recentInvoices) {
        if (inv.providerId) {
          providerCounts[inv.providerId] = (providerCounts[inv.providerId] ?? 0) + 1
        }
      }
      const topEntry = Object.entries(providerCounts).sort((a, b) => b[1] - a[1])[0]
      if (topEntry && topEntry[1] >= HISTORICAL_MIN_COUNT) {
        const found = await prisma.crmProvider.findFirst({
          where: { id: topEntry[0], deletedAt: null },
          select: { id: true, name: true },
        })
        if (found) {
          providerId = found.id
          providerMatchMethod = 'HISTORICAL'
          providerMatchConfidence = 0.8
          providerMatchDetail = `Historical match (${topEntry[1]} invoices from ${sourceEmail}) → ${found.name}`
        }
      }
    }

    // Count occurrences per participant
    if (!participantId) {
      const participantCounts: Record<string, number> = {}
      for (const inv of recentInvoices) {
        if (inv.participantId) {
          participantCounts[inv.participantId] =
            (participantCounts[inv.participantId] ?? 0) + 1
        }
      }
      const topEntry = Object.entries(participantCounts).sort((a, b) => b[1] - a[1])[0]
      if (topEntry && topEntry[1] >= HISTORICAL_MIN_COUNT) {
        const found = await prisma.crmParticipant.findFirst({
          where: { id: topEntry[0], deletedAt: null },
          select: { id: true, firstName: true, lastName: true },
        })
        if (found) {
          participantId = found.id
          participantMatchDetail = `Historical match (${topEntry[1]} invoices from ${sourceEmail}) → ${found.firstName} ${found.lastName}`
        }
      }
    }
  }

  // ── Build result ──────────────────────────────────────────────────────────────

  return {
    providerId,
    participantId,
    matchConfidence: providerMatchConfidence,
    matchMethod: providerMatchMethod,
    providerMatchDetail,
    participantMatchDetail,
  }
}
