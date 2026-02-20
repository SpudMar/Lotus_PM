/**
 * Budget screen — shows participant's active plan and budget category breakdown.
 * REQ-012: WCAG 2.1 AA accessible.
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

function formatAUD(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
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
    case 'ACTIVE': return '#16a34a'
    case 'EXPIRING_SOON': return '#d97706'
    case 'EXPIRED': return '#dc2626'
    case 'UNDER_REVIEW': return '#2563eb'
    case 'INACTIVE': return '#6b7280'
  }
}

interface BudgetBarProps {
  line: BudgetLine
}

function BudgetBar({ line }: BudgetBarProps): React.JSX.Element {
  const pct = Math.min(line.usedPercent, 100)
  const barColor = pct >= 90 ? '#dc2626' : pct >= 75 ? '#d97706' : '#16a34a'
  const a11yLabel = `${line.categoryName}: ${formatAUD(line.spentCents)} spent of ${formatAUD(line.allocatedCents)} allocated. ${Math.round(pct)} percent used.`

  return (
    <View
      style={styles.budgetCard}
      accessible
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.budgetCardHeader}>
        <Text style={styles.categoryName} numberOfLines={1}>
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
        <View style={[styles.progressFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
      </View>

      <View style={styles.budgetAmounts}>
        <Text style={styles.spentLabel}>
          <Text style={[styles.spentValue, { color: barColor }]}>{formatAUD(line.spentCents)}</Text>
          {' spent'}
        </Text>
        <Text style={styles.availableLabel}>
          {formatAUD(line.availableCents)} left
        </Text>
      </View>

      <Text style={styles.allocatedLabel}>
        Allocated: {formatAUD(line.allocatedCents)}
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
        <ActivityIndicator size="large" color="#2563eb" accessibilityLabel="Loading plan data" />
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      {/* Plan summary card */}
      <View
        style={styles.summaryCard}
        accessible
        accessibilityLabel={`Plan status: ${planStatusLabel(plan.status)}. Total budget: ${formatAUD(totalAllocated)}. Spent: ${formatAUD(totalSpent)}. Available: ${formatAUD(totalAvailable)}.`}
      >
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>My Plan</Text>
          <View style={[styles.statusBadge, { backgroundColor: planStatusColor(plan.status) + '20', borderColor: planStatusColor(plan.status) }]}>
            <Text style={[styles.statusText, { color: planStatusColor(plan.status) }]}>
              {planStatusLabel(plan.status)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{formatAUD(totalAllocated)}</Text>
            <Text style={styles.summaryLabel}>Total budget</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{formatAUD(totalSpent)}</Text>
            <Text style={styles.summaryLabel}>Spent</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#16a34a' }]}>{formatAUD(totalAvailable)}</Text>
            <Text style={styles.summaryLabel}>Available</Text>
          </View>
        </View>

        <Text style={styles.planDates}>
          {new Date(plan.startDate).toLocaleDateString('en-AU')} – {new Date(plan.endDate).toLocaleDateString('en-AU')}
        </Text>
      </View>

      {/* Budget lines */}
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Budget by support category
      </Text>

      {plan.budgetLines.length === 0 ? (
        <Text style={styles.emptyText}>No budget lines found.</Text>
      ) : (
        plan.budgetLines.map((line) => <BudgetBar key={line.id} line={line} />)
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32 },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15, textAlign: 'center' },

  summaryCard: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryValue: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  summaryLabel: { color: '#bfdbfe', fontSize: 12, marginTop: 2 },
  planDates: { color: '#bfdbfe', fontSize: 12, textAlign: 'center' },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  budgetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  budgetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  categoryCode: { fontSize: 12, color: '#6b7280', marginLeft: 8 },
  progressTrack: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: 8, borderRadius: 4 },
  budgetAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  spentLabel: { fontSize: 13, color: '#374151' },
  spentValue: { fontWeight: '600' },
  availableLabel: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  allocatedLabel: { fontSize: 12, color: '#9ca3af' },
})
