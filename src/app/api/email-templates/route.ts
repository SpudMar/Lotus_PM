/**
 * GET  /api/email-templates  — list templates (notifications:read)
 * POST /api/email-templates  — create template (notifications:send)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import {
  listEmailTemplates,
  createEmailTemplate,
} from '@/lib/modules/notifications/email-templates'
import type { EmailTemplateType } from '@prisma/client'

const listQuerySchema = z.object({
  type: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
})

const createBodySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    'WELCOME_PACK',
    'SERVICE_AGREEMENT',
    'INVOICE_NOTIFICATION',
    'CLAIM_STATUS',
    'BUDGET_REPORT',
    'APPROVAL_REQUEST',
    'CUSTOM',
  ]),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  mergeFields: z.array(z.string()).optional(),
  fixedAttachmentIds: z.array(z.string()).optional(),
  supportsVariableAttachment: z.boolean().optional(),
  variableAttachmentDescription: z.string().optional(),
  includesFormLink: z.boolean().optional(),
  formLinkUrl: z.string().url().optional().or(z.literal('')).or(z.undefined()),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('notifications:read')
    const { searchParams } = new URL(request.url)
    const query = listQuerySchema.parse(Object.fromEntries(searchParams))

    const templates = await listEmailTemplates({
      type: query.type as EmailTemplateType | undefined,
      isActive: query.isActive !== undefined ? query.isActive === 'true' : undefined,
    })

    return NextResponse.json({ data: templates })
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
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('notifications:send')
    const body = await request.json() as unknown
    const input = createBodySchema.parse(body)

    const template = await createEmailTemplate(input, session.user.id)

    return NextResponse.json({ data: template }, { status: 201 })
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
