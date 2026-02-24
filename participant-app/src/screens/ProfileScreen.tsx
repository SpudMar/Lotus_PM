/**
 * Profile screen — participant's own info and plan manager contact details.
 * REQ-012: WCAG 2.1 AA accessible.
 *
 * Fetches live profile data from /api/participant/profile.
 * Falls back to session data if fetch fails (name + NDIS number always available).
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { getProfile } from '@/api/client'
import type { AuthSession, ParticipantProfile } from '@/types'

const EMERALD = '#059669'

function formatNdisNumber(n: string): string {
  const digits = n.replace(/\D/g, '')
  if (digits.length !== 9) return n
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

interface InfoRowProps {
  label: string
  value: string
  last?: boolean
}

function InfoRow({ label, value, last }: InfoRowProps): React.JSX.Element {
  return (
    <>
      <View
        style={styles.infoRow}
        accessible
        accessibilityLabel={`${label}: ${value}`}
      >
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
      {!last && <View style={styles.separator} />}
    </>
  )
}

interface Props {
  session: AuthSession
  onSignOut: () => void
}

export function ProfileScreen({ session, onSignOut }: Props): React.JSX.Element {
  const [profile, setProfile] = useState<ParticipantProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadProfile()
  }, [])

  async function loadProfile(): Promise<void> {
    try {
      const res = await getProfile()
      setProfile(res.data)
    } catch {
      // Non-fatal — fall back to session data
    } finally {
      setLoading(false)
    }
  }

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

  // Use API data where available, fall back to session values
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : session.name
  const displayNdis = profile?.ndisNumber ?? session.ndisNumber
  const initials = displayName.charAt(0).toUpperCase()

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + name */}
      <View
        style={styles.avatarContainer}
        accessible
        accessibilityLabel={`Profile for ${displayName}`}
      >
        <View style={styles.avatar} accessibilityElementsHidden>
          <Text style={styles.avatarInitial}>{initials}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.ndisDisplay}>{formatNdisNumber(displayNdis)}</Text>
      </View>

      {/* Account details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Account details
        </Text>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={EMERALD} />
          </View>
        ) : (
          <>
            <InfoRow label="Name" value={displayName} />
            <InfoRow label="NDIS number" value={formatNdisNumber(displayNdis)} />
            {profile?.email ? (
              <InfoRow label="Email" value={profile.email} />
            ) : null}
            {profile?.phone ? (
              <InfoRow label="Phone" value={profile.phone} last={!profile?.email} />
            ) : null}
          </>
        )}
      </View>

      {/* Plan manager */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Plan manager
        </Text>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={EMERALD} />
          </View>
        ) : (
          <>
            <InfoRow
              label="Organisation"
              value={profile?.planManager?.name ?? 'Lotus Assist'}
            />
            {profile?.planManager?.email ? (
              <InfoRow label="Email" value={profile.planManager.email} />
            ) : null}
            {profile?.planManager?.phone ? (
              <InfoRow label="Phone" value={profile.planManager.phone} last />
            ) : null}
          </>
        )}
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Lotus PM v1.0 · WCAG 2.1 AA</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' }, // emerald-50
  content: { padding: 16, paddingBottom: 40 },

  avatarContainer: { alignItems: 'center', paddingVertical: 28 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: EMERALD,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarInitial: { color: '#ffffff', fontSize: 34, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: '#064e3b' },
  ndisDisplay: { fontSize: 14, color: '#059669', marginTop: 4, fontWeight: '500' },

  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  loadingRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 48, // WCAG touch target
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
  },
  infoLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#6b7280', flex: 1, textAlign: 'right', marginLeft: 16 },

  signOutButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 50,
  },
  signOutText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 11, color: '#d1d5db' },
})
