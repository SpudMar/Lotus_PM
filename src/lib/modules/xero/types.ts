/**
 * Xero Integration — Type Definitions
 * REQ-019/REQ-023: Two-way Xero sync (invoices, payments, reconciliation)
 */

// ─── OAuth2 Token Response ────────────────────────────────────────────────────

export interface XeroTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number   // seconds until access_token expires
  token_type: string
  scope: string
}

// ─── Xero Tenant (Organisation) ──────────────────────────────────────────────

export interface XeroTenant {
  id: string           // Connection GUID (not the tenant/org ID)
  tenantId: string     // Organisation GUID — stored in DB
  tenantName: string
  tenantType: string   // "ORGANISATION"
  createdDateUtc: string
  updatedDateUtc: string
}

// ─── Xero Contact (maps to CrmProvider) ──────────────────────────────────────

export interface XeroContact {
  ContactID?: string
  Name: string
  EmailAddress?: string
  Phones?: Array<{ PhoneType: string; PhoneNumber: string }>
}

// ─── Xero LineItem (maps to InvInvoiceLine) ───────────────────────────────────

export interface XeroLineItem {
  Description: string
  Quantity: number
  UnitAmount: number   // dollars, 2dp
  TaxType?: string     // "INPUT" for GST on purchases, "NONE" for no GST
  AccountCode?: string // Xero account code
  LineItemID?: string
}

// ─── Xero Invoice (Bill = ACCPAY type) ───────────────────────────────────────

export interface XeroInvoice {
  InvoiceID?: string
  Type: 'ACCPAY'         // Accounts Payable = bill from provider
  Contact: XeroContact
  LineItems: XeroLineItem[]
  Date: string           // "YYYY-MM-DD"
  DueDate?: string
  InvoiceNumber?: string  // Provider's invoice number (Reference in Xero)
  Reference?: string      // Our internal reference
  Status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED'
  CurrencyCode?: 'AUD'
  SubTotal?: number
  TotalTax?: number
  Total?: number
}

// ─── Xero API Response Envelope ──────────────────────────────────────────────

export interface XeroInvoicesResponse {
  Invoices: XeroInvoice[]
}

export interface XeroContactsResponse {
  Contacts: XeroContact[]
}

// ─── Module-level result types ────────────────────────────────────────────────

export interface XeroSyncResult {
  invoiceId: string        // Our internal invoice ID
  xeroInvoiceId: string    // Xero Invoice GUID
  created: boolean         // true = new; false = updated existing
  providerName: string
  amountCents: number
}

export interface XeroSyncError {
  invoiceId: string
  error: string
}

export interface XeroBulkSyncResult {
  synced: XeroSyncResult[]
  errors: XeroSyncError[]
}

// ─── Connection status ────────────────────────────────────────────────────────

export interface XeroConnectionStatus {
  connected: boolean
  tenantId?: string
  tenantName?: string
  connectedAt?: string
  lastSyncAt?: string | null
  tokenExpiresAt?: string
}
