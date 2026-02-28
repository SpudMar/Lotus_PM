/**
 * POST /api/claims/manual-enquiry — create a manual enquiry claim
 *
 * Auth: PLAN_MANAGER+ (claims:write)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { createManualEnquiryClaim } from '@/lib/modules/claims/claims'

const ManualEnquirySchema = z.object({
  invoiceId: z.string().min(1),
  note: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('claims:write')
    const body: unknown = await request.json()
    const input = ManualEnquirySchema.parse(body)
    const claim = await createManualEnquiryClaim(input.invoiceId, session.user.id, input.note)
    return NextResponse.json({ data: claim }, { status: 201 })
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
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
