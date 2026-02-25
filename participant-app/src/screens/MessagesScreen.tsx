/**
 * Messages screen — participant view of their communication history.
 * REQ-012: WCAG 2.1 AA accessible.
 *
 * Shows all comm log entries for this participant — emails, calls, notes, SMS.
 * Empty state shown when no messages exist.
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
import { getMessages } from '@/api/client'
import type { CommLog } from '@/types'

const EMERALD = '#059669'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const TYPE_LABELS: Record<CommLog['type'], string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  SMS: 'SMS',
  IN_PERSON: 'In person',
  PORTAL_MESSAGE: 'Portal message',
  NOTE: 'Note',
}

const DIRECTION_LABELS: Record<CommLog['direction'], string> = {
  INBOUND: 'Received',
  OUTBOUND: 'Sent',
  INTERNAL: 'Internal',
}

interface MessageRowProps {
  item: CommLog
}

function MessageRow({ item }: MessageRowProps): React.JSX.Element {
  const dateStr = formatDate(item.createdAt)
  const typeLabel = TYPE_LABELS[item.type]
  const dirLabel = DIRECTION_LABELS[item.direction]
  const subject = item.subject || '(No subject)'
  const a11yLabel = `${typeLabel} ${dirLabel} on ${dateStr}. ${subject}.`

  return (
    <View style={styles.row} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.rowHeader}>
        <View style={styles.badges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          <View
            style={[
              styles.dirBadge,
              item.direction === 'INBOUND'
                ? styles.dirInbound
                : item.direction === 'OUTBOUND'
                  ? styles.dirOutbound
                  : styles.dirInternal,
            ]}
          >
            <Text
              style={[
                styles.dirBadgeText,
                item.direction === 'INBOUND'
                  ? styles.dirInboundText
                  : item.direction === 'OUTBOUND'
                    ? styles.dirOutboundText
                    : styles.dirInternalText,
              ]}
            >
              {dirLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.date}>{dateStr}</Text>
      </View>
      <Text style={styles.subject} numberOfLines={2}>{subject}</Text>
      {item.body ? (
        <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
      ) : null}
    </View>
  )
}

export function MessagesScreen(): React.JSX.Element {
  const [messages, setMessages] = useState<CommLog[]>([])
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
      const res = await getMessages()
      setMessages(res.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load messages'
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

  const renderItem: ListRenderItem<CommLog> = ({ item }) => <MessageRow item={item} />

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={EMERALD} accessibilityLabel="Loading messages" />
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
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={EMERALD} />
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon} accessibilityElementsHidden importantForAccessibility="no">💬</Text>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>
            Your correspondence with your plan manager will appear here.
          </Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f0fdf4' },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#ef4444', fontSize: 15, textAlign: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },

  row: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badges: { flexDirection: 'row', gap: 6 },

  typeBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  dirBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  dirInbound: { backgroundColor: '#eff6ff' },
  dirOutbound: { backgroundColor: '#f0fdf4' },
  dirInternal: { backgroundColor: '#f5f3ff' },
  dirBadgeText: { fontSize: 11, fontWeight: '600' },
  dirInboundText: { color: '#2563eb' },
  dirOutboundText: { color: EMERALD },
  dirInternalText: { color: '#7c3aed' },

  date: { fontSize: 12, color: '#9ca3af' },
  subject: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  body: { fontSize: 13, color: '#4b5563', lineHeight: 18 },
})
