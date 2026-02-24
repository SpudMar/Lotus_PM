import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

// ─── Types ───────────────────────────────────────────────

export interface ProcessingTimeMetrics {
  avgDays: number
  p50Days: number
  p90Days: number
  slaComplianceRate: number
  totalProcessed: number
  withinSla: number
}

export interface StatusFunnelItem {
  status: string
  count: number
}

export interface HoldCategoryItem {
  category: string
  count: number
}

export interface VolumeDataPoint {
  period: string
  count: number
}

export interface DisabilityCategoryItem {
  category: string
  count: number
}

// Pipeline order for status funnel display
const STATUS_ORDER: string[] = [
  'RECEIVED',
  'PROCESSING',
  'PENDING_REVIEW',
  'PENDING_PARTICIPANT_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CLAIMED',
  'PAID',
]

// ─── Processing Time Metrics ─────────────────────────────

interface RawProcessingRow {
  avgDays: string | null
  p50Days: string | null
  p90Days: string | null
  withinSla: string | bigint
  totalProcessed: string | bigint
}

export async function getProcessingTimeMetrics(): Promise<ProcessingTimeMetrics> {
  const rows = await prisma.$queryRaw<RawProcessingRow[]>(Prisma.sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("firstApprovedAt" - "receivedAt")) / 86400) as "avgDays",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("firstApprovedAt" - "receivedAt")) / 86400) as "p50Days",
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("firstApprovedAt" - "receivedAt")) / 86400) as "p90Days",
      COUNT(*) FILTER (WHERE "firstApprovedAt" - "receivedAt" <= INTERVAL '5 days') as "withinSla",
      COUNT(*) as "totalProcessed"
    FROM inv_invoices
    WHERE "firstApprovedAt" IS NOT NULL AND "deletedAt" IS NULL
  `)

  const row = rows[0]

  if (!row) {
    return {
      avgDays: 0,
      p50Days: 0,
      p90Days: 0,
      slaComplianceRate: 100,
      totalProcessed: 0,
      withinSla: 0,
    }
  }

  const totalProcessed = Number(row.totalProcessed ?? 0)
  const withinSla = Number(row.withinSla ?? 0)

  return {
    avgDays: row.avgDays != null ? Math.round(Number(row.avgDays) * 10) / 10 : 0,
    p50Days: row.p50Days != null ? Math.round(Number(row.p50Days) * 10) / 10 : 0,
    p90Days: row.p90Days != null ? Math.round(Number(row.p90Days) * 10) / 10 : 0,
    slaComplianceRate: totalProcessed > 0
      ? Math.round((withinSla / totalProcessed) * 10000) / 100
      : 100,
    totalProcessed,
    withinSla,
  }
}

// ─── Status Funnel ───────────────────────────────────────

export async function getStatusFunnel(): Promise<StatusFunnelItem[]> {
  const grouped = await prisma.invStatusHistory.groupBy({
    by: ['toStatus'],
    _count: { toStatus: true },
  })

  const countMap = new Map<string, number>()
  for (const row of grouped) {
    countMap.set(row.toStatus, row._count.toStatus)
  }

  // Return in pipeline order, including all statuses (even zero-count ones)
  return STATUS_ORDER.map((status) => ({
    status,
    count: countMap.get(status) ?? 0,
  })).filter((item) => item.count > 0)
}

// ─── Hold Category Breakdown ─────────────────────────────

export async function getHoldCategoryBreakdown(): Promise<HoldCategoryItem[]> {
  const grouped = await prisma.invStatusHistory.groupBy({
    by: ['holdCategory'],
    _count: { holdCategory: true },
    where: { holdCategory: { not: null } },
  })

  return grouped
    .filter((row) => row.holdCategory !== null)
    .map((row) => ({
      category: row.holdCategory as string,
      count: row._count.holdCategory,
    }))
    .sort((a, b) => b.count - a.count)
}

// ─── Volume Over Time ─────────────────────────────────────

interface RawVolumeRow {
  period: Date
  count: string | bigint
}

export async function getVolumeOverTime(periodMonths = 6): Promise<VolumeDataPoint[]> {
  const rows = await prisma.$queryRaw<RawVolumeRow[]>(Prisma.sql`
    SELECT
      DATE_TRUNC('month', "receivedAt") as "period",
      COUNT(*) as "count"
    FROM inv_invoices
    WHERE
      "deletedAt" IS NULL
      AND "receivedAt" >= NOW() - (${periodMonths} || ' months')::INTERVAL
    GROUP BY DATE_TRUNC('month', "receivedAt")
    ORDER BY "period" ASC
  `)

  return rows.map((row) => {
    const d = new Date(row.period)
    const label = d.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
    return {
      period: label,
      count: Number(row.count),
    }
  })
}

// ─── Disability Category Breakdown ───────────────────────

export async function getDisabilityCategoryBreakdown(): Promise<DisabilityCategoryItem[]> {
  // Count participants with a non-null disabilityCategory, grouped by that value
  const grouped = await prisma.crmParticipant.groupBy({
    by: ['disabilityCategory'],
    _count: { disabilityCategory: true },
    where: {
      deletedAt: null,
      disabilityCategory: { not: null },
    },
  })

  // Count nulls separately as "Not Specified"
  const nullCount = await prisma.crmParticipant.count({
    where: {
      deletedAt: null,
      disabilityCategory: null,
    },
  })

  const result: DisabilityCategoryItem[] = grouped
    .filter((row) => row.disabilityCategory !== null)
    .map((row) => ({
      category: row.disabilityCategory as string,
      count: row._count.disabilityCategory,
    }))
    .sort((a, b) => b.count - a.count)

  if (nullCount > 0) {
    result.push({ category: 'Not Specified', count: nullCount })
  }

  return result
}
