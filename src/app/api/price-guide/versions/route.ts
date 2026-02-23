/**
 * GET /api/price-guide/versions
 * Auth: PLAN_MANAGER+ (price-guide:read)
 * Returns all price guide versions with item counts and importer info.
 */

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { listVersions } from '@/lib/modules/price-guide/price-guide'

export async function GET(): Promise<NextResponse> {
  try {
    await requirePermission('price-guide:read')

    const versions = await listVersions()

    return NextResponse.json({ data: versions })
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
