/**
 * Notifications Module — shared TypeScript types.
 * Supports SMS (ClickSend), Email (AWS SES), and In-App channels.
 */

// ─── Channel & Status ────────────────────────────────────────────────────────

export type NotifChannel = 'SMS' | 'EMAIL' | 'IN_APP'

export type NotifStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DELIVERED' | 'UNDELIVERED'

// ─── SMS ─────────────────────────────────────────────────────────────────────

export interface SmsPayload {
  /** Destination phone number — will be normalised to E.164 (+61XXXXXXXXX) */
  to: string
  /** Message body — ClickSend allows up to 10 parts (1,600 chars) */
  message: string
  /** Optional sender ID (overrides ClickSend account default) */
  from?: string
}

export interface SendSmsResult {
  success: boolean
  /** ClickSend message_id on success */
  messageId?: string
  errorMessage?: string
  /** Raw status string returned by ClickSend */
  clickSendStatus?: string
}

// ─── Generic notification record ─────────────────────────────────────────────

export interface CreateNotificationInput {
  channel: NotifChannel
  recipient: string
  message: string
  subject?: string
  participantId?: string
  triggeredById?: string
}
