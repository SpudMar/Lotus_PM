/**
 * GET /api/provider-portal/invoices
 * Returns all invoices for the authenticated provider.
 * Filters by providerId — providers can only see their own invoices.
 * Participant name shown (first + last only) — no NDIS number.
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

  const invoices = await prisma.invInvoice.findMany({
    where: {
      providerId: provider.id,
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      receivedAt: true,
      totalCents: true,
      status: true,
      rejectionReason: true,
      participant: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { receivedAt: 'desc' },
  })

  const data = invoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate.toISOString(),
    receivedAt: inv.receivedAt.toISOString(),
    totalCents: inv.totalCents,
    totalFormatted: formatAUD(inv.totalCents),
    status: inv.status,
    rejectionReason: inv.rejectionReason ?? null,
    participantName: inv.participant
      ? `${inv.participant.firstName} ${inv.participant.lastName}`
      : null,
  }))

  return NextResponse.json({ invoices: data })
}
