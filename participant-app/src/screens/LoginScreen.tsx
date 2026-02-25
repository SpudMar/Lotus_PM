/**
 * Login screen.
 * REQ-012: WCAG 2.1 AA — all form fields have accessible labels, touch targets >= 44px.
 * REQ-016: Credentials sent over HTTPS only.
 *
 * Auth flow: NDIS number (XXX-XXXX-XXXX) + date of birth (DD/MM/YYYY).
 * Token stored in SecureStore after successful login.
 */

import React, { useRef, useState } from 'react'
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
  ScrollView,
  type TextInput as TextInputType,
} from 'react-native'
import { login, storeToken } from '@/api/client'
import type { AuthSession } from '@/types'

// Emerald brand colour — REQ-012 WCAG AA contrast on white bg
const EMERALD = '#059669'
const EMERALD_LIGHT = '#d1fae5'
const EMERALD_DISABLED = '#6ee7b7'

interface Props {
  onLogin: (session: AuthSession) => void
}

/**
 * Formats a string of digits as XXX-XXXX-XXXX (NDIS number display format).
 * Raw NDIS numbers are 9 digits; displayed with hyphens for readability.
 */
function formatNdisDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

/**
 * Formats a string of digits as DD/MM/YYYY.
 */
function formatDobDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/**
 * Converts DD/MM/YYYY display string to ISO YYYY-MM-DD for the API.
 * Returns null if the string is not a complete valid date.
 */
function dobToISO(display: string): string | null {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const day = parseInt(digits.slice(0, 2), 10)
  const month = parseInt(digits.slice(2, 4), 10)
  const year = parseInt(digits.slice(4, 8), 10)
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return iso
}

export function LoginScreen({ onLogin }: Props): React.JSX.Element {
  const [ndisInput, setNdisInput] = useState('')
  const [dobInput, setDobInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ ndis?: string; dob?: string }>({})

  const dobRef = useRef<TextInputType>(null)

  function handleNdisChange(text: string): void {
    const formatted = formatNdisDisplay(text)
    setNdisInput(formatted)
    // Auto-advance to DOB when NDIS is complete (XXX-XXXX-XXXX = 11 chars)
    if (formatted.length === 11) {
      dobRef.current?.focus()
    }
  }

  function handleDobChange(text: string): void {
    setDobInput(formatDobDisplay(text))
  }

  function validate(): boolean {
    const next: typeof errors = {}
    const rawNdis = ndisInput.replace(/\D/g, '')
    if (rawNdis.length !== 9) {
      next.ndis = 'Enter your 9-digit NDIS number'
    }
    if (!dobToISO(dobInput)) {
      next.dob = 'Enter a valid date of birth (DD/MM/YYYY)'
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
      const rawNdis = ndisInput.replace(/\D/g, '')
      const isoDate = dobToISO(dobInput)!
      const res = await login(rawNdis, isoDate)
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
        err instanceof Error ? err.message : 'Check your NDIS number and date of birth.',
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branding */}
        <View style={styles.brand} accessibilityElementsHidden>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>L</Text>
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Lotus PM
        </Text>
        <Text style={styles.subtitle}>
          Sign in with your NDIS number and date of birth
        </Text>

        <View style={styles.card}>
          {/* NDIS Number */}
          <View style={styles.field}>
            <Text style={styles.label} nativeID="ndis-label">
              NDIS number
            </Text>
            <TextInput
              style={[styles.input, errors.ndis ? styles.inputError : undefined]}
              value={ndisInput}
              onChangeText={handleNdisChange}
              keyboardType="number-pad"
              maxLength={11}
              placeholder="430-123-456"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="NDIS number"
              accessibilityHint="Enter your 9-digit NDIS number. Format: XXX-XXXX-XXXX"
              accessibilityLabelledBy="ndis-label"
              returnKeyType="next"
              autoComplete="off"
              textContentType="none"
              onSubmitEditing={() => dobRef.current?.focus()}
            />
            {errors.ndis ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {errors.ndis}
              </Text>
            ) : null}
          </View>

          {/* Date of birth */}
          <View style={styles.field}>
            <Text style={styles.label} nativeID="dob-label">
              Date of birth
            </Text>
            <TextInput
              ref={dobRef}
              style={[styles.input, errors.dob ? styles.inputError : undefined]}
              value={dobInput}
              onChangeText={handleDobChange}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="01/01/1990"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="Date of birth"
              accessibilityHint="Enter your date of birth in DD/MM/YYYY format"
              accessibilityLabelledBy="dob-label"
              returnKeyType="go"
              onSubmitEditing={() => void handleLogin()}
            />
            {errors.dob ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {errors.dob}
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
        </View>

        <Text style={styles.helpText}>
          Need help? Contact your plan manager.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4', // emerald-50
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: EMERALD,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#064e3b', // emerald-900
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  field: {
    marginBottom: 18,
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
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
    color: '#111827',
    backgroundColor: '#f9fafb',
    minHeight: 48, // WCAG touch target >= 44px
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 5,
  },
  button: {
    backgroundColor: EMERALD,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 50, // WCAG touch target
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: EMERALD_DISABLED,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  helpText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  // Silence the unused var lint for EMERALD_LIGHT (used for future focus states)
  _unusedEmeraldLight: {
    backgroundColor: EMERALD_LIGHT,
  },
})
