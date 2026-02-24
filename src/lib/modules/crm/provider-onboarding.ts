/**
 * Provider Onboarding Module
 *
 * Manages the lifecycle of provider onboarding:
 *   DRAFT → INVITED → PENDING_APPROVAL → ACTIVE
 *
 * Providers can enter via:
 *   1. PM creates from invoice (DRAFT) → PM sends invite → provider completes profile
 *   2. Provider self-registers (PENDING_APPROVAL directly)
 *
 * REQ-017: All mutations produce audit log entries.
 */

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { sendSesEmail } from '@/lib/modules/notifications/ses-client'
import type { ProviderStatus } from '@prisma/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateProviderFromInvoiceInput {
  name?: string
  abn?: string
  email?: string
  invoiceId?: string
  // ABR-enriched fields (passed in by caller after ABR lookup)
  abnStatus?: string
  abnRegisteredName?: string
  gstRegistered?: boolean
}

export interface CompleteProfileInput {
  name: string
  email: string
  phone?: string
  address?: string
  bankBsb?: string
  bankAccount?: string
  bankAccountName?: string
}

export interface PendingProvider {
  id: string
  name: string
  abn: string
  email: string | null
  phone: string | null
  address: string | null
  abnStatus: string | null
  abnRegisteredName: string | null
  gstRegistered: boolean | null
  bankBsb: string | null
  bankAccount: string | null
  bankAccountName: string | null
  providerStatus: ProviderStatus
  createdAt: Date
  updatedAt: Date
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAppBaseUrl(): string {
  return (
    process.env['NEXT_PUBLIC_APP_URL'] ??
    process.env['NEXTAUTH_URL'] ??
    'https://app.lotusassist.com.au'
  )
}

function getPmNotificationEmail(): string {
  return process.env['PM_NOTIFICATION_EMAIL'] ?? 'pm@lotusassist.com.au'
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Create a CrmProvider record with status DRAFT from an invoice context.
 * Typically called when an invoice arrives with an unknown provider ABN.
 * The caller is responsible for running ABR lookup beforehand and passing enriched data.
 */
export async function createProviderFromInvoice(
  input: CreateProviderFromInvoiceInput,
  userId: string
): Promise<{ id: string; name: string; abn: string }> {
  const provider = await prisma.crmProvider.create({
    data: {
      name: input.name ?? (input.abnRegisteredName ?? 'Unknown Provider'),
      abn: input.abn ?? '',
      email: input.email ?? null,
      providerStatus: 'DRAFT',
      abnStatus: input.abnStatus ?? null,
      abnRegisteredName: input.abnRegisteredName ?? null,
      gstRegistered: input.gstRegistered ?? null,
    },
    select: { id: true, name: true, abn: true },
  })

  await createAuditLog({
    userId,
    action: 'CREATE',
    resource: 'CrmProvider',
    resourceId: provider.id,
    after: {
      providerStatus: 'DRAFT',
      abn: input.abn,
      invoiceId: input.invoiceId,
    },
  })

  return provider
}

/**
 * Send a portal invite to a provider.
 * Generates a 32-byte random token valid for 7 days and emails it to the provider.
 * Sets providerStatus to INVITED.
 */
export async function sendProviderInvite(
  providerId: string,
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const provider = await prisma.crmProvider.findFirst({
    where: { id: providerId, deletedAt: null },
    select: { id: true, name: true, email: true, providerStatus: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  if (!provider.email) {
    throw new Error('Provider has no email address — cannot send invite')
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await prisma.crmProvider.update({
    where: { id: providerId },
    data: {
      inviteToken: token,
      inviteExpiresAt: expiresAt,
      providerStatus: 'INVITED',
    },
  })

  const portalUrl = `${getAppBaseUrl()}/provider-portal/complete-profile?token=${token}`

  await sendSesEmail({
    to: provider.email,
    subject: "You've been invited to the Lotus Assist provider portal",
    htmlBody: buildInviteEmailHtml(provider.name, portalUrl),
    textBody: buildInviteEmailText(provider.name, portalUrl),
  })

  await createAuditLog({
    userId,
    action: 'INVITE_SENT',
    resource: 'CrmProvider',
    resourceId: providerId,
    after: { providerStatus: 'INVITED', inviteExpiresAt: expiresAt.toISOString() },
  })

  return { token, expiresAt }
}

/**
 * Approve a provider — sets providerStatus to ACTIVE.
 * Called by PM after reviewing a PENDING_APPROVAL provider.
 */
export async function approveProvider(
  providerId: string,
  userId: string
): Promise<void> {
  const provider = await prisma.crmProvider.findFirst({
    where: { id: providerId, deletedAt: null },
    select: { id: true, providerStatus: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  const before = { providerStatus: provider.providerStatus }

  await prisma.crmProvider.update({
    where: { id: providerId },
    data: { providerStatus: 'ACTIVE' },
  })

  await createAuditLog({
    userId,
    action: 'APPROVE',
    resource: 'CrmProvider',
    resourceId: providerId,
    before,
    after: { providerStatus: 'ACTIVE' },
  })
}

/**
 * Reject a provider — sets providerStatus back to DRAFT and clears invite token.
 * Called by PM after reviewing a PENDING_APPROVAL provider.
 */
export async function rejectProvider(
  providerId: string,
  reason: string | undefined,
  userId: string
): Promise<void> {
  const provider = await prisma.crmProvider.findFirst({
    where: { id: providerId, deletedAt: null },
    select: { id: true, providerStatus: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  const before = { providerStatus: provider.providerStatus }

  await prisma.crmProvider.update({
    where: { id: providerId },
    data: {
      providerStatus: 'DRAFT',
      inviteToken: null,
      inviteExpiresAt: null,
    },
  })

  await createAuditLog({
    userId,
    action: 'REJECT',
    resource: 'CrmProvider',
    resourceId: providerId,
    before,
    after: { providerStatus: 'DRAFT', reason: reason ?? null },
  })
}

/**
 * List all providers in PENDING_APPROVAL status.
 */
export async function getPendingProviders(): Promise<PendingProvider[]> {
  return prisma.crmProvider.findMany({
    where: { providerStatus: 'PENDING_APPROVAL', deletedAt: null },
    select: {
      id: true,
      name: true,
      abn: true,
      email: true,
      phone: true,
      address: true,
      abnStatus: true,
      abnRegisteredName: true,
      gstRegistered: true,
      bankBsb: true,
      bankAccount: true,
      bankAccountName: true,
      providerStatus: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
}

/**
 * Complete provider profile via token (called from provider-portal).
 * Validates the token is not expired, updates the provider record,
 * sets status to PENDING_APPROVAL, and notifies the PM.
 */
export async function completeProviderProfile(
  token: string,
  data: CompleteProfileInput
): Promise<{ providerId: string }> {
  const provider = await prisma.crmProvider.findFirst({
    where: {
      inviteToken: token,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      abn: true,
      inviteExpiresAt: true,
      providerStatus: true,
    },
  })

  if (!provider) {
    throw new Error('TOKEN_INVALID')
  }

  if (!provider.inviteExpiresAt || provider.inviteExpiresAt < new Date()) {
    throw new Error('TOKEN_EXPIRED')
  }

  await prisma.crmProvider.update({
    where: { id: provider.id },
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      address: data.address ?? null,
      bankBsb: data.bankBsb ?? null,
      bankAccount: data.bankAccount ?? null,
      bankAccountName: data.bankAccountName ?? null,
      providerStatus: 'PENDING_APPROVAL',
      // Keep the invite token until approved (for re-access if needed)
    },
  })

  // Notify PM
  const pmEmail = getPmNotificationEmail()
  await sendSesEmail({
    to: pmEmail,
    subject: `New provider registration pending approval: ${data.name}`,
    htmlBody: buildPmNotificationHtml(data.name, provider.abn, provider.id),
    textBody: `Provider ${data.name} (ABN: ${provider.abn}) has completed their profile and is pending approval. Review at: ${getAppBaseUrl()}/providers/pending`,
  })

  return { providerId: provider.id }
}

// ─── Email builders ───────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildInviteEmailHtml(providerName: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Lotus Assist Provider Invitation</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:30px;">
    <h1 style="color:#059669;margin:0;">Lotus Assist</h1>
    <p style="color:#666;margin:5px 0;">NDIS Plan Management</p>
  </div>
  <h2>You've been invited to the Lotus Assist provider portal</h2>
  <p>Hi ${escapeHtml(providerName)},</p>
  <p>You have been invited to join the <strong>Lotus Assist provider portal</strong>. Completing your profile will allow us to process your invoices faster and ensure payment is sent to the correct account.</p>
  <p>Click the button below to complete your profile — this link is valid for <strong>7 days</strong>.</p>
  <div style="text-align:center;margin:30px 0;">
    <a href="${escapeHtml(portalUrl)}"
       style="background-color:#059669;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;display:inline-block;">
      Complete My Profile
    </a>
  </div>
  <p style="color:#666;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${escapeHtml(portalUrl)}" style="color:#059669;">${escapeHtml(portalUrl)}</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
  <p style="color:#999;font-size:12px;">
    Lotus Assist Pty Ltd | NDIS Plan Management<br>
    This email was sent because a Plan Manager added you as a provider.
    If you believe this was sent in error, please disregard this email.
  </p>
</body>
</html>`
}

function buildInviteEmailText(providerName: string, portalUrl: string): string {
  return `Hi ${providerName},

You've been invited to join the Lotus Assist provider portal.

Completing your profile will allow us to process your invoices faster and ensure payment is sent to the correct account.

Complete your profile here (link valid for 7 days):
${portalUrl}

---
Lotus Assist Pty Ltd | NDIS Plan Management
This email was sent because a Plan Manager added you as a provider.`
}

function buildPmNotificationHtml(
  providerName: string,
  abn: string,
  providerId: string
): string {
  const reviewUrl = `${getAppBaseUrl()}/providers/pending`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Provider Pending Approval</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#059669;">New Provider Pending Approval</h2>
  <p>Provider <strong>${escapeHtml(providerName)}</strong> (ABN: ${escapeHtml(abn)}) has completed their profile and is awaiting your approval.</p>
  <p>Provider ID: <code>${escapeHtml(providerId)}</code></p>
  <div style="text-align:center;margin:30px 0;">
    <a href="${escapeHtml(reviewUrl)}"
       style="background-color:#059669;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
      Review Pending Providers
    </a>
  </div>
</body>
</html>`
}
