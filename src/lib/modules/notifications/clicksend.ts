/**
 * ClickSend SMS client — thin wrapper around the ClickSend REST API v3.
 * Uses Basic Auth (username + API key). No third-party SDK — plain fetch.
 *
 * Docs: https://developers.clicksend.com/docs/rest/v3/?shell#send-sms
 * REQ-011: Data processed here is outbound only — ClickSend is an AU-based provider.
 */

import type { SmsPayload, SendSmsResult } from './types'

const CLICKSEND_BASE_URL = 'https://rest.clicksend.com/v3'

// ─── Phone number normalisation ───────────────────────────────────────────────

/**
 * Normalise an Australian phone number to E.164 format (+61XXXXXXXXX).
 * Handles: 04XXXXXXXX, +614XXXXXXXX, 614XXXXXXXX
 * Non-AU numbers already in E.164 (+XXXXXXXXXXX) are passed through unchanged.
 */
export function normalisePhoneAu(raw: string): string {
  // Strip all whitespace, dashes, parentheses, dots
  const stripped = raw.replace(/[\s\-().]/g, '')

  // Already in E.164
  if (/^\+\d{7,15}$/.test(stripped)) {
    return stripped
  }

  // Australian mobile: 04XXXXXXXX → +614XXXXXXXX
  if (/^04\d{8}$/.test(stripped)) {
    return `+61${stripped.slice(1)}`
  }

  // Australian with country code (no +): 614XXXXXXXX → +614XXXXXXXX
  if (/^614\d{8}$/.test(stripped)) {
    return `+${stripped}`
  }

  // Australian landline or short: 0X XXXX XXXX → +61X XXXX XXXX
  if (/^0[2-9]\d{8}$/.test(stripped)) {
    return `+61${stripped.slice(1)}`
  }

  // Return as-is if we can't normalise — ClickSend will reject invalid numbers
  return stripped
}

// ─── ClickSend request/response shapes ───────────────────────────────────────

interface ClickSendMessage {
  source: string
  to: string
  body: string
  from?: string
}

interface ClickSendRequestBody {
  messages: ClickSendMessage[]
}

interface ClickSendMessageResult {
  status: string
  message_id: string
  to: string
  body: string
  error_text?: string
}

interface ClickSendResponse {
  http_code: number
  response_code: string
  response_msg: string
  data?: {
    messages?: ClickSendMessageResult[]
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

function getCredentials(): { username: string; apiKey: string } {
  const username = process.env['CLICKSEND_USERNAME']
  const apiKey = process.env['CLICKSEND_API_KEY']

  if (!username || !apiKey) {
    throw new Error('CLICKSEND_USERNAME and CLICKSEND_API_KEY must be set')
  }

  return { username, apiKey }
}

function buildBasicAuth(username: string, apiKey: string): string {
  const token = Buffer.from(`${username}:${apiKey}`).toString('base64')
  return `Basic ${token}`
}

/**
 * Send a single SMS via ClickSend REST API v3.
 * Returns structured result — never throws on API errors.
 */
export async function sendSmsViaClickSend(payload: SmsPayload): Promise<SendSmsResult> {
  const { username, apiKey } = getCredentials()
  const normalisedTo = normalisePhoneAu(payload.to)

  const requestBody: ClickSendRequestBody = {
    messages: [
      {
        source: 'lotus-pm',
        to: normalisedTo,
        body: payload.message,
        ...(payload.from !== undefined ? { from: payload.from } : {}),
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(`${CLICKSEND_BASE_URL}/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: buildBasicAuth(username, apiKey),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { success: false, errorMessage: `ClickSend request failed: ${msg}` }
  }

  let body: ClickSendResponse
  try {
    body = (await response.json()) as ClickSendResponse
  } catch {
    return {
      success: false,
      errorMessage: `ClickSend returned non-JSON response (HTTP ${response.status})`,
    }
  }

  const messageResult = body.data?.messages?.[0]

  if (!response.ok || body.response_code !== 'SUCCESS') {
    const errText = messageResult?.error_text ?? body.response_msg ?? 'Unknown error'
    return {
      success: false,
      errorMessage: errText,
      clickSendStatus: messageResult?.status,
    }
  }

  if (!messageResult) {
    return { success: false, errorMessage: 'ClickSend returned no message result' }
  }

  // ClickSend statuses: SUCCESS, INVALID_RECIPIENT, RATE_LIMIT_REACHED, etc.
  const sent = messageResult.status === 'SUCCESS'

  return {
    success: sent,
    messageId: sent ? messageResult.message_id : undefined,
    clickSendStatus: messageResult.status,
    errorMessage: sent ? undefined : (messageResult.error_text ?? messageResult.status),
  }
}
