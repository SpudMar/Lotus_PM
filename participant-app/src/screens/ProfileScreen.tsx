/**
 * Profile screen — shows participant info and sign-out.
 * REQ-012: WCAG 2.1 AA accessible.
 */

import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native'
import type { AuthSession } from '@/types'

function formatNdisNumber(n: string): string {
  const digits = n.replace(/\D/g, '')
  if (digits.length !== 9) return n
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}

interface Props {
  session: AuthSession
  onSignOut: () => void
}

export function ProfileScreen({ session, onSignOut }: Props): React.JSX.Element {
  function handleSignOut(): void {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: onSignOut },
      ],
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar placeholder */}
      <View style={styles.avatarContainer} accessible accessibilityLabel={`Profile for ${session.name}`}>
        <View style={styles.avatar} accessibilityElementsHidden>
          <Text style={styles.avatarInitial}>
            {session.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{session.name}</Text>
        <Text style={styles.ndisNumber}>{formatNdisNumber(session.ndisNumber)}</Text>
      </View>

      {/* Info rows */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Account details</Text>

        <View style={styles.infoRow} accessible accessibilityLabel={`Name: ${session.name}`}>
          <Text style={styles.infoLabel}>Name</Text>
          <Text style={styles.infoValue}>{session.name}</Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.infoRow} accessible accessibilityLabel={`NDIS number: ${formatNdisNumber(session.ndisNumber)}`}>
          <Text style={styles.infoLabel}>NDIS number</Text>
          <Text style={styles.infoValue}>{formatNdisNumber(session.ndisNumber)}</Text>
        </View>
      </View>

      {/* Help */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Support</Text>
        <View style={styles.infoRow} accessible>
          <Text style={styles.infoLabel}>Plan manager</Text>
          <Text style={styles.infoValue}>Lotus Assist</Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.infoRow} accessible accessibilityLabel="Contact: 1300 000 000">
          <Text style={styles.infoLabel}>Contact</Text>
          <Text style={styles.infoValue}>1300 000 000</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Lotus PM v1.0 · REQ-012 WCAG 2.1 AA</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },

  avatarContainer: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarInitial: { color: '#ffffff', fontSize: 30, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827' },
  ndisNumber: { fontSize: 14, color: '#6b7280', marginTop: 4 },

  section: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e7eb', marginHorizontal: 16 },
  infoLabel: { fontSize: 14, color: '#374151' },
  infoValue: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  signOutButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  signOutText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 11, color: '#d1d5db' },
})
