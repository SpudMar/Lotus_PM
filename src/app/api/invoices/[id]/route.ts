import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { getInvoice, approveInvoice, rejectInvoice, updateInvoice, ValidationFailedError } from '@/lib/modules/invoices/invoices'
import { recordProviderEmailMatch } from '@/lib/modules/invoices/auto-match'
import { recordPattern } from '@/lib/modules/invoices/item-matcher'
import { approveInvoiceSchema, rejectInvoiceSchema, updateInvoiceSchema } from '@/lib/modules/invoices/validation'
import { z } from 'zod'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')
    const { id } = await params
    const invoice = await getInvoice(id)

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({ data: invoice })
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('invoices:write')
    const { id } = await params
    const body = await request.json()
    const input = updateInvoiceSchema.parse(body)
    const invoice = await updateInvoice(id, input, session.user.id)

    // Learning loop: if a provider was set and the invoice has a sender email,
    // teach the system about this email->provider association (fire-and-forget).
    if (input.providerId && invoice.sourceEmail) {
      void recordProviderEmailMatch(input.providerId, invoice.sourceEmail).catch(() => {
        // Non-blocking: learning loop failure must not affect the save response
      })
    }

    // Pattern learning: record support item codes confirmed by this PM save.
    // Only record when all required IDs are present on the invoice.
    // Fire-and-forget — pattern recording must never block the save response.
    if (
      input.lines &&
      input.lines.length > 0 &&
      invoice.providerId &&
      invoice.participantId
    ) {
      const providerId = invoice.providerId
      const participantId = invoice.participantId

      void Promise.all(
        input.lines
          .filter((line) => line.supportItemCode && line.categoryCode)
          .map((line) =>
            recordPattern(
              providerId,
              participantId,
              line.categoryCode,
              line.supportItemCode
            )
          )
      ).catch(() => {
        // Non-blocking: pattern learning failure must not affect the save response
      })
    }

    return NextResponse.json({ data: invoice })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'INVALID_STATUS') {
      return NextResponse.json(
        { error: 'Invoice cannot be edited in its current status', code: 'INVALID_STATUS' },
        { status: 422 }
      )
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const body = await request.json()
    const action = body.action as string

    if (action === 'approve') {
      const session = await requirePermission('invoices:approve')
      const input = approveInvoiceSchema.parse(body)
      const invoice = await approveInvoice(id, session.user.id, input.planId, input.force)
      return NextResponse.json({ data: invoice })
    }

    if (action === 'reject') {
      const session = await requirePermission('invoices:reject')
      const input = rejectInvoiceSchema.parse(body)
      const invoice = await rejectInvoice(id, session.user.id, input.reason)
      return NextResponse.json({ data: invoice })
    }

    return NextResponse.json({ error: 'Invalid action', code: 'BAD_REQUEST' }, { status: 400 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ValidationFailedError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_FAILED', validation: error.validation },
        { status: 422 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
