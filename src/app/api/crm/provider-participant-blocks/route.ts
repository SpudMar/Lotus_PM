/**
 * GET  /api/crm/provider-participant-blocks?participantId=X&providerId=Y  — list blocks
 * POST /api/crm/provider-participant-blocks                               — create a block
 *
 * Auth: PLAN_MANAGER+ (participants:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { createBlock, listBlocks, resolveBlock } from '@/lib/modules/crm/provider-participant-blocks'

const CreateBlockSchema = z.object({
  participantId: z.string().min(1),
  providerId: z.string().min(1),
  blockAllLines: z.boolean().default(true),
  blockedLineItems: z.array(z.string()).default([]),
  reason: z.string().min(1),
})

const ResolveBlockSchema = z.object({
  blockId: z.string().min(1),
  note: z.string().min(1),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('participants:read')
    const participantId = request.nextUrl.searchParams.get('participantId') ?? undefined
    const providerId = request.nextUrl.searchParams.get('providerId') ?? undefined
    const blocks = await listBlocks(participantId, providerId)
    return NextResponse.json({ data: blocks })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('participants:write')
    const body: unknown = await request.json()
    const input = CreateBlockSchema.parse(body)
    const block = await createBlock(input, session.user.id)
    return NextResponse.json({ data: block }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('participants:write')
    const body: unknown = await request.json()
    const input = ResolveBlockSchema.parse(body)
    const block = await resolveBlock(input.blockId, session.user.id, input.note)
    return NextResponse.json({ data: block })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
