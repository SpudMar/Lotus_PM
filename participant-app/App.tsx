/**
 * Lotus PM — Participant App root component.
 *
 * REQ-018: Separate participant-facing mobile app.
 * REQ-012: WCAG 2.1 AA minimum accessibility.
 *
 * Architecture:
 * - LoginScreen shown when no session
 * - TabNavigator (Budget / Invoices / Messages / Profile) when authenticated
 * - Session stored securely via expo-secure-store (REQ-016)
 */

import React, { useState, useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { LoginScreen } from '@/screens/LoginScreen'
import { TabNavigator } from '@/navigation/TabNavigator'
import { getStoredToken, clearToken } from '@/api/client'
import type { AuthSession } from '@/types'

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    void bootstrap()
  }, [])

  async function bootstrap(): Promise<void> {
    try {
      // Check if a token is present from a previous session.
      // A real implementation would validate the token against the API.
      const token = await getStoredToken()
      if (!token) {
        setSession(null)
      }
      // If token exists, session will be set on next login or through a /me endpoint.
      // For now, require re-login after app restart.
    } finally {
      setBootstrapping(false)
    }
  }

  async function handleSignOut(): Promise<void> {
    await clearToken()
    setSession(null)
  }

  if (bootstrapping) {
    return (
      <View style={styles.loading} accessibilityLabel="Loading Lotus PM">
        <ActivityIndicator size="large" color="#2563eb" />
        <StatusBar style="auto" />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        {session ? (
          <TabNavigator session={session} onSignOut={() => void handleSignOut()} />
        ) : (
          <LoginScreen onLogin={setSession} />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
})
