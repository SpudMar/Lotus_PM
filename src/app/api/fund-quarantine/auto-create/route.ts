import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { autoCreateFromServiceAgreement } from '@/lib/modules/fund-quarantine/fund-quarantine'
import { z, ZodError } from 'zod'

const autoCreateSchema = z.object({
  serviceAgreementId: z.string().cuid('Invalid service agreement ID'),
  planId: z.string().cuid('Invalid plan ID'),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('plans:write')
    const body = await request.json()
    const { serviceAgreementId, planId } = autoCreateSchema.parse(body)
    const quarantines = await autoCreateFromServiceAgreement(serviceAgreementId, planId, session.user.id)
    return NextResponse.json({ data: quarantines, count: quarantines.length }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: error }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'SERVICE_AGREEMENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Service agreement not found', code: 'SERVICE_AGREEMENT_NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
