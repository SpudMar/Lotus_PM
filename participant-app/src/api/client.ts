/**
 * API client for the Lotus PM backend (Next.js).
 * REQ-016: All data in transit via HTTPS.
 * REQ-011: API base URL points to AWS ap-southeast-2 hosted service.
 */

import * as SecureStore from 'expo-secure-store'
import type { Plan, Invoice, CommLog, Document } from '@/types'

const API_BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://planmanager.lotusassist.com.au'

const SESSION_KEY = 'lotus_pm_session'

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY)
}

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, token)
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY)
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getStoredToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string
  participant: {
    id: string
    firstName: string
    lastName: string
    ndisNumber: string
  }
}

export async function login(ndisNumber: string, pin: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/api/participant/auth/login', {
    method: 'POST',
    body: JSON.stringify({ ndisNumber, pin }),
  })
}

// ─── Budget / Plans ───────────────────────────────────────────────────────────

export async function getActivePlan(): Promise<{ data: Plan }> {
  return apiFetch<{ data: Plan }>('/api/participant/plan/active')
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<{ data: Invoice[] }> {
  return apiFetch<{ data: Invoice[] }>('/api/participant/invoices')
}

// ─── Communications ───────────────────────────────────────────────────────────

export async function getMessages(): Promise<{ data: CommLog[] }> {
  return apiFetch<{ data: CommLog[] }>('/api/participant/messages')
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getDocuments(): Promise<{ data: Document[] }> {
  return apiFetch<{ data: Document[] }>('/api/participant/documents')
}
