/**
 * Statement Generation Module
 *
 * Generates participant financial statements by querying invoices, claims,
 * and payments for a given period. Creates ParticipantStatement records
 * with summary totals and line item details.
 */

import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatementLineItem {
  date: string
  providerName: string
  invoiceNumber: string
  invoicedCents: number
  claimStatus: string
  paidCents: number
}

export interface GeneratedStatement {
  id: string
  participantId: string
  periodStart: Date
  periodEnd: Date
  totalInvoicedCents: number
  totalClaimedCents: number
  totalPaidCents: number
  budgetRemainingCents: number
  deliveryMethod: string
  generatedAt: Date
}

export interface ListStatementsParams {
  participantId?: string
  deliveryMethod?: 'EMAIL' | 'SMS' | 'MAIL'
  sent?: boolean
  page: number
  pageSize: number
}

export interface ListStatementsResult {
  data: Array<{
    id: string
    participantId: string
    participant: {
      firstName: string
      lastName: string
      ndisNumber: string
    }
    periodStart: Date
    periodEnd: Date
    deliveryMethod: string
    sentAt: Date | null
    totalInvoicedCents: number
    totalClaimedCents: number
    totalPaidCents: number
    budgetRemainingCents: number
    generatedAt: Date
  }>
  total: number
  page: number
  pageSize: number
}

// ─── List Statements ──────────────────────────────────────────────────────────

export async function listStatements(
  params: ListStatementsParams
): Promise<ListStatementsResult> {
  const where: Prisma.ParticipantStatementWhereInput = {
    deletedAt: null,
  }

  if (params.participantId) {
    where.participantId = params.participantId
  }
  if (params.deliveryMethod) {
    where.deliveryMethod = params.deliveryMethod
  }
  if (params.sent === true) {
    where.sentAt = { not: null }
  } else if (params.sent === false) {
    where.sentAt = null
  }

  const [data, total] = await Promise.all([
    prisma.participantStatement.findMany({
      where,
      include: {
        participant: {
          select: {
            firstName: true,
            lastName: true,
            ndisNumber: true,
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.participantStatement.count({ where }),
  ])

  return {
    data: data.map((s) => ({
      id: s.id,
      participantId: s.participantId,
      participant: s.participant,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      deliveryMethod: s.deliveryMethod,
      sentAt: s.sentAt,
      totalInvoicedCents: s.totalInvoicedCents,
      totalClaimedCents: s.totalClaimedCents,
      totalPaidCents: s.totalPaidCents,
      budgetRemainingCents: s.budgetRemainingCents,
      generatedAt: s.generatedAt,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  }
}

// ─── Get Statement By ID ──────────────────────────────────────────────────────

export async function getStatementById(id: string) {
  return prisma.participantStatement.findFirst({
    where: { id, deletedAt: null },
    include: {
      participant: {
        select: {
          firstName: true,
          lastName: true,
          ndisNumber: true,
        },
      },
    },
  })
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

export async function softDeleteStatement(id: string): Promise<void> {
  await prisma.participantStatement.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ─── Generate Statement ───────────────────────────────────────────────────────

/**
 * Generate a financial statement for a participant for the given period.
 * Queries all invoices, claims, and payments within the date range.
 */
export async function generateStatement(
  participantId: string,
  periodStart: Date,
  periodEnd: Date,
  createdById: string
): Promise<GeneratedStatement> {
  // Verify participant exists
  const participant = await prisma.crmParticipant.findUnique({
    where: { id: participantId },
    include: {
      plans: {
        where: { status: 'ACTIVE' },
        include: {
          budgetLines: {
            select: { allocatedCents: true },
          },
        },
      },
    },
  })

  if (!participant) {
    throw new Error('Participant not found')
  }

  // Query all invoices for the period with their claims (which have payments)
  const invoices = await prisma.invInvoice.findMany({
    where: {
      participantId,
      invoiceDate: { gte: periodStart, lte: periodEnd },
      deletedAt: null,
    },
    include: {
      provider: { select: { name: true } },
      claims: {
        select: {
          status: true,
          payments: { select: { amountCents: true, status: true } },
        },
      },
    },
    orderBy: { invoiceDate: 'asc' },
  })

  // Build line items
  const lineItems: StatementLineItem[] = invoices.map((inv) => {
    const claimStatuses = inv.claims.map((c) => c.status)
    const claimStatus = claimStatuses.length > 0
      ? (claimStatuses[0] ?? 'NONE')
      : 'NONE'

    // Sum paid amounts from claims -> payments where status is CLEARED
    const paidCents = inv.claims.reduce((claimSum, claim) =>
      claimSum + claim.payments
        .filter((p) => p.status === 'CLEARED')
        .reduce((paySum, p) => paySum + p.amountCents, 0),
    0)

    return {
      date: inv.invoiceDate.toISOString(),
      providerName: inv.provider?.name ?? 'Unknown',
      invoiceNumber: inv.invoiceNumber,
      invoicedCents: inv.totalCents,
      claimStatus,
      paidCents,
    }
  })

  // Calculate totals
  const totalInvoicedCents = lineItems.reduce((sum, l) => sum + l.invoicedCents, 0)
  const totalClaimedCents = invoices
    .filter((inv) => inv.claims.some((c) => ['SUBMITTED', 'APPROVED', 'PAID'].includes(c.status)))
    .reduce((sum, inv) => sum + inv.totalCents, 0)
  const totalPaidCents = lineItems.reduce((sum, l) => sum + l.paidCents, 0)

  // Calculate budget remaining (sum of all active plan budget lines minus total spent)
  const totalBudgetAllocated = participant.plans.reduce(
    (sum: number, plan: { budgetLines: Array<{ allocatedCents: number }> }) =>
      sum + plan.budgetLines.reduce((lineSum: number, bl: { allocatedCents: number }) => lineSum + bl.allocatedCents, 0),
    0
  )

  // Total spent across all time (not just this period)
  const allTimeSpent = await prisma.invInvoice.aggregate({
    where: {
      participantId,
      status: { in: ['APPROVED', 'CLAIMED'] },
      deletedAt: null,
    },
    _sum: { totalCents: true },
  })
  const budgetRemainingCents = Math.max(
    0,
    totalBudgetAllocated - (allTimeSpent._sum.totalCents ?? 0)
  )

  // Determine delivery method
  const deliveryMethod = participant.statementDelivery ?? 'EMAIL'

  // Create statement record
  const statement = await prisma.participantStatement.create({
    data: {
      participantId,
      periodStart,
      periodEnd,
      deliveryMethod,
      totalInvoicedCents,
      totalClaimedCents,
      totalPaidCents,
      budgetRemainingCents,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      createdById,
    },
  })

  return {
    id: statement.id,
    participantId: statement.participantId,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    totalInvoicedCents: statement.totalInvoicedCents,
    totalClaimedCents: statement.totalClaimedCents,
    totalPaidCents: statement.totalPaidCents,
    budgetRemainingCents: statement.budgetRemainingCents,
    deliveryMethod: statement.deliveryMethod,
    generatedAt: statement.generatedAt,
  }
}

// ─── Bulk Generate ────────────────────────────────────────────────────────────

/**
 * Generate statements for all active participants for a given month.
 * Skips participants who already have a statement for the period or
 * whose statementFrequency is NONE.
 */
export async function bulkGenerateStatements(
  month: number,
  year: number,
  createdById: string
): Promise<{ generated: number; skipped: number }> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  // Find all active participants who want statements
  const participants = await prisma.crmParticipant.findMany({
    where: {
      isActive: true,
      statementFrequency: { not: 'NONE' },
      deletedAt: null,
    },
    select: { id: true },
  })

  let generated = 0
  let skipped = 0

  for (const p of participants) {
    // Check if statement already exists for this period
    const existing = await prisma.participantStatement.findFirst({
      where: {
        participantId: p.id,
        periodStart,
        periodEnd,
        deletedAt: null,
      },
    })

    if (existing) {
      skipped++
      continue
    }

    try {
      await generateStatement(p.id, periodStart, periodEnd, createdById)
      generated++
    } catch {
      // Skip participants that fail (e.g., no plan)
      skipped++
    }
  }

  return { generated, skipped }
}
