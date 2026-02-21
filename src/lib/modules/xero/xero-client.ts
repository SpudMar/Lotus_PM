/**
 * Xero API Client — typed wrappers around Xero REST API v2.
 * All calls auto-refresh the access token before sending.
 * REQ-019/REQ-023: Xero integration.
 */

import { getActiveXeroConnection } from './xero-auth'
import type { XeroInvoice, XeroContact, XeroInvoicesResponse, XeroContactsResponse } from './types'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

/**
 * Make an authenticated request to the Xero API.
 * Automatically injects the tenant ID and access token.
 */
async function xeroFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const conn = await getActiveXeroConnection()
  if (!conn) {
    throw new Error('Xero is not connected. Connect via Settings > Integrations > Xero.')
  }

  const url = `${XERO_API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${conn.accessToken}`,
      'Xero-Tenant-Id': conn.tenantId,
      ...(options.headers ?? {}),
    },
  })

  return response
}

// ─── Contacts (Providers) ─────────────────────────────────────────────────────

/**
 * Find a Xero contact by name. Returns the first match or null.
 */
export async function findXeroContactByName(name: string): Promise<XeroContact | null> {
  // URL-encode and search via the Xero API
  const where = encodeURIComponent(`Name="${name}"`)
  const response = await xeroFetch(`/Contacts?where=${where}`)

  if (!response.ok) {
    if (response.status === 404) return null
    const errorText = await response.text()
    throw new Error(`Xero contact lookup failed (${response.status}): ${errorText}`)
  }

  const data = await response.json() as XeroContactsResponse
  return data.Contacts?.[0] ?? null
}

/**
 * Create a new Xero contact (for a provider we haven't synced before).
 * Returns the created contact with its ContactID.
 */
export async function createXeroContact(contact: XeroContact): Promise<XeroContact> {
  const response = await xeroFetch('/Contacts', {
    method: 'POST',
    body: JSON.stringify({ Contacts: [contact] }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create Xero contact (${response.status}): ${errorText}`)
  }

  const data = await response.json() as XeroContactsResponse
  const created = data.Contacts?.[0]
  if (!created) throw new Error('Xero did not return a contact after creation')
  return created
}

/**
 * Find or create a Xero contact for a provider.
 * Returns the ContactID.
 */
export async function findOrCreateXeroContact(name: string, email?: string | null): Promise<string> {
  const existing = await findXeroContactByName(name)
  if (existing?.ContactID) return existing.ContactID

  const created = await createXeroContact({
    Name: name,
    ...(email ? { EmailAddress: email } : {}),
  })

  if (!created.ContactID) throw new Error('Created Xero contact has no ContactID')
  return created.ContactID
}

// ─── Invoices (Bills = ACCPAY) ────────────────────────────────────────────────

/**
 * Create a new Xero invoice (bill) for an approved NDIS invoice.
 * Returns the Xero InvoiceID.
 */
export async function createXeroInvoice(invoice: XeroInvoice): Promise<string> {
  const response = await xeroFetch('/Invoices', {
    method: 'POST',
    body: JSON.stringify({ Invoices: [invoice] }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create Xero invoice (${response.status}): ${errorText}`)
  }

  const data = await response.json() as XeroInvoicesResponse
  const created = data.Invoices?.[0]
  if (!created?.InvoiceID) throw new Error('Xero did not return an InvoiceID after creation')
  return created.InvoiceID
}

/**
 * Update an existing Xero invoice by its InvoiceID.
 * Used when re-syncing an invoice that already exists in Xero.
 */
export async function updateXeroInvoice(xeroInvoiceId: string, invoice: XeroInvoice): Promise<void> {
  const response = await xeroFetch(`/Invoices/${xeroInvoiceId}`, {
    method: 'POST',
    body: JSON.stringify({ Invoices: [{ ...invoice, InvoiceID: xeroInvoiceId }] }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to update Xero invoice (${response.status}): ${errorText}`)
  }
}

/**
 * Fetch a Xero invoice by ID. Returns null if not found.
 */
export async function getXeroInvoice(xeroInvoiceId: string): Promise<XeroInvoice | null> {
  const response = await xeroFetch(`/Invoices/${xeroInvoiceId}`)

  if (response.status === 404) return null

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch Xero invoice (${response.status}): ${errorText}`)
  }

  const data = await response.json() as XeroInvoicesResponse
  return data.Invoices?.[0] ?? null
}
