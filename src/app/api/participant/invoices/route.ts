/**
 * GET /api/participant/invoices
 * Returns the authenticated participant's invoices (paginated, most recent first).
 *
 * REQ-018: Participant app — own data only, scoped by JWT.
 * REQ-010: Soft-deletes respected — excludes deleted invoices.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getParticipantFromToken } from '@/lib/modules/participant-api/auth'

const DEFAULT_PAGE_SIZE = 20

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate
  const participant = getParticipantFromToken(req)
  if (!participant) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // 2. Pagination params
  const { searchParams } = new URL(req.url)
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSizeParam = parseInt(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10)
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSizeParam, 100)

  // 3. Query invoices scoped to this participant
  const [invoices, total] = await Promise.all([
    prisma.invInvoice.findMany({
      where: {
        participantId: participant.participantId,
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        receivedAt: true,
        totalCents: true,
        status: true,
        provider: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invInvoice.count({
      where: {
        participantId: participant.participantId,
        deletedAt: null,
      },
    }),
  ])

  const data = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate.toISOString(),
    receivedAt: inv.receivedAt.toISOString(),
    totalCents: inv.totalCents,
    status: inv.status,
    provider: {
      name: inv.provider?.name ?? 'Unknown provider',
    },
  }))

  return NextResponse.json({ data, total, page, pageSize })
}
