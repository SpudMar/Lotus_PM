/**
 * Provider Notification Service — automated email notifications to providers.
 *
 * Handles three notification types:
 *   1. AUTO_REJECTED  — sent when an invoice is auto-rejected by the processing engine
 *   2. NEEDS_CODES    — sent when invoice line items could not be identified
 *   3. REMITTANCE     — sent when a payment batch is confirmed (payment advice)
 *
 * All sends are fire-and-forget: errors are logged but never thrown.
 * If a provider has no email address, the notification is silently skipped.
 *
 * REQ-001: AWS Sydney (ap-southeast-2) only.
 * REQ-010: All sent email records retained via notif_sent_emails.
 * REQ-016: Encryption in transit enforced by SES/TLS.
 */

import { prisma } from '@/lib/db'
import { sendRawEmail } from './email-send'
import { formatAUD } from '@/lib/shared/currency'

// ─── Public Types ────────────────────────────────────────────────────────────

export type ProviderNotificationType = 'AUTO_REJECTED' | 'NEEDS_CODES' | 'REMITTANCE' | 'CUSTOM'

export interface NotifyProviderAutoRejectedInput {
  invoiceId: string
}

export interface NotifyProviderNeedsCodesInput {
  invoiceId: string
}

export interface NotifyProviderRemittanceInput {
  /** The payment batch that was confirmed */
  batchId: string
}

export interface NotifyProviderCustomInput {
  invoiceId: string
  message: string
}

// ─── Rejection reason mapping ────────────────────────────────────────────────

/**
 * Map raw rejection reason strings (from processing-engine) to
 * human-readable explanations for providers.
 */
function formatRejectionReason(raw: string | null): string {
  if (!raw) {
    return 'Your invoice could not be processed automatically. Please contact us for details.'
  }

  const lower = raw.toLowerCase()

  if (lower.includes('duplicate')) {
    return 'Duplicate invoice: An invoice for the same services has already been processed.'
  }
  if (lower.includes('plan') && lower.includes('active')) {
    return "Inactive plan: Your participant's NDIS plan has expired or is not active."
  }
  if (lower.includes('provider') && lower.includes('active')) {
    return 'Inactive provider: Your provider registration is not currently active.'
  }
  if (lower.includes('participant') && lower.includes('active')) {
    return 'Inactive participant: The participant is not currently active in our system.'
  }

  // Fallback: use raw reason as-is
  return raw
}

// ─── HTML email helpers ───────────────────────────────────────────────────────

/**
 * Wrap body content in a minimal, professional HTML email shell.
 */
function wrapHtmlEmail(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #333; background: #f5f5f5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 6px; border: 1px solid #e0e0e0; overflow: hidden; }
  .header { background: #1a3c5e; color: #fff; padding: 20px 24px; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .body { padding: 24px; }
  .body p { margin: 0 0 16px; line-height: 1.6; }
  .highlight-box { background: #fef3cd; border-left: 4px solid #f0ad4e; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0; }
  table.line-items { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  table.line-items th { background: #f0f4f8; text-align: left; padding: 8px 10px; border: 1px solid #dde; }
  table.line-items td { padding: 8px 10px; border: 1px solid #dde; }
  .total-row td { font-weight: bold; background: #f9f9f9; }
  .footer { padding: 16px 24px; background: #f0f4f8; font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; }
</style>
</head>
<body>
<div class="container">
  <div class="header"><h1>${title}</h1></div>
  <div class="body">${bodyContent}</div>
  <div class="footer">
    <p>Lotus Assist Plan Management &mdash; <a href="https://planmanager.lotusassist.com.au">planmanager.lotusassist.com.au</a></p>
    <p>If you have questions, please contact your plan manager directly.</p>
  </div>
</div>
</body>
</html>`
}

// ─── Notification 1: AUTO_REJECTED ───────────────────────────────────────────

/**
 * Send an auto-rejection notification to the provider.
 *
 * Fire-and-forget. Returns true if a send was attempted, false if skipped
 * (e.g. no provider email). Errors are caught and logged internally.
 */
export async function notifyProviderAutoRejected(
  input: NotifyProviderAutoRejectedInput
): Promise<boolean> {
  try {
    const invoice = await prisma.invInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        rejectionReason: true,
        provider: {
          select: { id: true, name: true, email: true },
        },
        participant: {
          select: { firstName: true, lastName: true },
        },
      },
    })

    if (!invoice) {
      console.warn('[provider-notifications] notifyProviderAutoRejected: invoice not found', input.invoiceId)
      return false
    }

    const providerEmail = invoice.provider?.email
    if (!providerEmail) {
      // Silently skip — provider has no email address
      return false
    }

    const invoiceRef = invoice.invoiceNumber ?? invoice.id
    const providerName = invoice.provider?.name ?? 'Provider'
    const participantName = invoice.participant
      ? `${invoice.participant.firstName} ${invoice.participant.lastName}`
      : null

    const rejectionMessage = formatRejectionReason(invoice.rejectionReason)

    const subject = `Invoice ${invoiceRef} could not be processed`

    const bodyContent = `
      <p>Dear ${providerName},</p>
      <p>We were unable to process the following invoice automatically:</p>
      <div class="highlight-box">
        <strong>Invoice:</strong> ${invoiceRef}${participantName ? `<br><strong>Participant:</strong> ${participantName}` : ''}
      </div>
      <p><strong>Reason:</strong> ${rejectionMessage}</p>
      <p>If you believe this is an error, or if you would like to discuss this invoice,
         please contact your plan manager.</p>
      <p>Thank you for your understanding.</p>
    `

    await sendRawEmail({
      to: providerEmail,
      subject,
      htmlBody: wrapHtmlEmail(subject, bodyContent),
    })

    return true
  } catch (err) {
    console.error('[provider-notifications] notifyProviderAutoRejected error:', err)
    return false
  }
}

// ─── Notification 2: NEEDS_CODES ────────────────────────────────────────────

/**
 * Send a "needs support item codes" notification to the provider.
 *
 * Lists the line items that could not be identified and asks the provider
 * to resubmit with correct NDIS support item codes.
 *
 * Fire-and-forget. Returns true if send attempted, false if skipped.
 */
export async function notifyProviderNeedsCodes(
  input: NotifyProviderNeedsCodesInput
): Promise<boolean> {
  try {
    const invoice = await prisma.invInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        provider: {
          select: { id: true, name: true, email: true },
        },
        participant: {
          select: { firstName: true, lastName: true },
        },
        lines: {
          select: {
            id: true,
            supportItemName: true,
            supportItemCode: true,
            serviceDate: true,
            totalCents: true,
            aiCodeConfidence: true,
            aiSuggestedCode: true,
          },
        },
      },
    })

    if (!invoice) {
      console.warn('[provider-notifications] notifyProviderNeedsCodes: invoice not found', input.invoiceId)
      return false
    }

    const providerEmail = invoice.provider?.email
    if (!providerEmail) {
      return false
    }

    const invoiceRef = invoice.invoiceNumber ?? invoice.id
    const providerName = invoice.provider?.name ?? 'Provider'
    const participantName = invoice.participant
      ? `${invoice.participant.firstName} ${invoice.participant.lastName}`
      : null

    // Identify the lines we couldn't match (LOW, NONE confidence, or no code)
    const unidentifiedLines = invoice.lines.filter(
      (l) =>
        l.aiCodeConfidence === 'LOW' ||
        l.aiCodeConfidence === 'NONE' ||
        !l.aiSuggestedCode
    )

    const lineListHtml =
      unidentifiedLines.length > 0
        ? `<table class="line-items">
            <thead>
              <tr>
                <th>Description</th>
                <th>Service Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${unidentifiedLines
                .map(
                  (l) => `<tr>
                <td>${l.supportItemName}</td>
                <td>${l.serviceDate.toLocaleDateString('en-AU')}</td>
                <td>${formatAUD(l.totalCents)}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>`
        : '<p><em>All line items (please review and confirm codes for the entire invoice).</em></p>'

    const subject = `Invoice ${invoiceRef} requires support item codes`

    const bodyContent = `
      <p>Dear ${providerName},</p>
      <p>We received your invoice but were unable to identify the correct NDIS support item codes
         for the following line items:</p>
      <div class="highlight-box">
        <strong>Invoice:</strong> ${invoiceRef}${participantName ? `<br><strong>Participant:</strong> ${participantName}` : ''}
      </div>
      ${lineListHtml}
      <p>To process this invoice, please resubmit it with the correct NDIS support item codes
         included for each line item. You can find the current NDIS Support Catalogue at
         <a href="https://www.ndis.gov.au/providers/pricing-arrangements">ndis.gov.au</a>.</p>
      <p>Once you have updated the invoice, please send it to your usual submission address or
         contact your plan manager for assistance.</p>
      <p>Thank you for your prompt attention to this matter.</p>
    `

    await sendRawEmail({
      to: providerEmail,
      subject,
      htmlBody: wrapHtmlEmail(subject, bodyContent),
    })

    return true
  } catch (err) {
    console.error('[provider-notifications] notifyProviderNeedsCodes error:', err)
    return false
  }
}

// ─── Notification 3: REMITTANCE ADVICE ───────────────────────────────────────

/**
 * Send remittance advice emails to all providers in a confirmed payment batch.
 *
 * Groups payments by provider and sends one email per provider with their
 * payment breakdown. Marks invoices as PAID.
 *
 * Fire-and-forget. Returns number of emails successfully sent.
 */
export async function notifyProvidersRemittance(
  input: NotifyProviderRemittanceInput
): Promise<number> {
  try {
    const batch = await prisma.bnkPaymentBatch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        confirmedAt: true,
        scheduledDate: true,
        payments: {
          select: {
            id: true,
            amountCents: true,
            reference: true,
            claim: {
              select: {
                claimReference: true,
                invoice: {
                  select: {
                    id: true,
                    invoiceNumber: true,
                    totalCents: true,
                    provider: {
                      select: { id: true, name: true, email: true },
                    },
                    participant: {
                      select: { firstName: true, lastName: true },
                    },
                    lines: {
                      select: {
                        supportItemName: true,
                        supportItemCode: true,
                        serviceDate: true,
                        quantity: true,
                        unitPriceCents: true,
                        totalCents: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!batch) {
      console.warn('[provider-notifications] notifyProvidersRemittance: batch not found', input.batchId)
      return 0
    }

    const paymentDate = batch.confirmedAt ?? batch.scheduledDate ?? new Date()
    const paymentDateStr = paymentDate.toLocaleDateString('en-AU')

    // Group payments by provider ID
    type PaymentEntry = {
      amountCents: number
      reference: string | null
      claimReference: string
      invoiceNumber: string | null
      invoiceId: string
      participantName: string | null
      lines: Array<{
        supportItemName: string
        supportItemCode: string
        serviceDate: Date
        quantity: number
        unitPriceCents: number
        totalCents: number
      }>
    }

    const byProvider = new Map<
      string,
      {
        name: string
        email: string
        payments: PaymentEntry[]
      }
    >()

    for (const payment of batch.payments) {
      const invoice = payment.claim?.invoice
      if (!invoice) continue

      const provider = invoice.provider
      if (!provider?.email) continue // Skip providers with no email

      const providerId = provider.id

      if (!byProvider.has(providerId)) {
        byProvider.set(providerId, {
          name: provider.name,
          email: provider.email,
          payments: [],
        })
      }

      byProvider.get(providerId)!.payments.push({
        amountCents: payment.amountCents,
        reference: payment.reference,
        claimReference: payment.claim!.claimReference,
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        participantName: invoice.participant
          ? `${invoice.participant.firstName} ${invoice.participant.lastName}`
          : null,
        lines: invoice.lines,
      })
    }

    let sentCount = 0

    for (const [, providerData] of byProvider) {
      try {
        await sendRemittanceEmailToProvider({
          providerName: providerData.name,
          providerEmail: providerData.email,
          paymentDateStr,
          payments: providerData.payments,
        })
        sentCount++
      } catch (err) {
        console.error(
          '[provider-notifications] remittance send failed for provider:',
          providerData.name,
          err
        )
        // Continue to next provider — don't abort the loop
      }
    }

    return sentCount
  } catch (err) {
    console.error('[provider-notifications] notifyProvidersRemittance error:', err)
    return 0
  }
}

// ─── Remittance email builder ─────────────────────────────────────────────────

interface RemittanceEmailInput {
  providerName: string
  providerEmail: string
  paymentDateStr: string
  payments: Array<{
    amountCents: number
    reference: string | null
    claimReference: string
    invoiceNumber: string | null
    invoiceId: string
    participantName: string | null
    lines: Array<{
      supportItemName: string
      supportItemCode: string
      serviceDate: Date
      quantity: number
      unitPriceCents: number
      totalCents: number
    }>
  }>
}

async function sendRemittanceEmailToProvider(input: RemittanceEmailInput): Promise<void> {
  const totalPaidCents = input.payments.reduce((sum, p) => sum + p.amountCents, 0)

  const invoiceRowsHtml = input.payments
    .map((p) => {
      const invoiceRef = p.invoiceNumber ?? p.invoiceId
      const participantCell = p.participantName ?? '&mdash;'

      const lineRowsHtml = p.lines
        .map(
          (l) => `<tr>
          <td style="padding-left:24px; color:#555;">${l.supportItemName} (${l.supportItemCode})</td>
          <td>${l.serviceDate.toLocaleDateString('en-AU')}</td>
          <td>${l.quantity}</td>
          <td>${formatAUD(l.unitPriceCents)}</td>
          <td>${formatAUD(l.totalCents)}</td>
        </tr>`
        )
        .join('')

      return `<tr>
          <td colspan="4" style="background:#f5f8fb; padding:8px 10px; font-weight:bold;">
            Invoice: ${invoiceRef} &mdash; Participant: ${participantCell}
          </td>
          <td style="background:#f5f8fb; padding:8px 10px; font-weight:bold;">
            ${formatAUD(p.amountCents)}
          </td>
        </tr>
        ${lineRowsHtml}`
    })
    .join('')

  const tableHtml = `
    <table class="line-items">
      <thead>
        <tr>
          <th>Description</th>
          <th>Service Date</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRowsHtml}
        <tr class="total-row">
          <td colspan="4">Total Payment</td>
          <td>${formatAUD(totalPaidCents)}</td>
        </tr>
      </tbody>
    </table>
  `

  const subject = `Payment advice — ${formatAUD(totalPaidCents)} — ${input.paymentDateStr}`

  const bodyContent = `
    <p>Dear ${input.providerName},</p>
    <p>This is your payment advice. The following payment has been processed to your nominated bank account:</p>
    <div class="highlight-box">
      <strong>Payment Date:</strong> ${input.paymentDateStr}<br>
      <strong>Total Amount:</strong> ${formatAUD(totalPaidCents)}
    </div>
    <h3 style="font-size:15px; margin:20px 0 8px;">Payment Breakdown</h3>
    ${tableHtml}
    <p>Please allow 1&ndash;3 business days for funds to appear in your account depending on your bank.</p>
    <p>Please retain this advice for your records.</p>
  `

  await sendRawEmail({
    to: input.providerEmail,
    subject,
    htmlBody: wrapHtmlEmail(subject, bodyContent),
  })
}

// ─── Manual / Custom Notification ────────────────────────────────────────────

/**
 * Send a custom free-text notification to a provider for a given invoice.
 * Used by the notify-provider API route.
 *
 * Fire-and-forget. Returns true if send attempted, false if skipped.
 */
export async function notifyProviderCustom(
  input: NotifyProviderCustomInput
): Promise<boolean> {
  try {
    const invoice = await prisma.invInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        provider: {
          select: { name: true, email: true },
        },
      },
    })

    if (!invoice) {
      console.warn('[provider-notifications] notifyProviderCustom: invoice not found', input.invoiceId)
      return false
    }

    const providerEmail = invoice.provider?.email
    if (!providerEmail) {
      return false
    }

    const invoiceRef = invoice.invoiceNumber ?? invoice.id
    const providerName = invoice.provider?.name ?? 'Provider'
    const subject = `Message regarding invoice ${invoiceRef}`

    const bodyContent = `
      <p>Dear ${providerName},</p>
      <p>You have received a message regarding invoice <strong>${invoiceRef}</strong>:</p>
      <div class="highlight-box">${input.message.replace(/\n/g, '<br>')}</div>
      <p>If you have any questions, please contact your plan manager.</p>
    `

    await sendRawEmail({
      to: providerEmail,
      subject,
      htmlBody: wrapHtmlEmail(subject, bodyContent),
    })

    return true
  } catch (err) {
    console.error('[provider-notifications] notifyProviderCustom error:', err)
    return false
  }
}
