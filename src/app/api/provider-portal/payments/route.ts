/**
 * GET /api/provider-portal/payments
 * Returns cleared payment history for the authenticated provider.
 *
 * Query path: BnkPayment -> ClmClaim -> InvInvoice where providerId = provider.id
 * AND payment.status = CLEARED
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireProviderSession } from '@/lib/modules/crm/provider-session'
import { formatAUD } from '@/lib/shared/currency'

export async function GET(): Promise<NextResponse> {
  let provider: Awaited<ReturnType<typeof requireProviderSession>>['provider']

  try {
    const result = await requireProviderSession()
    provider = result.provider
  } catch (err) {
    const error = err as { code?: string; message: string }
    if (error.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Provider account not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  const payments = await prisma.bnkPayment.findMany({
    where: {
      status: 'CLEARED',
      claim: {
        invoice: {
          providerId: provider.id,
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      amountCents: true,
      status: true,
      processedAt: true,
      reference: true,
      claim: {
        select: {
          id: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
        },
      },
    },
    orderBy: { processedAt: 'desc' },
  })

  const data = payments.map(p => ({
    id: p.id,
    amountCents: p.amountCents,
    amountFormatted: formatAUD(p.amountCents),
    status: p.status,
    processedAt: p.processedAt?.toISOString() ?? null,
    reference: p.reference ?? null,
    invoiceId: p.claim.invoice.id,
    invoiceNumber: p.claim.invoice.invoiceNumber,
    // Remittance PDF not yet generated — show placeholder
    remittanceAvailable: false,
  }))

  return NextResponse.json({ payments: data })
}
