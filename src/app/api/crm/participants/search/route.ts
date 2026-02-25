import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('participants:read')

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10) || 10, 50)

    if (!q) {
      return NextResponse.json({ data: [] })
    }

    const participants = await prisma.crmParticipant.findMany({
      where: {
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
      take: limit,
      orderBy: { lastName: 'asc' },
    })

    return NextResponse.json({ data: participants })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
