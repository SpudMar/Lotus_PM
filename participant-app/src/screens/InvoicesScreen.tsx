/**
 * Invoices screen — participant view of their invoices and statuses.
 * REQ-012: WCAG 2.1 AA accessible.
 * REQ-015: Participants can see invoice processing status.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  AccessibilityInfo,
  type ListRenderItem,
} from 'react-native'
import { getInvoices } from '@/api/client'
import type { Invoice } from '@/types'

function formatAUD(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

interface StatusConfig {
  label: string
  color: string
  bg: string
}

const STATUS_CONFIG: Record<Invoice['status'], StatusConfig> = {
  RECEIVED: { label: 'Received', color: '#6b7280', bg: '#f3f4f6' },
  PROCESSING: { label: 'Processing', color: '#2563eb', bg: '#eff6ff' },
  PENDING_REVIEW: { label: 'Pending review', color: '#d97706', bg: '#fffbeb' },
  APPROVED: { label: 'Approved', color: '#16a34a', bg: '#f0fdf4' },
  REJECTED: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
  CLAIMED: { label: 'Claimed', color: '#7c3aed', bg: '#f5f3ff' },
  PAID: { label: 'Paid', color: '#16a34a', bg: '#f0fdf4' },
}

interface InvoiceRowProps {
  invoice: Invoice
}

function InvoiceRow({ invoice }: InvoiceRowProps): React.JSX.Element {
  const cfg = STATUS_CONFIG[invoice.status]
  const dateStr = new Date(invoice.invoiceDate).toLocaleDateString('en-AU')
  const a11yLabel = `Invoice ${invoice.invoiceNumber} from ${invoice.provider.name}. Date: ${dateStr}. Amount: ${formatAUD(invoice.totalCents)}. Status: ${cfg.label}.`

  return (
    <View style={styles.row} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.rowMain}>
        <Text style={styles.invoiceNumber} numberOfLines={1}>
          {invoice.invoiceNumber}
        </Text>
        <Text style={styles.providerName} numberOfLines={1}>
          {invoice.provider.name}
        </Text>
        <Text style={styles.invoiceDate}>{dateStr}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.amount}>{formatAUD(invoice.totalCents)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
    </View>
  )
}

export function InvoicesScreen(): React.JSX.Element {
  const [invoices, setInvoices] = useState<Invoice[]>([])
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
      const res = await getInvoices()
      setInvoices(res.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load invoices'
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

  const renderItem: ListRenderItem<Invoice> = ({ item }) => <InvoiceRow invoice={item} />

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#2563eb" accessibilityLabel="Loading invoices" />
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

  return (
    <FlatList
      data={invoices}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={invoices.length === 0 ? styles.emptyContainer : styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No invoices found.</Text>
      }
      ListHeaderComponent={
        <Text style={styles.listHeader} accessibilityRole="header">
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </Text>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15, textAlign: 'center' },
  listHeader: { fontSize: 12, color: '#6b7280', marginBottom: 10 },

  row: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rowMain: { flex: 1, marginRight: 12 },
  invoiceNumber: { fontSize: 14, fontWeight: '700', color: '#111827' },
  providerName: { fontSize: 13, color: '#374151', marginTop: 2 },
  invoiceDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  amount: { fontSize: 15, fontWeight: '700', color: '#111827' },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
})
