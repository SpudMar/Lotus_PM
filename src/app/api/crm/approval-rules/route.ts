/**
 * GET  /api/crm/approval-rules?participantId=X  — list rules
 * POST /api/crm/approval-rules                  — upsert a rule
 * DELETE /api/crm/approval-rules?id=X           — delete a rule
 *
 * Auth: PLAN_MANAGER+ (participants:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

const UpsertSchema = z.object({
  participantId: z.string().min(1),
  providerId: z.string().nullish(),
  requireApproval: z.boolean(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('participants:read')
    const participantId = request.nextUrl.searchParams.get('participantId')
    if (!participantId) {
      return NextResponse.json({ error: 'participantId required' }, { status: 400 })
    }
    const rules = await prisma.participantApprovalRule.findMany({
      where: { participantId },
      include: {
        provider: { select: { id: true, name: true, abn: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: rules })
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
    const input = UpsertSchema.parse(body)

    const rule = await prisma.participantApprovalRule.upsert({
      where: {
        participantId_providerId: {
          participantId: input.participantId,
          providerId: input.providerId ?? '',
        },
      },
      create: {
        participantId: input.participantId,
        providerId: input.providerId ?? null,
        requireApproval: input.requireApproval,
        createdById: session.user.id,
      },
      update: {
        requireApproval: input.requireApproval,
      },
    })
    return NextResponse.json({ data: rule })
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

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('participants:write')
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }
    await prisma.participantApprovalRule.delete({ where: { id } })
    return NextResponse.json({ success: true })
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
