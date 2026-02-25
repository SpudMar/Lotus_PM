import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission('invoices:read')

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20, 100)

    if (!q) {
      return NextResponse.json({ data: [] })
    }

    // Find the latest price guide version
    const latestVersion = await prisma.ndisPriceGuideVersion.findFirst({
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true },
    })

    if (!latestVersion) {
      return NextResponse.json({ data: [] })
    }

    const items = await prisma.ndisSupportItem.findMany({
      where: {
        versionId: latestVersion.id,
        OR: [
          { itemNumber: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { categoryName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        itemNumber: true,
        name: true,
        categoryCode: true,
        categoryName: true,
        priceStandardCents: true,
        unitType: true,
      },
      take: limit,
      orderBy: { itemNumber: 'asc' },
    })

    const data = items.map((item) => ({
      id: item.id,
      itemNumber: item.itemNumber,
      name: item.name,
      categoryCode: item.categoryCode,
      categoryName: item.categoryName,
      unitPriceCents: item.priceStandardCents ?? 0,
      unit: item.unitType,
    }))

    return NextResponse.json({ data })
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
