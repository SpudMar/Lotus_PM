import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import {
  listStatements,
  generateStatement,
} from '@/lib/modules/statements/statement-generation'
import { createAuditLog } from '@/lib/modules/core/audit'
import { z, ZodError } from 'zod'

const listSchema = z.object({
  participantId: z.string().optional(),
  deliveryMethod: z.enum(['EMAIL', 'SMS', 'MAIL']).optional(),
  sent: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

const createSchema = z.object({
  participantId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('statements:read')
    const { searchParams } = new URL(request.url)
    const params = listSchema.parse({
      participantId: searchParams.get('participantId') ?? undefined,
      deliveryMethod: searchParams.get('deliveryMethod') ?? undefined,
      sent: searchParams.get('sent') ?? undefined,
      page: searchParams.get('page') ?? 1,
      pageSize: searchParams.get('pageSize') ?? 20,
    })

    const result = await listStatements(params)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    if (error instanceof ZodError) {
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('statements:write')
    const body = (await request.json()) as unknown
    const input = createSchema.parse(body)

    const statement = await generateStatement(
      input.participantId,
      new Date(input.periodStart),
      new Date(input.periodEnd),
      session.user.id
    )

    await createAuditLog({
      userId: session.user.id,
      action: 'statements.statement.generated',
      resource: 'participant_statement',
      resourceId: statement.id,
      after: {
        participantId: statement.participantId,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        totalInvoicedCents: statement.totalInvoicedCents,
      },
    })

    return NextResponse.json({ data: statement }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'Participant not found') {
      return NextResponse.json(
        { error: 'Participant not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
