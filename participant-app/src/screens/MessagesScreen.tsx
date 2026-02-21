/**
 * Messages screen — participant view of communications log.
 * REQ-012: WCAG 2.1 AA accessible.
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

const TYPE_LABELS: Record<CommLog['type'], string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  SMS: 'SMS',
  IN_PERSON: 'In person',
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
  const dateStr = new Date(item.createdAt).toLocaleDateString('en-AU')
  const typeLabel = TYPE_LABELS[item.type]
  const dirLabel = DIRECTION_LABELS[item.direction]
  const a11yLabel = `${typeLabel} ${dirLabel} on ${dateStr}. ${item.subject}.${item.body ? ` ${item.body}` : ''}`

  return (
    <View style={styles.row} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.rowHeader}>
        <View style={styles.badges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          <View style={[styles.dirBadge, item.direction === 'INBOUND' ? styles.dirInbound : styles.dirOutbound]}>
            <Text style={[styles.dirBadgeText, item.direction === 'INBOUND' ? styles.dirInboundText : styles.dirOutboundText]}>
              {dirLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.date}>{dateStr}</Text>
      </View>
      <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>
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
        <ActivityIndicator size="large" color="#2563eb" accessibilityLabel="Loading messages" />
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No messages yet.</Text>
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

  row: {
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
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badges: { flexDirection: 'row', gap: 6 },
  typeBadge: { backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  typeBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  dirBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  dirInbound: { backgroundColor: '#eff6ff' },
  dirOutbound: { backgroundColor: '#f0fdf4' },
  dirInboundText: { fontSize: 11, fontWeight: '600', color: '#2563eb' },
  dirOutboundText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  date: { fontSize: 12, color: '#9ca3af' },
  subject: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  body: { fontSize: 13, color: '#4b5563', lineHeight: 18 },
})
