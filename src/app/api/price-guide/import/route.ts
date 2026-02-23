/**
 * POST /api/price-guide/import
 * Auth: GLOBAL_ADMIN only — price guide import is an admin operation.
 * Body: multipart/form-data with:
 *   - file: XLSX file
 *   - label: string (e.g. "2025-26")
 *   - effectiveFrom: date string (ISO or YYYY-MM-DD)
 * Returns: { data: { versionId, itemCount } }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/session'
import { importPriceGuide } from '@/lib/modules/price-guide/price-guide'
import { ImportPriceGuideSchema } from '@/lib/modules/price-guide/validation'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission('price-guide:import')

    const formData = await request.formData()
    const file = formData.get('file')
    const label = formData.get('label')
    const effectiveFromRaw = formData.get('effectiveFrom')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing or invalid file field', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    // Validate label + effectiveFrom with Zod
    const parsed = ImportPriceGuideSchema.safeParse({
      label: label ?? '',
      effectiveFrom: effectiveFromRaw ?? '',
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error },
        { status: 400 }
      )
    }

    const { label: validLabel, effectiveFrom } = parsed.data

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const result = await importPriceGuide(buffer, effectiveFrom, validLabel, session.user.id)

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message, code: 'IMPORT_ERROR' },
        { status: 422 }
      )
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
