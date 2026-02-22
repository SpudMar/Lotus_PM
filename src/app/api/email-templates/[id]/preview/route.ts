/**
 * POST /api/email-templates/[id]/preview — render template with sample data (notifications:read)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { previewTemplate } from '@/lib/modules/notifications/email-templates'

const previewBodySchema = z.object({
  sampleData: z.record(z.string(), z.string()),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission('notifications:read')
    const { id } = await params
    const body = await request.json() as unknown
    const { sampleData } = previewBodySchema.parse(body)

    const preview = await previewTemplate(id, sampleData)

    return NextResponse.json({ data: preview })
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
