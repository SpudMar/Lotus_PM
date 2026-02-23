/**
 * GET  /api/service-agreements/[id]/budget-allocations
 * POST /api/service-agreements/[id]/budget-allocations
 *
 * PLAN_MANAGER+ only (service-agreements:write for mutations).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { ZodError } from 'zod'
import {
  getAllocations,
  allocateBudget,
  getAvailableCents,
} from '@/lib/modules/service-agreements/budget-allocations'
import { getServiceAgreement } from '@/lib/modules/service-agreements/service-agreements'
import { allocateBudgetSchema } from '@/lib/modules/service-agreements/budget-allocations-validation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requirePermission('service-agreements:read')
    const { id } = await params

    await getServiceAgreement(id)

    const allocations = await getAllocations(id)

    // Enrich each allocation with uncommitted remaining cents for its budget line.
    // getAvailableCents(budgetLineId, id) returns what's still free excluding THIS SA's own allocation,
    // so remaining for this SA = its own allocated + that free amount.
    const enriched = await Promise.all(
      allocations.map(async (a) => {
        const freeElsewhere = await getAvailableCents(a.budgetLineId, id)
        return {
          ...a,
          remainingCents: a.allocatedCents + freeElsewhere,
        }
      })
    )

    return NextResponse.json({ data: enriched })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Service agreement not found') {
      return NextResponse.json({ error: 'Service agreement not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requirePermission('service-agreements:write')
    const { id } = await params

    await getServiceAgreement(id)

    const body = await request.json()
    const input = allocateBudgetSchema.parse({ ...body, serviceAgreementId: id })

    const allocation = await allocateBudget(input, session.user.id)

    return NextResponse.json({ data: allocation }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Service agreement not found') {
      return NextResponse.json({ error: 'Service agreement not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Budget line not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'ALLOCATION_EXCEEDS_AVAILABLE') {
      return NextResponse.json(
        { error: 'Allocation exceeds available budget', code: 'ALLOCATION_EXCEEDS_AVAILABLE' },
        { status: 400 }
      )
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
