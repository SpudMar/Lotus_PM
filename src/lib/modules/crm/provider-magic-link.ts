/**
 * Provider Portal Magic Link Authentication
 *
 * Passwordless auth for provider portal:
 * 1. Provider enters email at /provider-portal/login
 * 2. POST /api/provider-portal/auth/request-link — generates a short-lived token, emails a link
 * 3. Provider clicks the link: GET /api/provider-portal/auth/verify?token=...
 * 4. Token verified → NextAuth CredentialsProvider signs them in via a one-time code
 *    OR we use a redirect with a signed JWT cookie approach.
 *
 * Implementation: We store a one-time token (32 random bytes) in a DB table,
 * then exchange it for a NextAuth session via the CredentialsProvider.
 *
 * The token is stored in CoreProviderMagicLink (a new table), valid for 15 minutes.
 * After use it is immediately deleted.
 */

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { sendSesEmail } from '@/lib/modules/notifications/ses-client'

const TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

function getAppBaseUrl(): string {
  return (
    process.env['NEXT_PUBLIC_APP_URL'] ??
    process.env['NEXTAUTH_URL'] ??
    'https://app.lotusassist.com.au'
  )
}

/**
 * Request a magic login link for a provider email.
 * Silently succeeds even if the email is not registered (prevents email enumeration).
 */
export async function requestProviderMagicLink(email: string): Promise<void> {
  // Check if this email belongs to an active provider portal user
  const user = await prisma.coreUser.findFirst({
    where: { email, role: 'PROVIDER', isActive: true, deletedAt: null },
    select: { id: true, name: true },
  })

  if (!user) {
    // Silent success — don't reveal whether email is registered
    return
  }

  // Invalidate any existing tokens for this user
  await prisma.coreProviderMagicLink.deleteMany({
    where: { userId: user.id },
  })

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.coreProviderMagicLink.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  })

  const loginUrl = `${getAppBaseUrl()}/provider-portal/auth/verify?token=${token}`

  await sendSesEmail({
    to: email,
    subject: 'Your Lotus Assist provider portal login link',
    htmlBody: buildMagicLinkEmailHtml(user.name, loginUrl),
    textBody: buildMagicLinkEmailText(user.name, loginUrl),
  })
}

/**
 * Verify a magic link token. Returns the user if valid, throws otherwise.
 * The token is consumed (deleted) on successful verification.
 */
export async function verifyProviderMagicLink(
  token: string
): Promise<{ userId: string; email: string; name: string; role: string }> {
  const record = await prisma.coreProviderMagicLink.findFirst({
    where: { token },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, isActive: true, deletedAt: true },
      },
    },
  })

  if (!record) {
    throw new Error('TOKEN_INVALID')
  }

  if (record.expiresAt < new Date()) {
    await prisma.coreProviderMagicLink.delete({ where: { id: record.id } })
    throw new Error('TOKEN_EXPIRED')
  }

  if (!record.user.isActive || record.user.deletedAt) {
    await prisma.coreProviderMagicLink.delete({ where: { id: record.id } })
    throw new Error('ACCOUNT_INACTIVE')
  }

  // Consume the token immediately
  await prisma.coreProviderMagicLink.delete({ where: { id: record.id } })

  // Update lastLoginAt
  await prisma.coreUser.update({
    where: { id: record.user.id },
    data: { lastLoginAt: new Date() },
  })

  return {
    userId: record.user.id,
    email: record.user.email,
    name: record.user.name,
    role: record.user.role,
  }
}

// ─── Email builders ───────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMagicLinkEmailHtml(name: string, loginUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Provider Portal Login Link</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:30px;">
    <h1 style="color:#059669;margin:0;">Lotus Assist</h1>
    <p style="color:#666;margin:5px 0;">Provider Portal</p>
  </div>
  <h2>Your secure login link</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Click the button below to log in to your provider portal. This link expires in <strong>15 minutes</strong> and can only be used once.</p>
  <div style="text-align:center;margin:30px 0;">
    <a href="${escapeHtml(loginUrl)}"
       style="background-color:#059669;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;display:inline-block;">
      Log In to Provider Portal
    </a>
  </div>
  <p style="color:#666;font-size:13px;">If the button does not work, copy and paste this link:<br>
    <a href="${escapeHtml(loginUrl)}" style="color:#059669;">${escapeHtml(loginUrl)}</a>
  </p>
  <p style="color:#999;font-size:12px;">If you did not request this link, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
  <p style="color:#999;font-size:12px;">Lotus Assist Pty Ltd | NDIS Plan Management</p>
</body>
</html>`
}

function buildMagicLinkEmailText(name: string, loginUrl: string): string {
  return `Hi ${name},

Click the link below to log in to your Lotus Assist provider portal (expires in 15 minutes, single use):
${loginUrl}

If you did not request this link, you can safely ignore this email.

---
Lotus Assist Pty Ltd | NDIS Plan Management`
}
