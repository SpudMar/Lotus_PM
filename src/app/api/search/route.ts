import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

interface SearchResult {
  id: string
  label: string
  href: string
}

interface SearchResponse {
  participants: SearchResult[]
  providers: SearchResult[]
  invoices: SearchResult[]
}

/**
 * GET /api/search?q=searchterm
 *
 * Global search across participants, providers, and invoices.
 * Returns up to 5 results per category. Case-insensitive contains search.
 * Requires authenticated session (any role).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireSession()

    const q = request.nextUrl.searchParams.get('q')?.trim()

    if (!q || q.length === 0) {
      return NextResponse.json<SearchResponse>({
        participants: [],
        providers: [],
        invoices: [],
      })
    }

    const [participants, providers, invoices] = await Promise.all([
      // Search participants by firstName, lastName, ndisNumber
      prisma.crmParticipant.findMany({
        where: {
          deletedAt: null,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { ndisNumber: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          ndisNumber: true,
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),

      // Search providers by name, abn
      prisma.crmProvider.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { abn: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          abn: true,
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),

      // Search invoices by invoiceNumber, sourceEmail
      prisma.invInvoice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { sourceEmail: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          sourceEmail: true,
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const response: SearchResponse = {
      participants: participants.map((p) => ({
        id: p.id,
        label: `${p.firstName} ${p.lastName} (${p.ndisNumber})`,
        href: `/participants/${p.id}`,
      })),
      providers: providers.map((p) => ({
        id: p.id,
        label: `${p.name} (ABN: ${p.abn})`,
        href: `/providers/${p.id}`,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        label: i.invoiceNumber + (i.sourceEmail ? ` - ${i.sourceEmail}` : ''),
        href: `/invoices/${i.id}`,
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
