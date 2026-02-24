/**
 * POST /api/crm/providers/create-from-invoice
 *
 * Creates a CrmProvider record with status DRAFT from an invoice context.
 * Optionally enriches the provider data via ABR lookup if ABR_GUID is configured.
 *
 * Body: { abn?, name?, email?, invoiceId? }
 * Returns: { providerId, abnLookup: { entityName, abnStatus, gstRegistered } | null }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { createProviderFromInvoice } from '@/lib/modules/crm/provider-onboarding'
import { lookupAbn } from '@/lib/modules/crm/abn-lookup'
import { z } from 'zod'

const bodySchema = z.object({
  abn: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  invoiceId: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('providers:write')

    const body = await request.json() as unknown
    const input = bodySchema.parse(body)

    // Attempt ABR enrichment if ABN is provided and GUID is configured
    let abnLookup = null
    let enriched: {
      abnStatus?: string
      abnRegisteredName?: string
      gstRegistered?: boolean
    } = {}

    if (input.abn) {
      const abrResult = await lookupAbn(input.abn)
      if (abrResult) {
        abnLookup = {
          entityName: abrResult.entityName,
          abnStatus: abrResult.abnStatus,
          gstRegistered: abrResult.gstRegistered,
        }
        enriched = {
          abnStatus: abrResult.abnStatus,
          abnRegisteredName: abrResult.entityName,
          gstRegistered: abrResult.gstRegistered,
        }
      }
    }

    const provider = await createProviderFromInvoice(
      {
        name: input.name || enriched.abnRegisteredName,
        abn: input.abn,
        email: input.email || undefined,
        invoiceId: input.invoiceId,
        ...enriched,
      },
      session.user.id
    )

    return NextResponse.json({ data: { providerId: provider.id, abnLookup } }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
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
