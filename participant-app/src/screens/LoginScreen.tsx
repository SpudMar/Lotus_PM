/**
 * Login screen.
 * REQ-012: WCAG 2.1 AA — all form fields have accessible labels.
 * REQ-016: Credentials sent over HTTPS only.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
} from 'react-native'
import { login, storeToken } from '@/api/client'
import type { AuthSession } from '@/types'

interface Props {
  onLogin: (session: AuthSession) => void
}

export function LoginScreen({ onLogin }: Props): React.JSX.Element {
  const [ndisNumber, setNdisNumber] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ ndisNumber?: string; pin?: string }>({})

  function validate(): boolean {
    const next: typeof errors = {}
    if (!/^\d{9}$/.test(ndisNumber.replace(/\s/g, ''))) {
      next.ndisNumber = 'Enter your 9-digit NDIS number'
    }
    if (pin.length < 4) {
      next.pin = 'PIN must be at least 4 digits'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleLogin(): Promise<void> {
    if (!validate()) {
      AccessibilityInfo.announceForAccessibility('Please fix the errors before continuing.')
      return
    }
    setLoading(true)
    try {
      const res = await login(ndisNumber.replace(/\s/g, ''), pin)
      await storeToken(res.token)
      onLogin({
        userId: res.participant.id,
        participantId: res.participant.id,
        name: `${res.participant.firstName} ${res.participant.lastName}`,
        ndisNumber: res.participant.ndisNumber,
        token: res.token,
      })
    } catch (err) {
      Alert.alert(
        'Login failed',
        err instanceof Error ? err.message : 'Check your NDIS number and PIN.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">
          Lotus PM
        </Text>
        <Text style={styles.subtitle}>
          Sign in with your NDIS number and PIN
        </Text>

        {/* NDIS Number */}
        <View style={styles.field}>
          <Text style={styles.label} nativeID="ndis-label">
            NDIS number
          </Text>
          <TextInput
            style={[styles.input, errors.ndisNumber ? styles.inputError : undefined]}
            value={ndisNumber}
            onChangeText={setNdisNumber}
            keyboardType="number-pad"
            maxLength={11}
            placeholder="430 123 456"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="NDIS number"
            accessibilityHint="Enter your 9-digit NDIS number"
            accessibilityLabelledBy="ndis-label"
            returnKeyType="next"
            autoComplete="off"
            textContentType="none"
          />
          {errors.ndisNumber ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {errors.ndisNumber}
            </Text>
          ) : null}
        </View>

        {/* PIN */}
        <View style={styles.field}>
          <Text style={styles.label} nativeID="pin-label">
            PIN
          </Text>
          <TextInput
            style={[styles.input, errors.pin ? styles.inputError : undefined]}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            placeholder="••••"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="PIN"
            accessibilityHint="Enter your 4 to 8 digit PIN"
            accessibilityLabelledBy="pin-label"
            returnKeyType="go"
            onSubmitEditing={() => void handleLogin()}
          />
          {errors.pin ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {errors.pin}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.button, loading ? styles.buttonDisabled : undefined]}
          onPress={() => void handleLogin()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.helpText}>
          Need help? Contact your plan manager.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 20,
  },
})
