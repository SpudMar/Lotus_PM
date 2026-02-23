/**
 * NDIS Price Guide Module -- WS-F1
 * REQ-014: NDIS Price Guide 2025-26 compliance.
 *
 * Handles XLSX import, version management, item lookup, and price validation.
 * Financial amounts stored as integers (cents) -- never floats.
 */

import * as XLSX from 'xlsx'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { NdisSupportItem } from '@prisma/client'

// Re-export the Prisma type for use by API routes and UI
export type { NdisSupportItem }

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type PricingRegion = 'NON_REMOTE' | 'REMOTE' | 'VERY_REMOTE'

interface ParsedSupportItem {
  itemNumber: string
  name: string
  categoryCode: string
  categoryCodePace: string
  categoryName: string
  categoryNamePace: string
  registrationGroupNumber: string
  registrationGroupName: string
  unitType: string
  itemType: string | null
  quotable: boolean
  priceStandardCents: number | null
  priceRemoteCents: number | null
  priceVeryRemoteCents: number | null
  allowNonFaceToFace: boolean
  allowProviderTravel: boolean
  allowShortNoticeCancel: boolean
  allowNdiaReports: boolean
  allowIrregularSil: boolean
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Convert a dollar value from the XLSX to whole cents (integer).
 * Returns null if the value is empty, 0, or non-numeric.
 */
function dollarsToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!isFinite(n) || n === 0) return null
  return Math.round(n * 100)
}

/**
 * Map a "Y" string to true, anything else to false.
 */
function yToBool(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === 'Y'
}

// ─────────────────────────────────────────────
// XLSX Parsing
// ─────────────────────────────────────────────

/**
 * Parse a price guide XLSX buffer into support item rows.
 * Sheet: "Current Support Items"
 * Column order is NOT assumed -- all lookups are by header name.
 */
function parseXlsxBuffer(buffer: Buffer): ParsedSupportItem[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  const sheetName = 'Current Support Items'
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(
      `Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`
    )
  }

  // Get all rows as arrays (header row is row 0)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  }) as unknown[][]

  if (rows.length < 2) {
    throw new Error('Price guide sheet is empty or has no data rows')
  }

  // Build header name -> column index map
  const headerRow = rows[0] as unknown[]
  const colIndex = new Map<string, number>()
  headerRow.forEach((h, i) => {
    if (typeof h === 'string') {
      colIndex.set(h.trim(), i)
    }
  })

  const col = (name: string): number => {
    const idx = colIndex.get(name)
    if (idx === undefined) {
      throw new Error(
        `Required column "${name}" not found in price guide sheet. Available: ${[...colIndex.keys()].join(', ')}`
      )
    }
    return idx
  }

  // Column indices by header name
  const iItemNumber = col('Support Item Number')
  const iName = col('Support Item Name')
  const iRegGroupNo = col('Registration Group Number')
  const iRegGroupName = col('Registration Group Name')
  const iCatCode = col('Support Category Number')
  const iCatCodePace = col('Support Category Number (PACE)')
  const iCatName = col('Support Category Name')
  const iCatNamePace = col('Support Category Name (PACE)')
  const iUnit = col('Unit')
  const iQuote = col('Quote')
  const iType = col('Type')
  const iNSW = col('NSW')
  const iRemote = col('Remote')
  const iVeryRemote = col('Very Remote')
  const iNonFaceToFace = col('Non-Face-to-Face Support Provision')
  const iProviderTravel = col('Provider Travel')
  const iShortNoticeCancel = col('Short Notice Cancellations')
  const iNdiaReports = col('NDIA Requested Reports')
  const iIrregularSil = col('Irregular SIL Supports')

  const items: ParsedSupportItem[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const itemNumber = row[iItemNumber]

    // Skip empty rows
    if (!itemNumber || String(itemNumber).trim() === '') continue

    const quoteVal = row[iQuote]
    const quotable =
      typeof quoteVal === 'string' && quoteVal.trim().toLowerCase() === 'yes'

    const typeVal = row[iType]
    const itemType =
      typeof typeVal === 'string' && typeVal.trim() !== '' ? typeVal.trim() : null

    const catCodeRaw = row[iCatCode]
    const catCodePaceRaw = row[iCatCodePace]

    items.push({
      itemNumber: String(itemNumber).trim(),
      name: String(row[iName] ?? '').trim(),
      categoryCode:
        catCodeRaw !== null && catCodeRaw !== undefined ? String(catCodeRaw) : '',
      categoryCodePace:
        catCodePaceRaw !== null && catCodePaceRaw !== undefined ? String(catCodePaceRaw) : '',
      categoryName: String(row[iCatName] ?? '').trim(),
      categoryNamePace: String(row[iCatNamePace] ?? '').trim(),
      registrationGroupNumber: String(row[iRegGroupNo] ?? '').trim(),
      registrationGroupName: String(row[iRegGroupName] ?? '').trim(),
      unitType: String(row[iUnit] ?? '').trim(),
      itemType,
      quotable,
      priceStandardCents: dollarsToCents(row[iNSW]),
      priceRemoteCents: dollarsToCents(row[iRemote]),
      priceVeryRemoteCents: dollarsToCents(row[iVeryRemote]),
      allowNonFaceToFace: yToBool(row[iNonFaceToFace]),
      allowProviderTravel: yToBool(row[iProviderTravel]),
      allowShortNoticeCancel: yToBool(row[iShortNoticeCancel]),
      allowNdiaReports: yToBool(row[iNdiaReports]),
      allowIrregularSil: yToBool(row[iIrregularSil]),
    })
  }

  return items
}

// ─────────────────────────────────────────────
// Public Service Functions
// ─────────────────────────────────────────────

/**
 * Parse XLSX buffer and import a new price guide version.
 * Sets effectiveTo on any current active version to (effectiveFrom - 1 day).
 * Returns { versionId, itemCount }.
 */
export async function importPriceGuide(
  xlsxBuffer: Buffer,
  effectiveFrom: Date,
  label: string,
  userId: string
): Promise<{ versionId: string; itemCount: number }> {
  const items = parseXlsxBuffer(xlsxBuffer)

  if (items.length === 0) {
    throw new Error('No support items found in the uploaded XLSX file')
  }

  const result = await prisma.$transaction(async (tx) => {
    // Close any currently active version
    const effectiveToDate = new Date(effectiveFrom)
    effectiveToDate.setDate(effectiveToDate.getDate() - 1)

    await tx.ndisPriceGuideVersion.updateMany({
      where: { effectiveTo: null },
      data: { effectiveTo: effectiveToDate },
    })

    // Create the new version
    const version = await tx.ndisPriceGuideVersion.create({
      data: {
        label,
        effectiveFrom,
        effectiveTo: null,
        importedById: userId,
      },
    })

    // Bulk insert items
    await tx.ndisSupportItem.createMany({
      data: items.map((item) => ({
        versionId: version.id,
        ...item,
      })),
      skipDuplicates: true,
    })

    return { versionId: version.id, itemCount: items.length }
  })

  await createAuditLog({
    userId,
    action: 'price-guide.imported',
    resource: 'price-guide-version',
    resourceId: result.versionId,
    after: { label, effectiveFrom, itemCount: result.itemCount },
  })

  return result
}

/**
 * Find a support item by code, matching the correct version by serviceDate.
 */
export async function getSupportItem(
  itemNumber: string,
  serviceDate: Date
): Promise<NdisSupportItem | null> {
  const version = await prisma.ndisPriceGuideVersion.findFirst({
    where: {
      effectiveFrom: { lte: serviceDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  })

  if (!version) return null

  return prisma.ndisSupportItem.findFirst({
    where: { versionId: version.id, itemNumber },
  })
}

/**
 * Validate a line item price against the price guide cap for the given date and region.
 */
export async function validateLineItemPrice(
  itemNumber: string,
  serviceDate: Date,
  unitPriceCents: number,
  pricingRegion: PricingRegion
): Promise<{ valid: boolean; capCents: number | null; message?: string }> {
  const item = await getSupportItem(itemNumber, serviceDate)

  if (!item) {
    return {
      valid: false,
      capCents: null,
      message: `Support item "${itemNumber}" not found in price guide for ${serviceDate.toISOString().slice(0, 10)}`,
    }
  }

  // Quotable items have no price cap
  if (item.quotable) {
    return { valid: true, capCents: null }
  }

  // Select cap based on region
  let capCents: number | null
  switch (pricingRegion) {
    case 'REMOTE':
      capCents = item.priceRemoteCents
      break
    case 'VERY_REMOTE':
      capCents = item.priceVeryRemoteCents
      break
    default:
      capCents = item.priceStandardCents
  }

  if (capCents === null) {
    // No price in catalogue for this region -- treat as uncapped
    return { valid: true, capCents: null }
  }

  if (unitPriceCents <= capCents) {
    return { valid: true, capCents }
  }

  const regionLabel =
    pricingRegion === 'NON_REMOTE'
      ? 'standard'
      : pricingRegion.toLowerCase().replace('_', '-')

  return {
    valid: false,
    capCents,
    message: `Unit price $${(unitPriceCents / 100).toFixed(2)} exceeds NDIS price guide cap of $${(capCents / 100).toFixed(2)} for ${regionLabel} region`,
  }
}

/**
 * Search/list support items for autocomplete and settings browse.
 */
export async function listSupportItems(filters: {
  q?: string
  categoryCode?: string
  versionId?: string
  limit?: number
  offset?: number
}): Promise<{ items: NdisSupportItem[]; total: number }> {
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  // If no versionId specified, use the most recent active version
  let versionId = filters.versionId
  if (!versionId) {
    const latestVersion = await prisma.ndisPriceGuideVersion.findFirst({
      where: { effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    })
    if (!latestVersion) {
      return { items: [], total: 0 }
    }
    versionId = latestVersion.id
  }

  const where = {
    versionId,
    ...(filters.categoryCode ? { categoryCode: filters.categoryCode } : {}),
    ...(filters.q
      ? {
          OR: [
            { itemNumber: { contains: filters.q, mode: 'insensitive' as const } },
            { name: { contains: filters.q, mode: 'insensitive' as const } },
            { categoryName: { contains: filters.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.ndisSupportItem.findMany({
      where,
      orderBy: [{ categoryCode: 'asc' }, { itemNumber: 'asc' }],
      take: limit,
      skip: offset,
    }),
    prisma.ndisSupportItem.count({ where }),
  ])

  return { items, total }
}

/**
 * List all price guide versions with item counts and importer info.
 */
export async function listVersions(): Promise<
  Array<{
    id: string
    label: string
    effectiveFrom: Date
    effectiveTo: Date | null
    itemCount: number
    importedAt: Date
    importedBy: { name: string }
  }>
> {
  const versions = await prisma.ndisPriceGuideVersion.findMany({
    include: {
      importedBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { effectiveFrom: 'desc' },
  })

  return versions.map((v) => ({
    id: v.id,
    label: v.label,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    itemCount: v._count.items,
    importedAt: v.importedAt,
    importedBy: { name: v.importedBy.name },
  }))
}
