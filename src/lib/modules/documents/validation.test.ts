/**
 * Unit tests for the documents validation schemas.
 */

import {
  createDocumentSchema,
  listDocumentsSchema,
  generateUploadUrlSchema,
} from './validation'

// ─── createDocumentSchema ────────────────────────────────────────────────────

describe('createDocumentSchema', () => {
  const validBase = {
    name: 'Support Plan 2025-26',
    mimeType: 'application/pdf',
    sizeBytes: 102400,
    s3Key: 'documents/general/doc-001/plan.pdf',
    s3Bucket: 'lotus-pm-dev-uploads',
  }

  test('accepts a valid document with required fields only', () => {
    const result = createDocumentSchema.safeParse(validBase)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('OTHER') // default
      expect(result.data.participantId).toBeUndefined()
      expect(result.data.description).toBeUndefined()
    }
  })

  test('accepts a fully-populated document', () => {
    const input = {
      ...validBase,
      participantId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      description: 'Annual support plan approved 2025',
      category: 'SERVICE_AGREEMENT',
    }
    const result = createDocumentSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('SERVICE_AGREEMENT')
    }
  })

  test('accepts all valid category values', () => {
    const categories = [
      'SERVICE_AGREEMENT',
      'PLAN_LETTER',
      'INVOICE',
      'ASSESSMENT',
      'CORRESPONDENCE',
      'OTHER',
    ]
    for (const category of categories) {
      const result = createDocumentSchema.safeParse({ ...validBase, category })
      expect(result.success).toBe(true)
    }
  })

  test('rejects an invalid category', () => {
    const result = createDocumentSchema.safeParse({ ...validBase, category: 'INVALID' })
    expect(result.success).toBe(false)
  })

  test('rejects empty name', () => {
    const result = createDocumentSchema.safeParse({ ...validBase, name: '' })
    expect(result.success).toBe(false)
  })

  test('rejects name longer than 255 characters', () => {
    const result = createDocumentSchema.safeParse({ ...validBase, name: 'a'.repeat(256) })
    expect(result.success).toBe(false)
  })

  test('rejects non-positive sizeBytes', () => {
    expect(createDocumentSchema.safeParse({ ...validBase, sizeBytes: 0 }).success).toBe(false)
    expect(createDocumentSchema.safeParse({ ...validBase, sizeBytes: -1 }).success).toBe(false)
  })

  test('rejects non-integer sizeBytes', () => {
    const result = createDocumentSchema.safeParse({ ...validBase, sizeBytes: 1024.5 })
    expect(result.success).toBe(false)
  })

  test('rejects empty s3Key', () => {
    const result = createDocumentSchema.safeParse({ ...validBase, s3Key: '' })
    expect(result.success).toBe(false)
  })

  test('rejects description longer than 1000 characters', () => {
    const result = createDocumentSchema.safeParse({
      ...validBase,
      description: 'x'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })
})

// ─── listDocumentsSchema ─────────────────────────────────────────────────────

describe('listDocumentsSchema', () => {
  test('applies defaults for page and pageSize', () => {
    const result = listDocumentsSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
    }
  })

  test('coerces string page and pageSize to numbers', () => {
    const result = listDocumentsSchema.safeParse({ page: '2', pageSize: '10' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(2)
      expect(result.data.pageSize).toBe(10)
    }
  })

  test('rejects pageSize > 100', () => {
    const result = listDocumentsSchema.safeParse({ pageSize: 101 })
    expect(result.success).toBe(false)
  })

  test('accepts valid category filter', () => {
    const result = listDocumentsSchema.safeParse({ category: 'PLAN_LETTER' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('PLAN_LETTER')
    }
  })

  test('rejects invalid category filter', () => {
    const result = listDocumentsSchema.safeParse({ category: 'INVALID' })
    expect(result.success).toBe(false)
  })
})

// ─── generateUploadUrlSchema ──────────────────────────────────────────────────

describe('generateUploadUrlSchema', () => {
  const validBase = {
    filename: 'support-plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 512000,
  }

  test('accepts valid upload URL request', () => {
    const result = generateUploadUrlSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  test('accepts optional participantId', () => {
    const result = generateUploadUrlSchema.safeParse({
      ...validBase,
      participantId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
    })
    expect(result.success).toBe(true)
  })

  test('rejects empty filename', () => {
    const result = generateUploadUrlSchema.safeParse({ ...validBase, filename: '' })
    expect(result.success).toBe(false)
  })

  test('rejects non-positive sizeBytes', () => {
    expect(generateUploadUrlSchema.safeParse({ ...validBase, sizeBytes: 0 }).success).toBe(false)
    expect(generateUploadUrlSchema.safeParse({ ...validBase, sizeBytes: -100 }).success).toBe(false)
  })

  test('rejects missing mimeType', () => {
    const { mimeType: _mt, ...rest } = validBase
    const result = generateUploadUrlSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})
