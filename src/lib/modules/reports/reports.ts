import { prisma } from '@/lib/db'
import { businessDaysBetween } from '@/lib/shared/dates'

// ─── Dashboard Summary ──────────────────────────────────

export interface DashboardSummary {
  participants: { active: number; total: number }
  plans: { active: number; expiringSoon: number; expired: number }
  invoices: { received: number; pendingReview: number; approved: number; rejected: number; total: number }
  claims: { pending: number; submitted: number; approved: number; rejected: number; total: number }
  payments: { pending: number; inAbaFile: number; submittedToBank: number; cleared: number; total: number }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [
    participantCounts,
    planCounts,
    invoiceCounts,
    claimCounts,
    paymentCounts,
  ] = await Promise.all([
    getParticipantCounts(),
    getPlanCounts(),
    getInvoiceCounts(),
    getClaimCounts(),
    getPaymentCounts(),
  ])

  return {
    participants: participantCounts,
    plans: planCounts,
    invoices: invoiceCounts,
    claims: claimCounts,
    payments: paymentCounts,
  }
}

async function getParticipantCounts(): Promise<{ active: number; total: number }> {
  const [active, total] = await Promise.all([
    prisma.crmParticipant.count({ where: { isActive: true, deletedAt: null } }),
    prisma.crmParticipant.count({ where: { deletedAt: null } }),
  ])
  return { active, total }
}

async function getPlanCounts(): Promise<{ active: number; expiringSoon: number; expired: number }> {
  const counts = await prisma.planPlan.groupBy({
    by: ['status'],
    _count: true,
  })

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]))

  return {
    active: countMap['ACTIVE'] ?? 0,
    expiringSoon: countMap['EXPIRING_SOON'] ?? 0,
    expired: countMap['EXPIRED'] ?? 0,
  }
}

async function getInvoiceCounts(): Promise<{
  received: number
  pendingReview: number
  approved: number
  rejected: number
  total: number
}> {
  const counts = await prisma.invInvoice.groupBy({
    by: ['status'],
    _count: true,
    where: { deletedAt: null },
  })

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]))
  const total = counts.reduce((sum, c) => sum + c._count, 0)

  return {
    received: countMap['RECEIVED'] ?? 0,
    pendingReview: countMap['PENDING_REVIEW'] ?? 0,
    approved: countMap['APPROVED'] ?? 0,
    rejected: countMap['REJECTED'] ?? 0,
    total,
  }
}

async function getClaimCounts(): Promise<{
  pending: number
  submitted: number
  approved: number
  rejected: number
  total: number
}> {
  const counts = await prisma.clmClaim.groupBy({
    by: ['status'],
    _count: true,
  })

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]))
  const total = counts.reduce((sum, c) => sum + c._count, 0)

  return {
    pending: countMap['PENDING'] ?? 0,
    submitted: countMap['SUBMITTED'] ?? 0,
    approved: (countMap['APPROVED'] ?? 0) + (countMap['PARTIAL'] ?? 0),
    rejected: countMap['REJECTED'] ?? 0,
    total,
  }
}

async function getPaymentCounts(): Promise<{
  pending: number
  inAbaFile: number
  submittedToBank: number
  cleared: number
  total: number
}> {
  const counts = await prisma.bnkPayment.groupBy({
    by: ['status'],
    _count: true,
  })

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]))
  const total = counts.reduce((sum, c) => sum + c._count, 0)

  return {
    pending: countMap['PENDING'] ?? 0,
    inAbaFile: countMap['IN_ABA_FILE'] ?? 0,
    submittedToBank: countMap['SUBMITTED_TO_BANK'] ?? 0,
    cleared: countMap['CLEARED'] ?? 0,
    total,
  }
}

// ─── Financial Summary ──────────────────────────────────

export interface FinancialSummary {
  totalInvoicedCents: number
  totalClaimedCents: number
  totalApprovedCents: number
  totalPaidCents: number
  totalOutstandingCents: number
  periodStart: string
  periodEnd: string
}

export async function getFinancialSummary(params: {
  periodStart: Date
  periodEnd: Date
}): Promise<FinancialSummary> {
  const { periodStart, periodEnd } = params

  const [invoiceAgg, claimAgg, paymentAgg] = await Promise.all([
    prisma.invInvoice.aggregate({
      _sum: { totalCents: true },
      where: {
        deletedAt: null,
        receivedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.clmClaim.aggregate({
      _sum: { claimedCents: true, approvedCents: true },
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.bnkPayment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: 'CLEARED',
        processedAt: { gte: periodStart, lte: periodEnd },
      },
    }),
  ])

  const totalInvoicedCents = invoiceAgg._sum.totalCents ?? 0
  const totalClaimedCents = claimAgg._sum.claimedCents ?? 0
  const totalApprovedCents = claimAgg._sum.approvedCents ?? 0
  const totalPaidCents = paymentAgg._sum.amountCents ?? 0

  return {
    totalInvoicedCents,
    totalClaimedCents,
    totalApprovedCents,
    totalPaidCents,
    totalOutstandingCents: totalApprovedCents - totalPaidCents,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  }
}

// ─── NDIS Compliance ─────────────────────────────────────

export interface ComplianceMetrics {
  /** Invoices processed within 5 business days (REQ-015) */
  processingCompliance: {
    withinTarget: number
    overTarget: number
    total: number
    complianceRate: number
  }
  /** Invoices currently at risk of breaching the 5-day window */
  atRisk: Array<{
    id: string
    invoiceNumber: string
    providerName: string
    participantName: string
    receivedAt: string
    businessDaysElapsed: number
  }>
}

export async function getComplianceMetrics(): Promise<ComplianceMetrics> {
  // Get all non-deleted invoices for compliance check
  const invoices = await prisma.invInvoice.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      receivedAt: true,
      approvedAt: true,
      rejectedAt: true,
      provider: { select: { name: true } },
      participant: { select: { firstName: true, lastName: true } },
    },
  })

  let withinTarget = 0
  let overTarget = 0
  const atRisk: ComplianceMetrics['atRisk'] = []
  const now = new Date()

  for (const inv of invoices) {
    // For processed invoices, check actual processing time
    const processedAt = inv.approvedAt ?? inv.rejectedAt

    if (processedAt) {
      const days = businessDaysBetween(inv.receivedAt, processedAt)
      if (days <= 5) {
        withinTarget++
      } else {
        overTarget++
      }
    } else {
      // Still pending — check if at risk
      const daysElapsed = businessDaysBetween(inv.receivedAt, now)

      if (daysElapsed >= 3) {
        atRisk.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          providerName: inv.provider?.name ?? 'Unknown Provider',
          participantName: inv.participant
            ? `${inv.participant.firstName} ${inv.participant.lastName}`
            : 'Unknown Participant',
          receivedAt: inv.receivedAt.toISOString(),
          businessDaysElapsed: daysElapsed,
        })
      }

      // Count unprocessed invoices past 5 days as over target
      if (daysElapsed > 5) {
        overTarget++
      }
    }
  }

  const total = withinTarget + overTarget
  const complianceRate = total > 0 ? Math.round((withinTarget / total) * 10000) / 100 : 100

  // Sort at-risk by most urgent first
  atRisk.sort((a, b) => b.businessDaysElapsed - a.businessDaysElapsed)

  return {
    processingCompliance: {
      withinTarget,
      overTarget,
      total,
      complianceRate,
    },
    atRisk,
  }
}

// ─── Provider Payment Summary ────────────────────────────

export interface ProviderPaymentRow {
  providerId: string
  providerName: string
  invoiceCount: number
  totalInvoicedCents: number
  totalClaimedCents: number
  totalPaidCents: number
}

export async function getProviderPaymentSummary(params: {
  periodStart: Date
  periodEnd: Date
}): Promise<ProviderPaymentRow[]> {
  const { periodStart, periodEnd } = params

  const providers = await prisma.crmProvider.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      invoices: {
        where: {
          deletedAt: null,
          receivedAt: { gte: periodStart, lte: periodEnd },
        },
        select: {
          totalCents: true,
          claims: {
            select: {
              claimedCents: true,
              payments: {
                where: { status: 'CLEARED' },
                select: { amountCents: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return providers
    .map((p) => {
      const invoiceCount = p.invoices.length
      const totalInvoicedCents = p.invoices.reduce((sum, inv) => sum + inv.totalCents, 0)
      const totalClaimedCents = p.invoices.reduce(
        (sum, inv) => sum + inv.claims.reduce((cs, c) => cs + c.claimedCents, 0),
        0,
      )
      const totalPaidCents = p.invoices.reduce(
        (sum, inv) =>
          sum + inv.claims.reduce(
            (cs, c) => cs + c.payments.reduce((ps, pay) => ps + pay.amountCents, 0),
            0,
          ),
        0,
      )

      return {
        providerId: p.id,
        providerName: p.name,
        invoiceCount,
        totalInvoicedCents,
        totalClaimedCents,
        totalPaidCents,
      }
    })
    .filter((row) => row.invoiceCount > 0)
}

// ─── Budget Utilisation ──────────────────────────────────

export interface BudgetUtilisationRow {
  participantId: string
  participantName: string
  ndisNumber: string
  planId: string
  planStart: string
  planEnd: string
  totalAllocatedCents: number
  totalSpentCents: number
  totalReservedCents: number
  utilisationPercent: number
}

export async function getBudgetUtilisation(): Promise<BudgetUtilisationRow[]> {
  const plans = await prisma.planPlan.findMany({
    where: { status: 'ACTIVE' },
    include: {
      participant: {
        select: { id: true, firstName: true, lastName: true, ndisNumber: true },
      },
      budgetLines: {
        select: { allocatedCents: true, spentCents: true, reservedCents: true },
      },
    },
    orderBy: { endDate: 'asc' },
  })

  return plans.map((plan) => {
    const totalAllocatedCents = plan.budgetLines.reduce((s, bl) => s + bl.allocatedCents, 0)
    const totalSpentCents = plan.budgetLines.reduce((s, bl) => s + bl.spentCents, 0)
    const totalReservedCents = plan.budgetLines.reduce((s, bl) => s + bl.reservedCents, 0)
    const utilisationPercent = totalAllocatedCents > 0
      ? Math.round(((totalSpentCents + totalReservedCents) / totalAllocatedCents) * 10000) / 100
      : 0

    return {
      participantId: plan.participant.id,
      participantName: `${plan.participant.firstName} ${plan.participant.lastName}`,
      ndisNumber: plan.participant.ndisNumber,
      planId: plan.id,
      planStart: plan.startDate.toISOString(),
      planEnd: plan.endDate.toISOString(),
      totalAllocatedCents,
      totalSpentCents,
      totalReservedCents,
      utilisationPercent,
    }
  })
}
