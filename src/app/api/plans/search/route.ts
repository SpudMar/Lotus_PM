import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('plans:read')

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const participantId = request.nextUrl.searchParams.get('participantId')?.trim() ?? ''
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10) || 10, 50)

    // Build the where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {}

    if (participantId) {
      where.participantId = participantId
    }

    if (q) {
      where.OR = [
        { participant: { firstName: { contains: q, mode: 'insensitive' } } },
        { participant: { lastName: { contains: q, mode: 'insensitive' } } },
        { participant: { ndisNumber: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const plans = await prisma.planPlan.findMany({
      where,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        participant: {
          select: {
            firstName: true,
            lastName: true,
            ndisNumber: true,
          },
        },
      },
      take: limit,
      orderBy: { startDate: 'desc' },
    })

    return NextResponse.json({ data: plans })
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
