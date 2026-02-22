import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listServiceAgreements, createServiceAgreement } from '@/lib/modules/service-agreements/service-agreements'
import { listServiceAgreementsSchema, createServiceAgreementSchema } from '@/lib/modules/service-agreements/validation'
import { ZodError } from 'zod'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('service-agreements:read')
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const filters = listServiceAgreementsSchema.parse({
      participantId: searchParams.participantId,
      providerId: searchParams.providerId,
      status: searchParams.status,
    })
    const agreements = await listServiceAgreements(filters)
    return NextResponse.json({ data: agreements })
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
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const body = await request.json()
    const input = createServiceAgreementSchema.parse(body)
    const agreement = await createServiceAgreement(input, session.user.id)
    return NextResponse.json({ data: agreement }, { status: 201 })
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
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
