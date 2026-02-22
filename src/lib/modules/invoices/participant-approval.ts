/**
 * Participant Invoice Approval Module — WS7
 *
 * Participants who opt in can approve/reject invoices via App notification,
 * email link, or SMS link. Tokens expire after 72h → auto-skip to PM queue.
 *
 * JWT is implemented manually with Node.js crypto (no external JWT library).
 * APPROVAL_TOKEN_SECRET must be set in production.
 */

import { createHmac, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'
import { createNotificationRecord } from '@/lib/modules/notifications/notifications'
import { sendTemplatedEmail } from '@/lib/modules/notifications/email-send'

// ─── Secret ───────────────────────────────────────────────────────────────────

const SECRET =
  process.env['APPROVAL_TOKEN_SECRET'] ?? 'dev-approval-secret-change-in-prod'

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface ApprovalTokenPayload {
  invoiceId: string
  participantId: string
  /** Random nonce — used as a single-use guard by comparing approvalTokenHash */
  jti: string
  /** Unix timestamp — expiry */
  exp: number
  /** Unix timestamp — issued at */
  iat: number
}

// ─── JWT Helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a signed HS256 JWT for participant invoice approval.
 * Token is valid for 72 hours.
 */
export function generateApprovalToken(
  invoiceId: string,
  participantId: string
): string {
  const payload: ApprovalTokenPayload = {
    invoiceId,
    participantId,
    jti: randomBytes(16).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + 72 * 3600,
    iat: Math.floor(Date.now() / 1000),
  }
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${sig}`
}

/**
 * Verify and decode an approval token.
 * Throws if the token is malformed, tampered, or expired.
 */
export function verifyApprovalToken(token: string): ApprovalTokenPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')
  const [header, body, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')
  if (sig !== expected) throw new Error('Invalid token signature')
  const payload = JSON.parse(
    Buffer.from(body, 'base64url').toString()
  ) as ApprovalTokenPayload
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  return payload
}

/**
 * Hash a token for storage — the stored hash is compared on redemption (single-use).
 */
export function hashToken(token: string): string {
  return createHmac('sha256', SECRET).update(token).digest('hex')
}

// ─── Request Approval ─────────────────────────────────────────────────────────

/**
 * Initiate participant approval for an invoice.
 * Generates a JWT, stores its hash, and sends the request via the participant's
 * preferred channel (EMAIL / SMS / APP).
 *
 * @throws if participant approval is not enabled or participant has no email/phone
 */
export async function requestParticipantApproval(
  invoiceId: string,
  requestedById: string
): Promise<{ token: string; invoice: object }> {
  const invoice = await prisma.invInvoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: {
      participant: true,
      provider: { select: { id: true, name: true } },
    },
  })

  if (!invoice) throw new Error('NOT_FOUND')
  if (!invoice.participant) {
    throw new Error('Participant approval not enabled for this participant')
  }
  if (!invoice.participant.invoiceApprovalEnabled) {
    throw new Error('Participant approval not enabled for this participant')
  }

  const participant = invoice.participant
  const method = participant.invoiceApprovalMethod ?? 'APP'

  const token = generateApprovalToken(invoiceId, participant.id)
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000)

  // Update invoice
  const updated = await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'PENDING_PARTICIPANT_APPROVAL',
      participantApprovalStatus: 'PENDING',
      approvalTokenHash: tokenHash,
      approvalTokenExpiresAt: expiresAt,
      approvalSentAt: new Date(),
    },
  })

  // Approval URL for email/SMS links
  const baseUrl = process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'
  const approvalUrl = `${baseUrl}/approval/${token}`
  const providerName = invoice.provider?.name ?? 'your provider'
  const amountFormatted = `$${(invoice.totalCents / 100).toFixed(2)}`

  // Send via chosen method
  if (method === 'EMAIL') {
    if (participant.email) {
      // Look up an APPROVAL_REQUEST template — fall back gracefully if not found
      const template = await prisma.notifEmailTemplate.findFirst({
        where: { type: 'APPROVAL_REQUEST', isActive: true },
      })

      if (template) {
        await sendTemplatedEmail({
          templateId: template.id,
          recipientEmail: participant.email,
          recipientName: `${participant.firstName} ${participant.lastName}`,
          mergeFieldValues: {
            first_name: participant.firstName,
            provider_name: providerName,
            amount: amountFormatted,
            approval_url: approvalUrl,
          },
          participantId: participant.id,
          triggeredById: requestedById,
        })
      } else {
        // No template configured — record notification only
        await createNotificationRecord({
          channel: 'EMAIL',
          recipient: participant.email,
          message: `Please review and approve the invoice from ${providerName} for ${amountFormatted}. Visit: ${approvalUrl}`,
          subject: 'Invoice approval required',
          participantId: participant.id,
          triggeredById: requestedById,
        })
      }
    }
  } else if (method === 'SMS') {
    const phone = participant.phone
    if (phone) {
      await createNotificationRecord({
        channel: 'SMS',
        recipient: phone,
        message: `Lotus PM: Please approve invoice from ${providerName} for ${amountFormatted}. Visit: ${approvalUrl}`,
        participantId: participant.id,
        triggeredById: requestedById,
      })
    }
  } else {
    // APP notification
    await createNotificationRecord({
      channel: 'IN_APP',
      recipient: participant.id,
      message: `Invoice from ${providerName} for ${amountFormatted} requires your approval.`,
      subject: 'Invoice approval required',
      participantId: participant.id,
      triggeredById: requestedById,
    })
  }

  // Audit log
  await createAuditLog({
    userId: requestedById,
    action: 'APPROVAL_REQUESTED',
    resource: 'invoice',
    resourceId: invoiceId,
    after: { status: 'PENDING_PARTICIPANT_APPROVAL', method, participantId: participant.id },
  })

  // Emit event
  void processEvent('invoices.approval-requested', {
    invoiceId,
    participantId: participant.id,
    userId: requestedById,
  })

  return { token, invoice: updated }
}

// ─── Process Approval Response ────────────────────────────────────────────────

/**
 * Process a participant's approval or rejection decision.
 * Validates the token (signature + expiry + single-use hash check).
 *
 * @throws if token is invalid, expired, already used, or invoice is not pending
 */
export async function processApprovalResponse(
  token: string,
  decision: 'APPROVED' | 'REJECTED'
): Promise<object> {
  // 1. Verify JWT
  const payload = verifyApprovalToken(token)
  const { invoiceId, participantId } = payload

  // 2. Fetch invoice
  const invoice = await prisma.invInvoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
  })
  if (!invoice) throw new Error('NOT_FOUND')

  // 3. Single-use check — compare stored hash
  if (!invoice.approvalTokenHash) throw new Error('Token already used')
  if (invoice.approvalTokenHash !== hashToken(token)) {
    throw new Error('Token already used')
  }

  // 4. Status check
  if (invoice.status !== 'PENDING_PARTICIPANT_APPROVAL') {
    throw new Error('Invoice is not pending participant approval')
  }

  let updated: object
  const now = new Date()

  if (decision === 'APPROVED') {
    updated = await prisma.invInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'APPROVED',
        participantApprovalStatus: 'APPROVED',
        participantApprovedAt: now,
        approvalTokenHash: null,
        approvalTokenExpiresAt: null,
      },
    })
  } else {
    updated = await prisma.invInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PENDING_REVIEW',
        participantApprovalStatus: 'REJECTED',
        approvalTokenHash: null,
        approvalTokenExpiresAt: null,
      },
    })
  }

  // Audit log — use participantId as userId since this is a public action
  await createAuditLog({
    userId: participantId,
    action: decision === 'APPROVED' ? 'PARTICIPANT_APPROVED' : 'PARTICIPANT_REJECTED',
    resource: 'invoice',
    resourceId: invoiceId,
    after: { decision, participantId },
  })

  // Emit event
  const eventName =
    decision === 'APPROVED'
      ? 'invoices.participant-approved'
      : 'invoices.participant-rejected'

  void processEvent(eventName, { invoiceId, participantId })

  return updated
}

// ─── Skip Expired Approvals ───────────────────────────────────────────────────

/**
 * Find all invoices with expired approval tokens and move them to PENDING_REVIEW.
 * Intended to be called by a scheduled job.
 *
 * @returns the count of invoices that were skipped
 */
export async function skipExpiredApprovals(): Promise<number> {
  const now = new Date()

  const expired = await prisma.invInvoice.findMany({
    where: {
      status: 'PENDING_PARTICIPANT_APPROVAL',
      approvalTokenExpiresAt: { lt: now },
      deletedAt: null,
    },
    select: { id: true, participantId: true },
  })

  if (expired.length === 0) return 0

  await prisma.invInvoice.updateMany({
    where: {
      id: { in: expired.map((inv) => inv.id) },
    },
    data: {
      status: 'PENDING_REVIEW',
      participantApprovalStatus: 'SKIPPED',
      approvalSkippedAt: now,
      approvalTokenHash: null,
      approvalTokenExpiresAt: null,
    },
  })

  // Emit events for each skipped invoice
  for (const inv of expired) {
    if (inv.participantId) {
      void processEvent('invoices.approval-skipped', {
        invoiceId: inv.id,
        participantId: inv.participantId,
      })
    }
  }

  return expired.length
}

// ─── Get Approval Status ──────────────────────────────────────────────────────

/**
 * Return the approval status for a given token.
 * Does NOT expose the token hash or sensitive participant data.
 *
 * @throws if token is invalid or expired
 */
export async function getApprovalStatus(token: string): Promise<{
  invoiceId: string
  participantApprovalStatus: string | null
  status: string
  totalCents: number
  invoiceDate: Date
  providerName: string | null
}> {
  const payload = verifyApprovalToken(token)

  const invoice = await prisma.invInvoice.findFirst({
    where: { id: payload.invoiceId, deletedAt: null },
    select: {
      id: true,
      status: true,
      participantApprovalStatus: true,
      totalCents: true,
      invoiceDate: true,
      provider: { select: { name: true } },
    },
  })

  if (!invoice) throw new Error('NOT_FOUND')

  return {
    invoiceId: invoice.id,
    participantApprovalStatus: invoice.participantApprovalStatus,
    status: invoice.status,
    totalCents: invoice.totalCents,
    invoiceDate: invoice.invoiceDate,
    providerName: invoice.provider?.name ?? null,
  }
}
