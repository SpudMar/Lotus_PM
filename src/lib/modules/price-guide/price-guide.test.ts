/**
 * Unit tests for the NDIS Price Guide module (WS-F1).
 * Prisma client is mocked -- no real DB calls.
 * XLSX is generated synthetically in tests.
 */

import * as XLSX from 'xlsx'
import {
  importPriceGuide,
  getSupportItem,
  validateLineItemPrice,
  listSupportItems,
} from './price-guide'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    ndisPriceGuideVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    ndisSupportItem: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePriceGuideXlsx(rows: Record<string, unknown>[] = []): Buffer {
  const headers = [
    'Support Item Number',
    'Support Item Name',
    'Registration Group Number',
    'Registration Group Name',
    'Support Category Number',
    'Support Category Number (PACE)',
    'Support Category Name',
    'Support Category Name (PACE)',
    'Unit',
    'Quote',
    'Type',
    'NSW',
    'Remote',
    'Very Remote',
    'Non-Face-to-Face Support Provision',
    'Provider Travel',
    'Short Notice Cancellations',
    'NDIA Requested Reports',
    'Irregular SIL Supports',
  ]

  const defaultRow: Record<string, unknown> = {
    'Support Item Number': '01_002_0107_1_1',
    'Support Item Name': 'Personal Activities - Standard - Weekday Daytime',
    'Registration Group Number': '0107',
    'Registration Group Name': 'Daily Activities',
    'Support Category Number': '1',
    'Support Category Number (PACE)': '01',
    'Support Category Name': 'Daily Activities',
    'Support Category Name (PACE)': 'Daily Activities (PACE)',
    'Unit': 'H',
    'Quote': 'No',
    'Type': 'Price Limited Supports',
    'NSW': 67.56,
    'Remote': 94.58,
    'Very Remote': 101.34,
    'Non-Face-to-Face Support Provision': 'Y',
    'Provider Travel': 'Y',
    'Short Notice Cancellations': 'Y',
    'NDIA Requested Reports': 'N',
    'Irregular SIL Supports': 'N',
  }

  const dataRows = rows.length > 0 ? rows : [defaultRow]

  const aoaData = [
    headers,
    ...dataRows.map((row) => headers.map((h) => row[h] ?? null)),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoaData)
  XLSX.utils.book_append_sheet(wb, ws, 'Current Support Items')

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)
}

function makeSupportItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-001',
    versionId: 'ver-001',
    itemNumber: '01_002_0107_1_1',
    name: 'Personal Activities - Standard - Weekday Daytime',
    categoryCode: '1',
    categoryCodePace: '01',
    categoryName: 'Daily Activities',
    categoryNamePace: 'Daily Activities (PACE)',
    registrationGroupNumber: '0107',
    registrationGroupName: 'Daily Activities',
    unitType: 'H',
    itemType: 'Price Limited Supports',
    quotable: false,
    priceStandardCents: 6756,
    priceRemoteCents: 9458,
    priceVeryRemoteCents: 10134,
    allowNonFaceToFace: true,
    allowProviderTravel: true,
    allowShortNoticeCancel: true,
    allowNdiaReports: false,
    allowIrregularSil: false,
    gstCode: null,
    ...overrides,
  }
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-001',
    label: '2025-26',
    effectiveFrom: new Date('2025-07-01'),
    effectiveTo: null,
    importedAt: new Date('2026-02-24'),
    importedById: 'user-001',
    ...overrides,
  }
}

// ── importPriceGuide ──────────────────────────────────────────────────────────

describe('importPriceGuide', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('parses XLSX and creates version + items in a transaction', async () => {
    const xlsxBuffer = makePriceGuideXlsx()
    const createdVersion = makeVersion()

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        ndisPriceGuideVersion: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue(createdVersion),
        },
        ndisSupportItem: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }
      return fn(txMock)
    })

    const result = await importPriceGuide(xlsxBuffer, new Date('2025-07-01'), '2025-26', 'user-001')
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(result.versionId).toBe('ver-001')
    expect(result.itemCount).toBe(1)
  })

  it('sets effectiveTo on the previous active version', async () => {
    const xlsxBuffer = makePriceGuideXlsx()
    const effectiveFrom = new Date('2026-01-01')
    let capturedUpdateManyArgs: unknown = null
    const createdVersion = makeVersion({ id: 'ver-002', effectiveFrom })

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        ndisPriceGuideVersion: {
          updateMany: jest.fn().mockImplementation((args: unknown) => {
            capturedUpdateManyArgs = args
            return Promise.resolve({ count: 1 })
          }),
          create: jest.fn().mockResolvedValue(createdVersion),
        },
        ndisSupportItem: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }
      return fn(txMock)
    })

    await importPriceGuide(xlsxBuffer, effectiveFrom, '2026-update', 'user-001')

    expect(capturedUpdateManyArgs).toMatchObject({
      where: { effectiveTo: null },
      data: expect.objectContaining({ effectiveTo: expect.any(Date) }),
    })

    const updateArgs = capturedUpdateManyArgs as { data: { effectiveTo: Date } }
    const expectedDate = new Date('2025-12-31')
    expect(updateArgs.data.effectiveTo.toISOString().slice(0, 10)).toBe(
      expectedDate.toISOString().slice(0, 10)
    )
  })

  it('parses multiple items from XLSX', async () => {
    const rows = [
      {
        'Support Item Number': '01_002_0107_1_1',
        'Support Item Name': 'Personal Activities Standard Weekday',
        'Registration Group Number': '0107',
        'Registration Group Name': 'Daily Activities',
        'Support Category Number': '1',
        'Support Category Number (PACE)': '01',
        'Support Category Name': 'Daily Activities',
        'Support Category Name (PACE)': 'Daily Activities (PACE)',
        'Unit': 'H',
        'Quote': 'No',
        'Type': 'Price Limited Supports',
        'NSW': 67.56,
        'Remote': 94.58,
        'Very Remote': 101.34,
        'Non-Face-to-Face Support Provision': 'Y',
        'Provider Travel': 'Y',
        'Short Notice Cancellations': 'Y',
        'NDIA Requested Reports': 'N',
        'Irregular SIL Supports': 'N',
      },
      {
        'Support Item Number': '04_049_0125_6_1',
        'Support Item Name': 'Assistive Technology Assessment',
        'Registration Group Number': '0125',
        'Registration Group Name': 'Assistive Technology',
        'Support Category Number': '4',
        'Support Category Number (PACE)': '04',
        'Support Category Name': 'Assistance with Social Economic and Community Participation',
        'Support Category Name (PACE)': 'AT and HM (PACE)',
        'Unit': 'E',
        'Quote': 'Yes',
        'Type': 'Quotable Supports',
        'NSW': null,
        'Remote': null,
        'Very Remote': null,
        'Non-Face-to-Face Support Provision': 'N',
        'Provider Travel': 'N',
        'Short Notice Cancellations': 'N',
        'NDIA Requested Reports': 'N',
        'Irregular SIL Supports': 'N',
      },
    ]

    const xlsxBuffer = makePriceGuideXlsx(rows)
    const createdVersion = makeVersion()
    let capturedCreateManyArgs: unknown = null

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        ndisPriceGuideVersion: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue(createdVersion),
        },
        ndisSupportItem: {
          createMany: jest.fn().mockImplementation((args: unknown) => {
            capturedCreateManyArgs = args
            return Promise.resolve({ count: 2 })
          }),
        },
      }
      return fn(txMock)
    })

    const result = await importPriceGuide(xlsxBuffer, new Date('2025-07-01'), '2025-26', 'user-001')
    expect(result.itemCount).toBe(2)

    const createArgs = capturedCreateManyArgs as { data: Array<Record<string, unknown>> }
    expect(createArgs.data).toHaveLength(2)

    const item1 = createArgs.data[0]
    if (!item1) throw new Error('item1 is undefined')
    expect(item1.itemNumber).toBe('01_002_0107_1_1')
    expect(item1.priceStandardCents).toBe(6756)
    expect(item1.priceRemoteCents).toBe(9458)
    expect(item1.quotable).toBe(false)
    expect(item1.allowNonFaceToFace).toBe(true)

    const item2 = createArgs.data[1]
    if (!item2) throw new Error('item2 is undefined')
    expect(item2.itemNumber).toBe('04_049_0125_6_1')
    expect(item2.quotable).toBe(true)
    expect(item2.priceStandardCents).toBeNull()
  })

  it('throws if XLSX has no items', async () => {
    const headers = [
      'Support Item Number', 'Support Item Name', 'Registration Group Number',
      'Registration Group Name', 'Support Category Number', 'Support Category Number (PACE)',
      'Support Category Name', 'Support Category Name (PACE)', 'Unit', 'Quote', 'Type',
      'NSW', 'Remote', 'Very Remote', 'Non-Face-to-Face Support Provision',
      'Provider Travel', 'Short Notice Cancellations', 'NDIA Requested Reports', 'Irregular SIL Supports',
    ]
    const emptyRow = headers.map((h) => h === 'Support Item Number' ? '' : null)
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, emptyRow])
    XLSX.utils.book_append_sheet(wb, ws, 'Current Support Items')
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    await expect(
      importPriceGuide(buffer, new Date('2025-07-01'), '2025-26', 'user-001')
    ).rejects.toThrow('No support items found')
  })
})

// ── getSupportItem ────────────────────────────────────────────────────────────

describe('getSupportItem', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns item when serviceDate falls within a version range', async () => {
    const version = makeVersion()
    const item = makeSupportItem()
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await getSupportItem('01_002_0107_1_1', new Date('2025-10-01'))
    expect(mockPrisma.ndisPriceGuideVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: { lte: new Date('2025-10-01') },
        }),
      })
    )
    expect(result).toEqual(item)
  })

  it('returns null when no version covers the serviceDate', async () => {
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(null)
    const result = await getSupportItem('01_002_0107_1_1', new Date('2020-01-01'))
    expect(result).toBeNull()
    expect(mockPrisma.ndisSupportItem.findFirst).not.toHaveBeenCalled()
  })

  it('returns null when item not found in version', async () => {
    const version = makeVersion()
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(null)
    const result = await getSupportItem('99_999_9999_9_9', new Date('2025-10-01'))
    expect(result).toBeNull()
  })
})

// ── validateLineItemPrice ─────────────────────────────────────────────────────

describe('validateLineItemPrice', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns valid=true when price is at or under standard cap', async () => {
    const version = makeVersion()
    const item = makeSupportItem({ priceStandardCents: 6756 })
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await validateLineItemPrice('01_002_0107_1_1', new Date('2025-10-01'), 6756, 'NON_REMOTE')
    expect(result.valid).toBe(true)
    expect(result.capCents).toBe(6756)
  })

  it('returns valid=false when price exceeds standard cap', async () => {
    const version = makeVersion()
    const item = makeSupportItem({ priceStandardCents: 6756 })
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await validateLineItemPrice('01_002_0107_1_1', new Date('2025-10-01'), 9000, 'NON_REMOTE')
    expect(result.valid).toBe(false)
    expect(result.capCents).toBe(6756)
    expect(result.message).toContain('exceeds')
    expect(result.message).toContain('67.56')
  })

  it('uses remote price for REMOTE region', async () => {
    const version = makeVersion()
    const item = makeSupportItem({ priceStandardCents: 6756, priceRemoteCents: 9458 })
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await validateLineItemPrice('01_002_0107_1_1', new Date('2025-10-01'), 8000, 'REMOTE')
    expect(result.valid).toBe(true)
    expect(result.capCents).toBe(9458)
  })

  it('uses very remote price for VERY_REMOTE region', async () => {
    const version = makeVersion()
    const item = makeSupportItem({ priceStandardCents: 6756, priceVeryRemoteCents: 10134 })
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await validateLineItemPrice('01_002_0107_1_1', new Date('2025-10-01'), 10134, 'VERY_REMOTE')
    expect(result.valid).toBe(true)
    expect(result.capCents).toBe(10134)
  })

  it('returns valid=true for quotable items regardless of price', async () => {
    const version = makeVersion()
    const item = makeSupportItem({ quotable: true, priceStandardCents: null, priceRemoteCents: null, priceVeryRemoteCents: null })
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await validateLineItemPrice('04_049_0125_6_1', new Date('2025-10-01'), 999999, 'NON_REMOTE')
    expect(result.valid).toBe(true)
    expect(result.capCents).toBeNull()
  })

  it('returns valid=false with message when item not found', async () => {
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(null)
    const result = await validateLineItemPrice('00_000_0000_0_0', new Date('2025-10-01'), 5000, 'NON_REMOTE')
    expect(result.valid).toBe(false)
    expect(result.capCents).toBeNull()
    expect(result.message).toContain('not found')
  })

  it('returns valid=true when capCents is null (no catalogue price for region)', async () => {
    const version = makeVersion()
    const item = makeSupportItem({ quotable: false, priceStandardCents: 6756, priceRemoteCents: null })
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findFirst.mockResolvedValue(item)

    const result = await validateLineItemPrice('01_002_0107_1_1', new Date('2025-10-01'), 50000, 'REMOTE')
    expect(result.valid).toBe(true)
    expect(result.capCents).toBeNull()
  })
})

// ── listSupportItems ──────────────────────────────────────────────────────────

describe('listSupportItems', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('defaults to the active (effectiveTo=null) version when versionId not provided', async () => {
    const version = makeVersion()
    const item = makeSupportItem()
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findMany.mockResolvedValue([item])
    mockPrisma.ndisSupportItem.count.mockResolvedValue(1)

    const result = await listSupportItems({})
    expect(mockPrisma.ndisPriceGuideVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { effectiveTo: null } })
    )
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('returns empty results when no version exists', async () => {
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(null)
    const result = await listSupportItems({})
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(mockPrisma.ndisSupportItem.findMany).not.toHaveBeenCalled()
  })

  it('filters by q (search term) across itemNumber, name, categoryName', async () => {
    const version = makeVersion()
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findMany.mockResolvedValue([])
    mockPrisma.ndisSupportItem.count.mockResolvedValue(0)

    await listSupportItems({ q: 'personal' })
    expect(mockPrisma.ndisSupportItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { itemNumber: { contains: 'personal', mode: 'insensitive' } },
            { name: { contains: 'personal', mode: 'insensitive' } },
            { categoryName: { contains: 'personal', mode: 'insensitive' } },
          ]),
        }),
      })
    )
  })

  it('filters by categoryCode', async () => {
    const version = makeVersion()
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findMany.mockResolvedValue([])
    mockPrisma.ndisSupportItem.count.mockResolvedValue(0)

    await listSupportItems({ categoryCode: '1' })
    expect(mockPrisma.ndisSupportItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryCode: '1' }),
      })
    )
  })

  it('uses provided versionId directly without querying for active version', async () => {
    mockPrisma.ndisSupportItem.findMany.mockResolvedValue([])
    mockPrisma.ndisSupportItem.count.mockResolvedValue(0)

    await listSupportItems({ versionId: 'ver-specific' })
    expect(mockPrisma.ndisPriceGuideVersion.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.ndisSupportItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ versionId: 'ver-specific' }),
      })
    )
  })

  it('applies limit and offset', async () => {
    const version = makeVersion()
    mockPrisma.ndisPriceGuideVersion.findFirst.mockResolvedValue(version)
    mockPrisma.ndisSupportItem.findMany.mockResolvedValue([])
    mockPrisma.ndisSupportItem.count.mockResolvedValue(100)

    await listSupportItems({ limit: 25, offset: 50 })
    expect(mockPrisma.ndisSupportItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, skip: 50 })
    )
  })
})
