/**
 * Budget / My Plan screen.
 * Shows the participant's active plan period, total budget progress,
 * and a breakdown of budget by support category.
 *
 * REQ-012: WCAG 2.1 AA — progress bars have accessibilityRole + accessibilityValue.
 * Emerald theme (#059669) to match Lotus PM brand.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  AccessibilityInfo,
} from 'react-native'
import { getActivePlan } from '@/api/client'
import type { Plan, BudgetLine } from '@/types'

const EMERALD = '#059669'

function formatAUD(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function planStatusLabel(status: Plan['status']): string {
  switch (status) {
    case 'ACTIVE': return 'Active'
    case 'EXPIRING_SOON': return 'Expiring soon'
    case 'EXPIRED': return 'Expired'
    case 'UNDER_REVIEW': return 'Under review'
    case 'INACTIVE': return 'Inactive'
  }
}

function planStatusColor(status: Plan['status']): string {
  switch (status) {
    case 'ACTIVE': return '#10b981' // emerald-500
    case 'EXPIRING_SOON': return '#f59e0b'
    case 'EXPIRED': return '#ef4444'
    case 'UNDER_REVIEW': return '#3b82f6'
    case 'INACTIVE': return '#9ca3af'
  }
}

function barColor(pct: number): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 75) return '#f59e0b'
  return EMERALD
}

interface BudgetBarProps {
  line: BudgetLine
}

function BudgetBar({ line }: BudgetBarProps): React.JSX.Element {
  const pct = Math.min(line.usedPercent, 100)
  const color = barColor(pct)
  const a11yLabel = `${line.categoryName}: ${formatAUD(line.spentCents)} spent of ${formatAUD(line.allocatedCents)} allocated. ${Math.round(pct)} percent used.`

  return (
    <View style={styles.budgetCard} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.budgetCardHeader}>
        <Text style={styles.categoryName} numberOfLines={2}>
          {line.categoryName}
        </Text>
        <Text style={styles.categoryCode}>{line.categoryCode}</Text>
      </View>

      {/* Progress bar */}
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${pct}%` as `${number}%`, backgroundColor: color },
          ]}
        />
      </View>

      <View style={styles.budgetAmounts}>
        <Text style={styles.spentLabel}>
          <Text style={[styles.spentValue, { color }]}>{formatAUD(line.spentCents)}</Text>
          {' spent'}
        </Text>
        <Text style={styles.availableLabel}>
          {formatAUD(line.availableCents)} available
        </Text>
      </View>

      <Text style={styles.allocatedLabel}>
        Total allocated: {formatAUD(line.allocatedCents)}
      </Text>
    </View>
  )
}

export function BudgetScreen(): React.JSX.Element {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const res = await getActivePlan()
      setPlan(res.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load plan'
      setError(msg)
      AccessibilityInfo.announceForAccessibility(`Error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  async function onRefresh(): Promise<void> {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={EMERALD} accessibilityLabel="Loading plan data" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>
      </View>
    )
  }

  if (!plan) {
    return (
      <View style={styles.centred}>
        <Text style={styles.emptyText}>No active plan found.</Text>
      </View>
    )
  }

  const totalAllocated = plan.budgetLines.reduce((s, l) => s + l.allocatedCents, 0)
  const totalSpent = plan.budgetLines.reduce((s, l) => s + l.spentCents, 0)
  const totalAvailable = totalAllocated - totalSpent
  const overallPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0

  const statusColor = planStatusColor(plan.status)

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={EMERALD} />}
    >
      {/* Plan summary hero card */}
      <View
        style={styles.heroCard}
        accessible
        accessibilityLabel={`Plan status: ${planStatusLabel(plan.status)}. Total budget: ${formatAUD(totalAllocated)}. Spent: ${formatAUD(totalSpent)}. Available: ${formatAUD(totalAvailable)}.`}
      >
        <View style={styles.heroHeader}>
          <Text style={styles.heroTitle}>My Plan</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '25', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {planStatusLabel(plan.status)}
            </Text>
          </View>
        </View>

        {/* Plan dates */}
        <Text style={styles.heroDates}>
          {formatDate(plan.startDate)} — {formatDate(plan.endDate)}
        </Text>

        {/* Total progress bar */}
        <View style={styles.heroProgressSection}>
          <View style={styles.heroProgressHeader}>
            <Text style={styles.heroProgressLabel}>Total budget used</Text>
            <Text style={styles.heroProgressPct}>{overallPct}%</Text>
          </View>
          <View
            style={styles.heroProgressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: overallPct }}
          >
            <View
              style={[
                styles.heroProgressFill,
                { width: `${overallPct}%` as `${number}%`, backgroundColor: barColor(overallPct) },
              ]}
            />
          </View>
        </View>

        {/* Summary row */}
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{formatAUD(totalAllocated)}</Text>
            <Text style={styles.heroStatLabel}>Total</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{formatAUD(totalSpent)}</Text>
            <Text style={styles.heroStatLabel}>Spent</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: '#34d399' }]}>{formatAUD(totalAvailable)}</Text>
            <Text style={styles.heroStatLabel}>Available</Text>
          </View>
        </View>
      </View>

      {/* Budget category breakdown */}
      <Text style={styles.sectionTitle} accessibilityRole="header">
        By support category
      </Text>

      {plan.budgetLines.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No budget categories found.</Text>
        </View>
      ) : (
        plan.budgetLines.map((line) => <BudgetBar key={line.id} line={line} />)
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' }, // emerald-50
  content: { padding: 16, paddingBottom: 36 },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 15, textAlign: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15, textAlign: 'center' },

  heroCard: {
    backgroundColor: '#065f46', // emerald-800
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#064e3b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  heroDates: { color: '#a7f3d0', fontSize: 13, marginBottom: 16 }, // emerald-200

  heroProgressSection: { marginBottom: 16 },
  heroProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroProgressLabel: { color: '#d1fae5', fontSize: 12 }, // emerald-100
  heroProgressPct: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  heroProgressTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  heroProgressFill: { height: 10, borderRadius: 5 },

  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  heroStatLabel: { color: '#a7f3d0', fontSize: 11, marginTop: 2 },
  heroStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#064e3b',
    marginBottom: 10,
    marginTop: 4,
  },
  emptyState: { paddingVertical: 32, alignItems: 'center' },

  budgetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  budgetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  categoryName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  categoryCode: {
    fontSize: 12,
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: 8, borderRadius: 4 },
  budgetAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  spentLabel: { fontSize: 13, color: '#374151' },
  spentValue: { fontWeight: '600' },
  availableLabel: { fontSize: 13, color: EMERALD, fontWeight: '600' },
  allocatedLabel: { fontSize: 12, color: '#6b7280' },
})
