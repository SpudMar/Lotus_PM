/**
 * POST /api/provider-portal/register
 *
 * Public provider self-registration endpoint.
 * Creates a provider in PENDING_APPROVAL status and notifies the PM.
 *
 * Public — no authentication required.
 * Rate limiting should be enforced at the CDN/ALB layer for this endpoint.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { lookupAbn } from '@/lib/modules/crm/abn-lookup'
import { sendSesEmail } from '@/lib/modules/notifications/ses-client'
import { isValidABN } from '@/lib/shared/ndis'
import { z } from 'zod'

const bodySchema = z.object({
  abn: z
    .string()
    .min(1, 'ABN is required')
    .refine((v) => isValidABN(v), 'Invalid ABN — please check and try again'),
  name: z.string().min(1, 'Business name is required').max(200),
  contactName: z.string().min(1, 'Contact name is required').max(100),
  email: z.string().email('Valid email is required'),
  phone: z.string().max(20).optional(),
})

function getPmNotificationEmail(): string {
  return process.env['PM_NOTIFICATION_EMAIL'] ?? 'pm@lotusassist.com.au'
}

function getAppBaseUrl(): string {
  return (
    process.env['NEXT_PUBLIC_APP_URL'] ??
    process.env['NEXTAUTH_URL'] ??
    'https://app.lotusassist.com.au'
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as unknown
    const input = bodySchema.parse(body)

    // Check for duplicate ABN
    const existing = await prisma.crmProvider.findFirst({
      where: { abn: input.abn.replace(/\s/g, ''), deletedAt: null },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A provider with this ABN is already registered', code: 'DUPLICATE_ABN' },
        { status: 409 }
      )
    }

    // Attempt ABR enrichment (best-effort)
    let abnStatus: string | null = null
    let abnRegisteredName: string | null = null
    let gstRegistered: boolean | null = null

    const abrResult = await lookupAbn(input.abn)
    if (abrResult) {
      abnStatus = abrResult.abnStatus
      abnRegisteredName = abrResult.entityName
      gstRegistered = abrResult.gstRegistered
    }

    const provider = await prisma.crmProvider.create({
      data: {
        name: input.name,
        abn: input.abn.replace(/\s/g, ''),
        email: input.email,
        phone: input.phone ?? null,
        providerStatus: 'PENDING_APPROVAL',
        abnStatus,
        abnRegisteredName,
        gstRegistered,
      },
      select: { id: true, name: true, abn: true },
    })

    // Notify PM
    const pmEmail = getPmNotificationEmail()
    const reviewUrl = `${getAppBaseUrl()}/providers/pending`

    await sendSesEmail({
      to: pmEmail,
      subject: `New provider self-registered: ${input.name} (ABN: ${provider.abn})`,
      htmlBody: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Provider Self-Registration</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#059669;">New Provider Self-Registration</h2>
  <p>A provider has self-registered and is awaiting approval.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px;font-weight:bold;width:40%;">Business Name</td><td style="padding:8px;">${input.name}</td></tr>
    <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">ABN</td><td style="padding:8px;">${provider.abn}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">Contact Name</td><td style="padding:8px;">${input.contactName}</td></tr>
    <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${input.email}</td></tr>
    ${input.phone ? `<tr><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;">${input.phone}</td></tr>` : ''}
  </table>
  <a href="${reviewUrl}" style="background-color:#059669;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
    Review Pending Providers
  </a>
</body>
</html>`,
      textBody: `New provider self-registration\n\nBusiness: ${input.name}\nABN: ${provider.abn}\nContact: ${input.contactName}\nEmail: ${input.email}\n${input.phone ? `Phone: ${input.phone}\n` : ''}\nReview at: ${reviewUrl}`,
    })

    return NextResponse.json(
      {
        data: {
          message: 'Registration received. We will review your application and be in touch shortly.',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
