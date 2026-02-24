/**
 * Data Retention Module — REQ-010
 *
 * Retention periods:
 *   - 7 years: incidents/audit logs, documents, correspondence, participants, providers
 *   - 5 years: payments, invoices, claims
 *
 * Purge strategy:
 *   - Records with `deletedAt` are purged after the retention period has passed
 *     since soft-deletion (deletedAt < cutoff).
 *   - Records without `deletedAt` are purged by `createdAt` (old enough = expired).
 *   - Active (non-deleted) records are NEVER purged.
 *   - The purge is idempotent — safe to run multiple times.
 *
 * FK deletion order (to avoid constraint violations):
 *   BnkPayment → ClmClaimLine → ClmClaim → InvStatusHistory → InvInvoiceLine → InvInvoice
 *   DocDocument and CrmCommLog are independent leaf/parent tables.
 *   CoreAuditLog is purged last (after the purge itself is audited).
 */

import { prisma } from '@/lib/db'

// ─────────────────────────────────────────────
// Retention configuration (REQ-010)
// ─────────────────────────────────────────────

/** Retention periods in years (REQ-010) */
export const RETENTION_YEARS = {
  auditLogs: 7,     // Incidents / audit trail — 7 years
  invoices: 5,      // Invoice records — 5 years
  lineItems: 5,     // Invoice line items — same as invoices
  payments: 5,      // Payment records — 5 years
  claims: 5,        // Claim records — 5 years
  documents: 7,     // Documents — 7 years
  commLogs: 7,      // Correspondence — 7 years
  participants: 7,  // Participant records — 7 years
  providers: 7,     // Provider records — 7 years
} as const

export type RetentionCategory = keyof typeof RETENTION_YEARS

/**
 * Returns the cutoff date for a retention category.
 * Records soft-deleted (or created, for tables without deletedAt) before this
 * date are eligible for purge.
 */
export function getRetentionCutoff(category: RetentionCategory): Date {
  const years = RETENTION_YEARS[category]
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - years)
  return cutoff
}

// ─────────────────────────────────────────────
// Purge summary type
// ─────────────────────────────────────────────

export interface PurgeSummary {
  bnkPayment: number
  clmClaimLine: number
  clmClaim: number
  invStatusHistory: number
  invInvoiceLine: number
  invInvoice: number
  docDocument: number
  crmCommLog: number
  coreAuditLog: number
  total: number
}

// ─────────────────────────────────────────────
// Dry-run estimates
// ─────────────────────────────────────────────

/**
 * Count records eligible for purge without deleting anything.
 * Used by the GET endpoint to give administrators a preview.
 */
export async function getEligibleCounts(): Promise<Omit<PurgeSummary, 'total'>> {
  // BnkPayment — no deletedAt, purge by createdAt
  const bnkPayment = await prisma.bnkPayment.count({
    where: { createdAt: { lt: getRetentionCutoff('payments') } },
  })

  // ClmClaimLine — no deletedAt; count lines whose parent claim is eligible
  const clmClaimLine = await prisma.clmClaimLine.count({
    where: {
      claim: { createdAt: { lt: getRetentionCutoff('claims') } },
    },
  })

  // ClmClaim — no deletedAt, purge by createdAt
  const clmClaim = await prisma.clmClaim.count({
    where: { createdAt: { lt: getRetentionCutoff('claims') } },
  })

  // InvStatusHistory — no deletedAt; count entries whose parent invoice is eligible
  const invStatusHistory = await prisma.invStatusHistory.count({
    where: {
      invoice: {
        deletedAt: { not: null, lt: getRetentionCutoff('invoices') },
      },
    },
  })

  // InvInvoiceLine — no deletedAt; count lines whose parent invoice is eligible
  const invInvoiceLine = await prisma.invInvoiceLine.count({
    where: {
      invoice: {
        deletedAt: { not: null, lt: getRetentionCutoff('invoices') },
      },
    },
  })

  // InvInvoice — has deletedAt
  const invInvoice = await prisma.invInvoice.count({
    where: {
      deletedAt: { not: null, lt: getRetentionCutoff('invoices') },
    },
  })

  // DocDocument — has deletedAt
  const docDocument = await prisma.docDocument.count({
    where: {
      deletedAt: { not: null, lt: getRetentionCutoff('documents') },
    },
  })

  // CrmCommLog — no deletedAt, purge by createdAt
  const crmCommLog = await prisma.crmCommLog.count({
    where: { createdAt: { lt: getRetentionCutoff('commLogs') } },
  })

  // CoreAuditLog — no deletedAt, purge by createdAt
  const coreAuditLog = await prisma.coreAuditLog.count({
    where: { createdAt: { lt: getRetentionCutoff('auditLogs') } },
  })

  return {
    bnkPayment,
    clmClaimLine,
    clmClaim,
    invStatusHistory,
    invInvoiceLine,
    invInvoice,
    docDocument,
    crmCommLog,
    coreAuditLog,
  }
}

// ─────────────────────────────────────────────
// Hard purge
// ─────────────────────────────────────────────

/**
 * Hard-delete records whose retention period has expired.
 *
 * Rules:
 *   - Records with `deletedAt`: purged when `deletedAt < retentionCutoff`
 *   - Records without `deletedAt`: purged when `createdAt < retentionCutoff`
 *   - Active (non-deleted) records are never touched.
 *
 * Deletion order respects FK constraints:
 *   BnkPayment (leaf) → ClmClaimLine → ClmClaim → InvStatusHistory → InvInvoiceLine → InvInvoice
 *   DocDocument, CrmCommLog are independent.
 *   CoreAuditLog is purged last.
 *
 * The function is idempotent — running it multiple times produces the same result.
 */
export async function purgeExpiredRecords(): Promise<PurgeSummary> {
  // ── Step 1: Payments (leaf — child of ClmClaim, no deletedAt) ────────────────
  const bnkPaymentResult = await prisma.bnkPayment.deleteMany({
    where: { createdAt: { lt: getRetentionCutoff('payments') } },
  })

  // ── Step 2: Claim lines (leaf — child of ClmClaim, no deletedAt) ─────────────
  const clmClaimLineResult = await prisma.clmClaimLine.deleteMany({
    where: {
      claim: { createdAt: { lt: getRetentionCutoff('claims') } },
    },
  })

  // ── Step 3: Claims (child of InvInvoice, no deletedAt) ───────────────────────
  const clmClaimResult = await prisma.clmClaim.deleteMany({
    where: { createdAt: { lt: getRetentionCutoff('claims') } },
  })

  // ── Step 4: Invoice status history (child of InvInvoice, no deletedAt) ───────
  const invStatusHistoryResult = await prisma.invStatusHistory.deleteMany({
    where: {
      invoice: {
        deletedAt: { not: null, lt: getRetentionCutoff('invoices') },
      },
    },
  })

  // ── Step 5: Invoice lines (child of InvInvoice, no deletedAt) ────────────────
  const invInvoiceLineResult = await prisma.invInvoiceLine.deleteMany({
    where: {
      invoice: {
        deletedAt: { not: null, lt: getRetentionCutoff('invoices') },
      },
    },
  })

  // ── Step 6: Invoices (has deletedAt — only soft-deleted ones) ─────────────────
  const invInvoiceResult = await prisma.invInvoice.deleteMany({
    where: {
      deletedAt: { not: null, lt: getRetentionCutoff('invoices') },
    },
  })

  // ── Step 7: Documents (has deletedAt — only soft-deleted ones) ───────────────
  const docDocumentResult = await prisma.docDocument.deleteMany({
    where: {
      deletedAt: { not: null, lt: getRetentionCutoff('documents') },
    },
  })

  // ── Step 8: Comm logs (no deletedAt, purge by createdAt) ─────────────────────
  const crmCommLogResult = await prisma.crmCommLog.deleteMany({
    where: { createdAt: { lt: getRetentionCutoff('commLogs') } },
  })

  // ── Step 9: Audit logs (no deletedAt, purge old entries) — LAST ──────────────
  // Audit log of the purge itself must be written BEFORE this step
  // (handled by the API route caller).
  const coreAuditLogResult = await prisma.coreAuditLog.deleteMany({
    where: { createdAt: { lt: getRetentionCutoff('auditLogs') } },
  })

  const summary: PurgeSummary = {
    bnkPayment: bnkPaymentResult.count,
    clmClaimLine: clmClaimLineResult.count,
    clmClaim: clmClaimResult.count,
    invStatusHistory: invStatusHistoryResult.count,
    invInvoiceLine: invInvoiceLineResult.count,
    invInvoice: invInvoiceResult.count,
    docDocument: docDocumentResult.count,
    crmCommLog: crmCommLogResult.count,
    coreAuditLog: coreAuditLogResult.count,
    total: 0,
  }

  summary.total =
    summary.bnkPayment +
    summary.clmClaimLine +
    summary.clmClaim +
    summary.invStatusHistory +
    summary.invInvoiceLine +
    summary.invInvoice +
    summary.docDocument +
    summary.crmCommLog +
    summary.coreAuditLog

  return summary
}
