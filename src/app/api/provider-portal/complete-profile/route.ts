/**
 * GET  /api/provider-portal/complete-profile?token=xxx
 *      Validate token and return pre-filled provider data for the form.
 *
 * POST /api/provider-portal/complete-profile
 *      Complete provider profile via invite token.
 *      Body: { token, name, email, phone?, address?, bankBsb?, bankAccount?, bankAccountName? }
 *
 * Public — no authentication required (authenticated by token).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { completeProviderProfile } from '@/lib/modules/crm/provider-onboarding'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const getQuerySchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

const postBodySchema = z.object({
  token: z.string().min(1, 'Token is required'),
  name: z.string().min(1, 'Business name is required').max(200),
  email: z.string().email('Valid email required'),
  phone: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  bankBsb: z.string().regex(/^\d{3}-?\d{3}$/, 'BSB must be 6 digits').optional().or(z.literal('')),
  bankAccount: z.string().max(20).optional(),
  bankAccountName: z.string().max(100).optional(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const { token } = getQuerySchema.parse(params)

    const provider = await prisma.crmProvider.findFirst({
      where: { inviteToken: token, deletedAt: null },
      select: {
        id: true,
        name: true,
        abn: true,
        email: true,
        phone: true,
        address: true,
        bankBsb: true,
        bankAccount: true,
        bankAccountName: true,
        inviteExpiresAt: true,
        providerStatus: true,
      },
    })

    if (!provider) {
      return NextResponse.json(
        { error: 'Invalid or expired token', code: 'TOKEN_INVALID' },
        { status: 400 }
      )
    }

    if (!provider.inviteExpiresAt || provider.inviteExpiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This invite link has expired', code: 'TOKEN_EXPIRED' },
        { status: 400 }
      )
    }

    return NextResponse.json({ data: provider })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Token is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as unknown
    const input = postBodySchema.parse(body)

    const result = await completeProviderProfile(input.token, {
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      bankBsb: input.bankBsb || undefined,
      bankAccount: input.bankAccount,
      bankAccountName: input.bankAccountName,
    })

    return NextResponse.json({
      data: {
        providerId: result.providerId,
        message: 'Profile submitted successfully. We will review and be in touch shortly.',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_INVALID') {
      return NextResponse.json(
        { error: 'Invalid or expired invitation link', code: 'TOKEN_INVALID' },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'TOKEN_EXPIRED') {
      return NextResponse.json(
        { error: 'This invitation link has expired. Please contact Lotus Assist for a new invite.', code: 'TOKEN_EXPIRED' },
        { status: 400 }
      )
    }
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
