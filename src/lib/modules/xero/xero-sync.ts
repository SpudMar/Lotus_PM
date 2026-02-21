/**
 * Xero Invoice Sync — maps Lotus PM invoices to Xero bills (ACCPAY).
 * REQ-019/REQ-023: Two-way sync — invoices → Xero bills.
 *
 * Sync rules:
 * - Only APPROVED invoices are synced (not RECEIVED, PENDING_REVIEW, REJECTED)
 * - Each invoice syncs as an ACCPAY (bill) in Xero
 * - Provider maps to Xero Contact (find or create)
 * - Invoice lines map to Xero LineItems
 * - Re-syncing an invoice that already has a xeroInvoiceId updates the Xero bill
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { findOrCreateXeroContact, createXeroInvoice, updateXeroInvoice } from './xero-client'
import { getActiveXeroConnection } from './xero-auth'
import type { XeroInvoice, XeroLineItem, XeroSyncResult, XeroSyncError, XeroBulkSyncResult } from './types'
import { format } from 'date-fns'

// GST tax type for Xero (INPUT = GST on purchases/bills)
const GST_TAX_TYPE = 'INPUT2' // Standard GST on purchases in Xero
const NO_GST_TAX_TYPE = 'EXEMPTEXPENSES' // No GST

// Default Xero account code for NDIS expenses
// Organisations should configure this to match their Xero chart of accounts
const DEFAULT_ACCOUNT_CODE = '200'

/**
 * Format a date as "YYYY-MM-DD" for the Xero API.
 */
function formatXeroDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Convert cents to dollars (Xero uses dollars with 2dp).
 */
function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * Build a Xero LineItem from an InvInvoiceLine.
 */
function buildXeroLineItem(line: {
  supportItemCode: string
  supportItemName: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  gstCents: number
}): XeroLineItem {
  return {
    Description: `[${line.supportItemCode}] ${line.supportItemName}`,
    Quantity: line.quantity,
    UnitAmount: centsToDollars(line.unitPriceCents),
    TaxType: line.gstCents > 0 ? GST_TAX_TYPE : NO_GST_TAX_TYPE,
    AccountCode: DEFAULT_ACCOUNT_CODE,
  }
}

/**
 * Sync a single APPROVED invoice to Xero.
 * Creates or updates the Xero bill and records the xeroInvoiceId in DB.
 */
export async function syncInvoiceToXero(
  invoiceId: string,
  userId: string
): Promise<XeroSyncResult> {
  // Verify Xero is connected before any DB queries
  const conn = await getActiveXeroConnection()
  if (!conn) {
    throw new Error('Xero is not connected')
  }

  // Fetch the invoice with all required relations
  const invoice = await prisma.invInvoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: {
      provider: { select: { id: true, name: true, email: true } },
      lines: {
        select: {
          supportItemCode: true,
          supportItemName: true,
          quantity: true,
          unitPriceCents: true,
          totalCents: true,
          gstCents: true,
        },
      },
    },
  })

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  if (invoice.status !== 'APPROVED') {
    throw new Error(
      `Invoice ${invoiceId} cannot be synced — only APPROVED invoices sync to Xero (current status: ${invoice.status})`
    )
  }

  // Find or create the Xero Contact for this provider
  const contactId = await findOrCreateXeroContact(
    invoice.provider.name,
    invoice.provider.email
  )

  // Build line items
  const lineItems: XeroLineItem[] = invoice.lines.length > 0
    ? invoice.lines.map(buildXeroLineItem)
    : [
        // Fallback single line if no detailed lines (shouldn't happen in practice)
        {
          Description: `Invoice ${invoice.invoiceNumber} — NDIS Support Services`,
          Quantity: 1,
          UnitAmount: centsToDollars(invoice.subtotalCents),
          TaxType: invoice.gstCents > 0 ? GST_TAX_TYPE : NO_GST_TAX_TYPE,
          AccountCode: DEFAULT_ACCOUNT_CODE,
        },
      ]

  const xeroInvoice: XeroInvoice = {
    Type: 'ACCPAY',
    Contact: { ContactID: contactId, Name: invoice.provider.name },
    LineItems: lineItems,
    Date: formatXeroDate(invoice.invoiceDate),
    InvoiceNumber: invoice.invoiceNumber,
    Reference: invoice.id, // Our internal ID as reference
    Status: 'DRAFT',
    CurrencyCode: 'AUD',
  }

  let xeroInvoiceId: string
  let created: boolean

  if (invoice.xeroInvoiceId) {
    // Already synced — update the existing Xero bill
    await updateXeroInvoice(invoice.xeroInvoiceId, xeroInvoice)
    xeroInvoiceId = invoice.xeroInvoiceId
    created = false
  } else {
    // First sync — create new Xero bill
    xeroInvoiceId = await createXeroInvoice(xeroInvoice)
    created = true
  }

  // Record the Xero ID and sync timestamp in our DB
  await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      xeroInvoiceId,
      xeroSyncedAt: new Date(),
    },
  })

  // Audit log
  await createAuditLog({
    userId,
    action: 'xero.invoice.synced',
    resource: 'invoice',
    resourceId: invoiceId,
    after: { xeroInvoiceId, created },
  })

  return {
    invoiceId,
    xeroInvoiceId,
    created,
    providerName: invoice.provider.name,
    amountCents: invoice.totalCents,
  }
}

/**
 * Sync all APPROVED invoices that haven't been synced to Xero yet.
 * Returns a summary of synced and failed invoices.
 */
export async function syncPendingInvoicesToXero(userId: string): Promise<XeroBulkSyncResult> {
  // Verify Xero is connected
  const conn = await getActiveXeroConnection()
  if (!conn) {
    throw new Error('Xero is not connected')
  }

  // Find all approved invoices not yet synced
  const pendingInvoices = await prisma.invInvoice.findMany({
    where: {
      status: 'APPROVED',
      xeroInvoiceId: null,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { approvedAt: 'asc' },
    take: 100, // Safety limit — process in batches
  })

  const synced: XeroSyncResult[] = []
  const errors: XeroSyncError[] = []

  for (const { id } of pendingInvoices) {
    try {
      const result = await syncInvoiceToXero(id, userId)
      synced.push(result)
    } catch (error) {
      errors.push({
        invoiceId: id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Update lastSyncAt on the connection
  await prisma.xeroConnection.update({
    where: { id: conn.connectionId },
    data: {
      lastSyncAt: new Date(),
      ...(errors.length > 0
        ? {
            syncErrorCount: { increment: errors.length },
            lastSyncError: errors[0]?.error ?? null,
          }
        : { lastSyncError: null }),
    },
  })

  return { synced, errors }
}
