/**
 * GET  /api/crm/flags  — list flags for a participant or provider
 * POST /api/crm/flags  — create a new flag
 *
 * Auth: ASSISTANT+ (flags:read / flags:comment)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { createFlag, listFlags } from '@/lib/modules/crm/flags'
import { CreateFlagSchema, ListFlagsSchema } from '@/lib/modules/crm/flags-validation'
import { FlagSeverity } from '@prisma/client'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('flags:read')
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const filters = ListFlagsSchema.parse(params)
    const { flags, total } = await listFlags(filters)
    return NextResponse.json({ flags, total })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('flags:comment')
    const body: unknown = await request.json()
    const input = CreateFlagSchema.parse(body)
    const flag = await createFlag(
      {
        severity: input.severity as FlagSeverity,
        reason: input.reason,
        participantId: input.participantId,
        providerId: input.providerId,
      },
      session.user.id
    )
    return NextResponse.json({ flag }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message.includes('Exactly one of')) {
      return NextResponse.json(
        { error: error.message, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
