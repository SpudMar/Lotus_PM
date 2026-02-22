/**
 * GET    /api/email-templates/[id]  — get single template (notifications:read)
 * PUT    /api/email-templates/[id]  — update template (notifications:send)
 * DELETE /api/email-templates/[id]  — deactivate template (notifications:send)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import {
  getEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from '@/lib/modules/notifications/email-templates'

const updateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum([
    'WELCOME_PACK',
    'SERVICE_AGREEMENT',
    'INVOICE_NOTIFICATION',
    'CLAIM_STATUS',
    'BUDGET_REPORT',
    'APPROVAL_REQUEST',
    'CUSTOM',
  ]).optional(),
  subject: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().nullable().optional(),
  mergeFields: z.array(z.string()).optional(),
  fixedAttachmentIds: z.array(z.string()).optional(),
  supportsVariableAttachment: z.boolean().optional(),
  variableAttachmentDescription: z.string().nullable().optional(),
  includesFormLink: z.boolean().optional(),
  formLinkUrl: z.string().url().nullable().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission('notifications:read')
    const { id } = await params
    const template = await getEmailTemplate(id)

    if (!template) {
      return NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ data: template })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:send')
    const { id } = await params
    const body = await request.json() as unknown
    const input = updateBodySchema.parse(body)

    const template = await updateEmailTemplate(id, input, session.user.id)

    return NextResponse.json({ data: template })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:send')
    const { id } = await params

    await deleteEmailTemplate(id, session.user.id)

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
