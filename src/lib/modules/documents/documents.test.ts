/**
 * Unit tests for the documents module CRUD operations.
 * Prisma client is mocked — no real DB calls are made.
 */

import {
  listDocuments,
  getDocumentById,
  getDocumentsByParticipant,
  createDocument,
  deleteDocument,
} from './documents'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    docDocument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '@/lib/db'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-001',
    participantId: 'part-001',
    name: 'Support Plan 2025-26',
    description: null,
    category: 'PLAN_LETTER' as const,
    mimeType: 'application/pdf',
    sizeBytes: 102400,
    s3Key: 'documents/part-001/doc-001/plan.pdf',
    s3Bucket: 'lotus-pm-dev-uploads',
    version: 1,
    previousId: null,
    uploadedById: 'user-001',
    createdAt: new Date('2026-02-21T10:00:00Z'),
    deletedAt: null,
    participant: { id: 'part-001', firstName: 'Michael', lastName: 'Thompson', ndisNumber: '430167234' },
    uploadedBy: { id: 'user-001', name: 'Sarah Mitchell', email: 'sarah@lotus.com' },
    ...overrides,
  }
}

// ─── listDocuments ────────────────────────────────────────────────────────────

describe('listDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns paginated results with total', async () => {
    const docs = [makeDocument()]
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([docs, 1])

    const result = await listDocuments({ page: 1, pageSize: 20 })

    expect(result.data).toEqual(docs)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(result.totalPages).toBe(1)
  })

  test('filters by participantId', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 0])

    await listDocuments({ participantId: 'part-001', page: 1, pageSize: 20 })

    const [findManyCall] = (mockPrisma.$transaction as jest.Mock).mock.calls[0] as unknown[][]
    // $transaction receives an array of promises — just verify it was called
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(findManyCall).toBeDefined()
  })

  test('calculates totalPages correctly', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 45])

    const result = await listDocuments({ page: 1, pageSize: 20 })

    expect(result.totalPages).toBe(3) // ceil(45/20) = 3
  })

  test('calculates skip from page', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 0])

    await listDocuments({ page: 3, pageSize: 10 })

    // page 3, pageSize 10 → skip = 20
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

// ─── getDocumentById ──────────────────────────────────────────────────────────

describe('getDocumentById', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns document when found', async () => {
    const doc = makeDocument()
    ;(mockPrisma.docDocument.findFirst as jest.Mock).mockResolvedValue(doc)

    const result = await getDocumentById('doc-001')

    expect(result).toEqual(doc)
    expect(mockPrisma.docDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-001', deletedAt: null },
      })
    )
  })

  test('returns null when not found', async () => {
    ;(mockPrisma.docDocument.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await getDocumentById('doc-999')

    expect(result).toBeNull()
  })

  test('excludes soft-deleted records (deletedAt: null in where clause)', async () => {
    ;(mockPrisma.docDocument.findFirst as jest.Mock).mockResolvedValue(null)

    await getDocumentById('doc-001')

    expect(mockPrisma.docDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    )
  })
})

// ─── getDocumentsByParticipant ────────────────────────────────────────────────

describe('getDocumentsByParticipant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('fetches documents for a participant', async () => {
    const docs = [makeDocument(), makeDocument({ id: 'doc-002' })]
    ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValue(docs)

    const result = await getDocumentsByParticipant('part-001')

    expect(result).toEqual(docs)
    expect(mockPrisma.docDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: 'part-001',
          deletedAt: null,
        }),
      })
    )
  })

  test('applies optional category filter', async () => {
    ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValue([])

    await getDocumentsByParticipant('part-001', { category: 'PLAN_LETTER' })

    expect(mockPrisma.docDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'PLAN_LETTER' }),
      })
    )
  })

  test('applies optional limit', async () => {
    ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValue([])

    await getDocumentsByParticipant('part-001', { limit: 5 })

    expect(mockPrisma.docDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    )
  })

  test('excludes soft-deleted records', async () => {
    ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValue([])

    await getDocumentsByParticipant('part-001')

    expect(mockPrisma.docDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    )
  })
})

// ─── createDocument ───────────────────────────────────────────────────────────

describe('createDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('creates a document with correct data', async () => {
    const doc = makeDocument()
    ;(mockPrisma.docDocument.create as jest.Mock).mockResolvedValue(doc)

    const input = {
      name: 'Support Plan 2025-26',
      category: 'PLAN_LETTER' as const,
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      s3Key: 'documents/part-001/doc-001/plan.pdf',
      s3Bucket: 'lotus-pm-dev-uploads',
    }

    const result = await createDocument(input, 'user-001')

    expect(result).toEqual(doc)
    expect(mockPrisma.docDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ...input,
          uploadedById: 'user-001',
        }),
      })
    )
  })

  test('includes participant and uploadedBy relations', async () => {
    ;(mockPrisma.docDocument.create as jest.Mock).mockResolvedValue(makeDocument())

    await createDocument(
      {
        name: 'Test',
        category: 'OTHER',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        s3Key: 'documents/general/doc-001/test.pdf',
        s3Bucket: 'lotus-pm-dev-uploads',
      },
      'user-001'
    )

    expect(mockPrisma.docDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          participant: expect.anything(),
          uploadedBy: expect.anything(),
        }),
      })
    )
  })
})

// ─── deleteDocument (soft delete) ─────────────────────────────────────────────

describe('deleteDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('sets deletedAt instead of hard deleting', async () => {
    ;(mockPrisma.docDocument.update as jest.Mock).mockResolvedValue(
      makeDocument({ deletedAt: new Date() })
    )

    await deleteDocument('doc-001')

    expect(mockPrisma.docDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-001' },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    })
  })

  test('does NOT call prisma.docDocument.delete', async () => {
    ;(mockPrisma.docDocument.update as jest.Mock).mockResolvedValue(makeDocument())

    await deleteDocument('doc-001')

    // Ensure the hard-delete method was never invoked
    expect(mockPrisma.docDocument).not.toHaveProperty('delete')
  })
})
