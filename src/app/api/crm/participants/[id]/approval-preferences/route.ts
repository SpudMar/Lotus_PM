import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

const updatePreferencesSchema = z.object({
  invoiceApprovalEnabled: z.boolean(),
  invoiceApprovalMethod: z.enum(['APP', 'EMAIL', 'SMS']).nullable().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('participants:read')
    const { id } = await params

    const participant = await prisma.crmParticipant.findFirst({
      where: { id, deletedAt: null },
      select: { invoiceApprovalEnabled: true, invoiceApprovalMethod: true },
    })

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ data: participant })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('participants:write')
    const { id } = await params

    const participant = await prisma.crmParticipant.findFirst({
      where: { id, deletedAt: null },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const input = updatePreferencesSchema.parse(body)

    const before = {
      invoiceApprovalEnabled: participant.invoiceApprovalEnabled,
      invoiceApprovalMethod: participant.invoiceApprovalMethod,
    }

    const updated = await prisma.crmParticipant.update({
      where: { id },
      data: {
        invoiceApprovalEnabled: input.invoiceApprovalEnabled,
        invoiceApprovalMethod: input.invoiceApprovalMethod ?? null,
      },
      select: { invoiceApprovalEnabled: true, invoiceApprovalMethod: true },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE_APPROVAL_PREFERENCES',
      resource: 'participant',
      resourceId: id,
      before,
      after: updated,
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
