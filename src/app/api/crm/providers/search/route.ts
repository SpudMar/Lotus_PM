import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('providers:read')

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10) || 10, 50)

    if (!q) {
      return NextResponse.json({ data: [] })
    }

    const providers = await prisma.crmProvider.findMany({
      where: {
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
      take: limit,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: providers })
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
