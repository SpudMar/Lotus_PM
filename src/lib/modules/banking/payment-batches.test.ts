/**
 * Tests for the payment batches service.
 * Database (prisma) and audit log are mocked.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    bnkPaymentBatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    bnkPayment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    bnkAbaFile: {
      create: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import {
  createPaymentBatch,
  addPaymentsToBatch,
  removePaymentFromBatch,
  generateBatchAba,
  markBatchUploaded,
  markBatchConfirmed,
  listPaymentBatches,
  deriveBatchStatus,
} from './payment-batches'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const USER_ID = 'user_test_123456789012'

// Reusable mock batch
function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch_test_123456789012',
    description: 'Test Batch',
    scheduledDate: null,
    generatedAt: null,
    uploadedAt: null,
    confirmedAt: null,
    createdAt: new Date(),
    createdById: USER_ID,
    ...overrides,
  }
}

// Reusable mock payment
function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment_test_1234567890',
    status: 'PENDING',
    batchId: null,
    amountCents: 10000,
    bsb: '062000',
    accountNumber: '12345678',
    accountName: 'Test Provider',
    reference: 'CLM-001',
    claim: {
      claimReference: 'CLM-001',
      invoice: { provider: { name: 'Test Provider' } },
    },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── createPaymentBatch ───────────────────────────────────

describe('createPaymentBatch', () => {
  test('creates batch with correct fields', async () => {
    const batch = makeBatch()
    ;(mockPrisma.bnkPaymentBatch.create as jest.Mock).mockResolvedValue(batch)

    const result = await createPaymentBatch({ description: 'Test Batch' }, USER_ID)

    expect(mockPrisma.bnkPaymentBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Test Batch',
        createdById: USER_ID,
      }),
    })
    expect(result.id).toBe(batch.id)
  })

  test('creates batch without optional fields', async () => {
    const batch = makeBatch({ description: null })
    ;(mockPrisma.bnkPaymentBatch.create as jest.Mock).mockResolvedValue(batch)

    const result = await createPaymentBatch({}, USER_ID)

    expect(mockPrisma.bnkPaymentBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdById: USER_ID }),
    })
    expect(result).toBe(batch)
  })

  test('creates batch with scheduledDate', async () => {
    const scheduledDate = new Date('2026-03-01')
    const batch = makeBatch({ scheduledDate })
    ;(mockPrisma.bnkPaymentBatch.create as jest.Mock).mockResolvedValue(batch)

    await createPaymentBatch({ scheduledDate }, USER_ID)

    expect(mockPrisma.bnkPaymentBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduledDate }),
    })
  })
})

// ─── addPaymentsToBatch ───────────────────────────────────

describe('addPaymentsToBatch', () => {
  test('adds payments to a pending batch', async () => {
    const batch = makeBatch()
    const payment = makePayment()
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPayment.findMany as jest.Mock).mockResolvedValue([payment])
    ;(mockPrisma.bnkPayment.updateMany as jest.Mock).mockResolvedValue({ count: 1 })

    await addPaymentsToBatch(batch.id, [payment.id], USER_ID)

    expect(mockPrisma.bnkPayment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [payment.id] } },
      data: { batchId: batch.id },
    })
  })

  test('throws NOT_FOUND when batch does not exist', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(
      addPaymentsToBatch('nonexistent', ['pid'], USER_ID)
    ).rejects.toThrow('NOT_FOUND')
  })

  test('throws INVALID_STATUS when batch already has ABA generated', async () => {
    const batch = makeBatch({ generatedAt: new Date() })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    await expect(
      addPaymentsToBatch(batch.id, ['pid'], USER_ID)
    ).rejects.toThrow('INVALID_STATUS')
  })

  test('throws PAYMENTS_ALREADY_BATCHED when payment is in another batch', async () => {
    const batch = makeBatch()
    const payment = makePayment({ batchId: 'other_batch_id_12345678901' })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPayment.findMany as jest.Mock).mockResolvedValue([payment])

    await expect(
      addPaymentsToBatch(batch.id, [payment.id], USER_ID)
    ).rejects.toThrow('PAYMENTS_ALREADY_BATCHED')
  })

  test('throws PAYMENTS_NOT_FOUND when fewer payments returned than requested', async () => {
    const batch = makeBatch()
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPayment.findMany as jest.Mock).mockResolvedValue([]) // empty — no payments found

    await expect(
      addPaymentsToBatch(batch.id, ['missing_id_1234567890123'], USER_ID)
    ).rejects.toThrow('PAYMENTS_NOT_FOUND')
  })
})

// ─── removePaymentFromBatch ───────────────────────────────

describe('removePaymentFromBatch', () => {
  test('removes payment and sets batchId to null', async () => {
    const batch = makeBatch()
    const payment = makePayment({ batchId: batch.id })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPayment.findFirst as jest.Mock).mockResolvedValue(payment)
    ;(mockPrisma.bnkPayment.update as jest.Mock).mockResolvedValue({ ...payment, batchId: null })

    await removePaymentFromBatch(batch.id, payment.id, USER_ID)

    expect(mockPrisma.bnkPayment.update).toHaveBeenCalledWith({
      where: { id: payment.id },
      data: { batchId: null },
    })
  })

  test('throws NOT_FOUND when batch does not exist', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(
      removePaymentFromBatch('nonexistent', 'payment_id', USER_ID)
    ).rejects.toThrow('NOT_FOUND')
  })

  test('throws INVALID_STATUS when batch ABA already generated', async () => {
    const batch = makeBatch({ generatedAt: new Date() })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    await expect(
      removePaymentFromBatch(batch.id, 'payment_id', USER_ID)
    ).rejects.toThrow('INVALID_STATUS')
  })

  test('throws PAYMENT_NOT_IN_BATCH when payment is not in the batch', async () => {
    const batch = makeBatch()
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPayment.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      removePaymentFromBatch(batch.id, 'wrong_payment_id_12345678', USER_ID)
    ).rejects.toThrow('PAYMENT_NOT_IN_BATCH')
  })
})

// ─── generateBatchAba ─────────────────────────────────────

describe('generateBatchAba', () => {
  test('generates ABA content and marks batch as generated', async () => {
    const payment = makePayment()
    const batch = makeBatch({ payments: [payment] })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkAbaFile.count as jest.Mock).mockResolvedValue(0)
    ;(mockPrisma.bnkAbaFile.create as jest.Mock).mockResolvedValue({ id: 'aba_file_id_123456789012' })
    ;(mockPrisma.bnkPayment.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(mockPrisma.bnkPaymentBatch.update as jest.Mock).mockResolvedValue({ ...batch, generatedAt: new Date() })

    const result = await generateBatchAba(batch.id, USER_ID)

    expect(result.abaContent).toBeTruthy()
    expect(result.filename).toMatch(/\.aba$/)
    expect(mockPrisma.bnkPaymentBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: batch.id },
        data: expect.objectContaining({ generatedAt: expect.any(Date) }),
      })
    )
  })

  test('throws NOT_FOUND when batch does not exist', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(generateBatchAba('nonexistent', USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  test('throws ABA_ALREADY_GENERATED when batch already has ABA', async () => {
    const batch = makeBatch({ generatedAt: new Date() })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue({ ...batch, payments: [] })

    await expect(generateBatchAba(batch.id, USER_ID)).rejects.toThrow('ABA_ALREADY_GENERATED')
  })

  test('throws NO_PENDING_PAYMENTS when batch has no pending payments', async () => {
    const payment = makePayment({ status: 'IN_ABA_FILE' })
    const batch = makeBatch({ payments: [payment] })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    await expect(generateBatchAba(batch.id, USER_ID)).rejects.toThrow('NO_PENDING_PAYMENTS')
  })
})

// ─── markBatchUploaded ────────────────────────────────────

describe('markBatchUploaded', () => {
  test('sets uploadedAt on batch', async () => {
    const batch = makeBatch({ generatedAt: new Date() })
    const updated = makeBatch({ generatedAt: batch.generatedAt, uploadedAt: new Date() })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPaymentBatch.update as jest.Mock).mockResolvedValue(updated)

    const result = await markBatchUploaded(batch.id, USER_ID)

    expect(result.uploadedAt).toBeTruthy()
    expect(mockPrisma.bnkPaymentBatch.update).toHaveBeenCalledWith({
      where: { id: batch.id },
      data: { uploadedAt: expect.any(Date) },
    })
  })

  test('throws NOT_FOUND when batch does not exist', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(markBatchUploaded('nonexistent', USER_ID)).rejects.toThrow('NOT_FOUND')
  })

  test('throws INVALID_STATUS when batch has no generated ABA', async () => {
    const batch = makeBatch() // generatedAt is null
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    await expect(markBatchUploaded(batch.id, USER_ID)).rejects.toThrow('INVALID_STATUS')
  })
})

// ─── markBatchConfirmed ───────────────────────────────────

describe('markBatchConfirmed', () => {
  test('sets confirmedAt on batch', async () => {
    const batch = makeBatch({ generatedAt: new Date(), uploadedAt: new Date() })
    const updated = { ...batch, confirmedAt: new Date() }
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    ;(mockPrisma.bnkPaymentBatch.update as jest.Mock).mockResolvedValue(updated)

    const result = await markBatchConfirmed(batch.id, USER_ID)

    expect(result.confirmedAt).toBeTruthy()
    expect(mockPrisma.bnkPaymentBatch.update).toHaveBeenCalledWith({
      where: { id: batch.id },
      data: { confirmedAt: expect.any(Date) },
    })
  })

  test('throws INVALID_STATUS when batch not yet uploaded', async () => {
    const batch = makeBatch({ generatedAt: new Date() }) // no uploadedAt
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    await expect(markBatchConfirmed(batch.id, USER_ID)).rejects.toThrow('INVALID_STATUS')
  })

  test('throws ALREADY_CONFIRMED when batch already confirmed', async () => {
    const batch = makeBatch({ generatedAt: new Date(), uploadedAt: new Date(), confirmedAt: new Date() })
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    await expect(markBatchConfirmed(batch.id, USER_ID)).rejects.toThrow('ALREADY_CONFIRMED')
  })
})

// ─── listPaymentBatches ───────────────────────────────────

describe('listPaymentBatches', () => {
  test('returns paginated results', async () => {
    const batches = [makeBatch(), makeBatch({ id: 'batch_test_987654321098' })]
    ;(mockPrisma.bnkPaymentBatch.findMany as jest.Mock).mockResolvedValue(batches)
    ;(mockPrisma.bnkPaymentBatch.count as jest.Mock).mockResolvedValue(2)

    const result = await listPaymentBatches({ page: 1, pageSize: 20 })

    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  test('filters PENDING batches (no generatedAt)', async () => {
    ;(mockPrisma.bnkPaymentBatch.findMany as jest.Mock).mockResolvedValue([makeBatch()])
    ;(mockPrisma.bnkPaymentBatch.count as jest.Mock).mockResolvedValue(1)

    await listPaymentBatches({ page: 1, pageSize: 20, status: 'PENDING' })

    expect(mockPrisma.bnkPaymentBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { generatedAt: null },
      })
    )
  })

  test('filters ABA_GENERATED batches', async () => {
    ;(mockPrisma.bnkPaymentBatch.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.bnkPaymentBatch.count as jest.Mock).mockResolvedValue(0)

    await listPaymentBatches({ page: 1, pageSize: 20, status: 'ABA_GENERATED' })

    expect(mockPrisma.bnkPaymentBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { generatedAt: { not: null }, uploadedAt: null },
      })
    )
  })

  test('filters UPLOADED batches', async () => {
    ;(mockPrisma.bnkPaymentBatch.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.bnkPaymentBatch.count as jest.Mock).mockResolvedValue(0)

    await listPaymentBatches({ page: 1, pageSize: 20, status: 'UPLOADED' })

    expect(mockPrisma.bnkPaymentBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadedAt: { not: null }, confirmedAt: null },
      })
    )
  })

  test('filters CONFIRMED batches', async () => {
    ;(mockPrisma.bnkPaymentBatch.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.bnkPaymentBatch.count as jest.Mock).mockResolvedValue(0)

    await listPaymentBatches({ page: 1, pageSize: 20, status: 'CONFIRMED' })

    expect(mockPrisma.bnkPaymentBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { confirmedAt: { not: null } },
      })
    )
  })
})

// ─── deriveBatchStatus ────────────────────────────────────

describe('deriveBatchStatus', () => {
  test('returns PENDING when no dates are set', () => {
    const batch = { generatedAt: null, uploadedAt: null, confirmedAt: null }
    expect(deriveBatchStatus(batch)).toBe('PENDING')
  })

  test('returns ABA_GENERATED when only generatedAt is set', () => {
    const batch = { generatedAt: new Date(), uploadedAt: null, confirmedAt: null }
    expect(deriveBatchStatus(batch)).toBe('ABA_GENERATED')
  })

  test('returns UPLOADED when generatedAt and uploadedAt are set', () => {
    const batch = { generatedAt: new Date(), uploadedAt: new Date(), confirmedAt: null }
    expect(deriveBatchStatus(batch)).toBe('UPLOADED')
  })

  test('returns CONFIRMED when confirmedAt is set', () => {
    const batch = { generatedAt: new Date(), uploadedAt: new Date(), confirmedAt: new Date() }
    expect(deriveBatchStatus(batch)).toBe('CONFIRMED')
  })
})
