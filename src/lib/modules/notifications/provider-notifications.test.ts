/**
 * Unit tests for provider-notifications.ts
 *
 * Mocks:
 *   - @/lib/db (prisma)
 *   - ./email-send (sendRawEmail)
 *   - @/lib/shared/currency (formatAUD)
 *
 * Tests cover:
 *   1. notifyProviderAutoRejected — sends email, skips missing provider/email, maps rejection reasons
 *   2. notifyProviderNeedsCodes   — sends email listing unidentified lines, skips missing email
 *   3. notifyProvidersRemittance  — groups by provider, sends per-provider remittance
 *   4. notifyProviderCustom       — sends custom message, skips missing email
 */

// ── Mocks (must come before imports) ──────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findUnique: jest.fn(),
    },
    bnkPaymentBatch: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('./email-send', () => ({
  sendRawEmail: jest.fn(),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import {
  notifyProviderAutoRejected,
  notifyProviderNeedsCodes,
  notifyProvidersRemittance,
  notifyProviderCustom,
} from './provider-notifications'
import { prisma } from '@/lib/db'
import { sendRawEmail } from './email-send'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendRawEmail = sendRawEmail as jest.MockedFunction<typeof sendRawEmail>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2026-001',
    rejectionReason: null,
    provider: {
      id: 'prov-001',
      name: 'Sunrise Support Services',
      email: 'billing@sunrise.com.au',
    },
    participant: {
      firstName: 'Jane',
      lastName: 'Doe',
    },
    lines: [
      {
        id: 'line-001',
        supportItemName: 'Support Worker - Weekday',
        supportItemCode: '01_002_0107_1_1',
        serviceDate: new Date('2026-02-01'),
        quantity: 2,
        unitPriceCents: 6756,
        totalCents: 13512,
        aiCodeConfidence: 'HIGH',
        aiSuggestedCode: '01_002_0107_1_1',
      },
    ],
    ...overrides,
  }
}

function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-001',
    confirmedAt: new Date('2026-02-24T10:00:00Z'),
    scheduledDate: new Date('2026-02-24'),
    payments: [
      {
        id: 'pay-001',
        amountCents: 13512,
        reference: 'REF-001',
        claim: {
          claimReference: 'CLM-2026-001',
          invoice: {
            id: 'inv-001',
            invoiceNumber: 'INV-2026-001',
            totalCents: 13512,
            provider: {
              id: 'prov-001',
              name: 'Sunrise Support Services',
              email: 'billing@sunrise.com.au',
            },
            participant: {
              firstName: 'Jane',
              lastName: 'Doe',
            },
            lines: [
              {
                supportItemName: 'Support Worker',
                supportItemCode: '01_002_0107_1_1',
                serviceDate: new Date('2026-02-01'),
                quantity: 2,
                unitPriceCents: 6756,
                totalCents: 13512,
              },
            ],
          },
        },
      },
    ],
    ...overrides,
  }
}

// ── notifyProviderAutoRejected ─────────────────────────────────────────────────

describe('notifyProviderAutoRejected', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends an email to provider and returns true on success', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(makeInvoice())
    mockSendRawEmail.mockResolvedValue({} as never)

    const result = await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    expect(result).toBe(true)
    expect(mockSendRawEmail).toHaveBeenCalledTimes(1)
    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.to).toBe('billing@sunrise.com.au')
    expect(call.subject).toContain('INV-2026-001')
    expect(call.subject).toContain('could not be processed')
    expect(call.htmlBody).toContain('INV-2026-001')
  })

  it('returns false and does not send when invoice not found', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await notifyProviderAutoRejected({ invoiceId: 'inv-nonexistent' })

    expect(result).toBe(false)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('returns false silently when provider has no email', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ provider: { id: 'prov-001', name: 'Test Provider', email: null } })
    )

    const result = await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    expect(result).toBe(false)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('returns false and does not throw when sendRawEmail throws', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(makeInvoice())
    mockSendRawEmail.mockRejectedValue(new Error('SES throttle'))

    const result = await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    // Should catch the error and return false without throwing
    expect(result).toBe(false)
  })

  it('maps duplicate rejection reason to human-readable text', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ rejectionReason: 'Duplicate line item detected' })
    )
    mockSendRawEmail.mockResolvedValue({} as never)

    await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.htmlBody).toContain('Duplicate invoice')
  })

  it('maps inactive plan rejection reason', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ rejectionReason: 'Plan is not active' })
    )
    mockSendRawEmail.mockResolvedValue({} as never)

    await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.htmlBody).toContain('Inactive plan')
  })

  it('maps inactive provider rejection reason', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ rejectionReason: 'Provider is not active' })
    )
    mockSendRawEmail.mockResolvedValue({} as never)

    await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.htmlBody).toContain('Inactive provider')
  })

  it('includes participant name in email when available', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(makeInvoice())
    mockSendRawEmail.mockResolvedValue({} as never)

    await notifyProviderAutoRejected({ invoiceId: 'inv-001' })

    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.htmlBody).toContain('Jane Doe')
  })
})

// ── notifyProviderNeedsCodes ──────────────────────────────────────────────────

describe('notifyProviderNeedsCodes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends email with correct subject and recipient', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({
        lines: [
          {
            id: 'line-001',
            supportItemName: 'Unidentified Service',
            supportItemCode: '',
            serviceDate: new Date('2026-02-01'),
            quantity: 1,
            unitPriceCents: 5000,
            totalCents: 5000,
            aiCodeConfidence: 'LOW',
            aiSuggestedCode: null,
          },
        ],
      })
    )
    mockSendRawEmail.mockResolvedValue({} as never)

    const result = await notifyProviderNeedsCodes({ invoiceId: 'inv-001' })

    expect(result).toBe(true)
    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.to).toBe('billing@sunrise.com.au')
    expect(call.subject).toContain('INV-2026-001')
    expect(call.subject).toContain('requires support item codes')
  })

  it('returns false when provider has no email', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ provider: { id: 'prov-001', name: 'No Email Provider', email: null } })
    )

    const result = await notifyProviderNeedsCodes({ invoiceId: 'inv-001' })

    expect(result).toBe(false)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('returns false when invoice not found', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await notifyProviderNeedsCodes({ invoiceId: 'inv-404' })

    expect(result).toBe(false)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('includes unidentified line item names in body', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({
        lines: [
          {
            id: 'line-001',
            supportItemName: 'Mystery Support Activity',
            supportItemCode: '',
            serviceDate: new Date('2026-02-01'),
            quantity: 1,
            unitPriceCents: 5000,
            totalCents: 5000,
            aiCodeConfidence: 'NONE',
            aiSuggestedCode: null,
          },
        ],
      })
    )
    mockSendRawEmail.mockResolvedValue({} as never)

    await notifyProviderNeedsCodes({ invoiceId: 'inv-001' })

    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.htmlBody).toContain('Mystery Support Activity')
  })

  it('returns false without throwing when sendRawEmail throws', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(makeInvoice())
    mockSendRawEmail.mockRejectedValue(new Error('SES error'))

    const result = await notifyProviderNeedsCodes({ invoiceId: 'inv-001' })

    expect(result).toBe(false)
  })
})

// ── notifyProvidersRemittance ──────────────────────────────────────────────────

describe('notifyProvidersRemittance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends one email per provider and returns sent count', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(makeBatch())
    mockSendRawEmail.mockResolvedValue({} as never)

    const count = await notifyProvidersRemittance({ batchId: 'batch-001' })

    expect(count).toBe(1)
    expect(mockSendRawEmail).toHaveBeenCalledTimes(1)
    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.to).toBe('billing@sunrise.com.au')
    expect(call.subject).toContain('Payment advice')
  })

  it('sends one email per unique provider when batch has multiple providers', async () => {
    const batch = makeBatch({
      payments: [
        {
          id: 'pay-001',
          amountCents: 13512,
          reference: 'REF-001',
          claim: {
            claimReference: 'CLM-001',
            invoice: {
              id: 'inv-001',
              invoiceNumber: 'INV-001',
              totalCents: 13512,
              provider: { id: 'prov-001', name: 'Provider A', email: 'a@provider.com' },
              participant: { firstName: 'Jane', lastName: 'Doe' },
              lines: [],
            },
          },
        },
        {
          id: 'pay-002',
          amountCents: 20000,
          reference: 'REF-002',
          claim: {
            claimReference: 'CLM-002',
            invoice: {
              id: 'inv-002',
              invoiceNumber: 'INV-002',
              totalCents: 20000,
              provider: { id: 'prov-002', name: 'Provider B', email: 'b@provider.com' },
              participant: { firstName: 'John', lastName: 'Smith' },
              lines: [],
            },
          },
        },
      ],
    })

    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    mockSendRawEmail.mockResolvedValue({} as never)

    const count = await notifyProvidersRemittance({ batchId: 'batch-001' })

    expect(count).toBe(2)
    expect(mockSendRawEmail).toHaveBeenCalledTimes(2)

    const recipients = mockSendRawEmail.mock.calls.map((c) => c[0].to)
    expect(recipients).toContain('a@provider.com')
    expect(recipients).toContain('b@provider.com')
  })

  it('skips payments for providers with no email', async () => {
    const batch = makeBatch({
      payments: [
        {
          id: 'pay-001',
          amountCents: 13512,
          reference: 'REF-001',
          claim: {
            claimReference: 'CLM-001',
            invoice: {
              id: 'inv-001',
              invoiceNumber: 'INV-001',
              totalCents: 13512,
              provider: { id: 'prov-001', name: 'No Email Provider', email: null },
              participant: { firstName: 'Jane', lastName: 'Doe' },
              lines: [],
            },
          },
        },
      ],
    })

    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)

    const count = await notifyProvidersRemittance({ batchId: 'batch-001' })

    expect(count).toBe(0)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('returns 0 when batch not found', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(null)

    const count = await notifyProvidersRemittance({ batchId: 'batch-999' })

    expect(count).toBe(0)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('continues sending to other providers when one send fails', async () => {
    const batch = makeBatch({
      payments: [
        {
          id: 'pay-001',
          amountCents: 10000,
          reference: 'REF-001',
          claim: {
            claimReference: 'CLM-001',
            invoice: {
              id: 'inv-001',
              invoiceNumber: 'INV-001',
              totalCents: 10000,
              provider: { id: 'prov-001', name: 'Provider A', email: 'a@provider.com' },
              participant: { firstName: 'Jane', lastName: 'Doe' },
              lines: [],
            },
          },
        },
        {
          id: 'pay-002',
          amountCents: 20000,
          reference: 'REF-002',
          claim: {
            claimReference: 'CLM-002',
            invoice: {
              id: 'inv-002',
              invoiceNumber: 'INV-002',
              totalCents: 20000,
              provider: { id: 'prov-002', name: 'Provider B', email: 'b@provider.com' },
              participant: { firstName: 'John', lastName: 'Smith' },
              lines: [],
            },
          },
        },
      ],
    })

    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(batch)
    // First call fails, second succeeds
    mockSendRawEmail
      .mockRejectedValueOnce(new Error('SES error'))
      .mockResolvedValueOnce({} as never)

    const count = await notifyProvidersRemittance({ batchId: 'batch-001' })

    // One failed, one succeeded — count reflects successful sends only
    expect(count).toBe(1)
    expect(mockSendRawEmail).toHaveBeenCalledTimes(2)
  })

  it('includes the total payment amount in the email subject', async () => {
    ;(mockPrisma.bnkPaymentBatch.findUnique as jest.Mock).mockResolvedValue(makeBatch())
    mockSendRawEmail.mockResolvedValue({} as never)

    await notifyProvidersRemittance({ batchId: 'batch-001' })

    const call = mockSendRawEmail.mock.calls[0]![0]
    // formatAUD(13512) = $135.12
    expect(call.subject).toContain('$135.12')
  })
})

// ── notifyProviderCustom ───────────────────────────────────────────────────────

describe('notifyProviderCustom', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends a custom email to provider', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ provider: { id: 'prov-001', name: 'Sunrise', email: 'billing@sunrise.com.au' } })
    )
    mockSendRawEmail.mockResolvedValue({} as never)

    const result = await notifyProviderCustom({
      invoiceId: 'inv-001',
      message: 'Please review and resubmit invoice with corrected dates.',
    })

    expect(result).toBe(true)
    const call = mockSendRawEmail.mock.calls[0]![0]
    expect(call.to).toBe('billing@sunrise.com.au')
    expect(call.subject).toContain('INV-2026-001')
    expect(call.htmlBody).toContain('Please review and resubmit invoice with corrected dates.')
  })

  it('returns false when provider has no email', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(
      makeInvoice({ provider: { id: 'prov-001', name: 'No Email', email: null } })
    )

    const result = await notifyProviderCustom({
      invoiceId: 'inv-001',
      message: 'Hello',
    })

    expect(result).toBe(false)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('returns false when invoice not found', async () => {
    ;(mockPrisma.invInvoice.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await notifyProviderCustom({ invoiceId: 'inv-404', message: 'Hello' })

    expect(result).toBe(false)
  })
})
