import {
  createClaimSchema,
  submitClaimSchema,
  recordOutcomeSchema,
  createBatchSchema,
  submitBatchSchema,
} from './validation'

describe('createClaimSchema', () => {
  const validInput = {
    invoiceId: 'clxyz123456789abcdef01234',
    lines: [
      {
        supportItemCode: '15_042_0128_1_3',
        supportItemName: 'Assistance with daily life',
        categoryCode: '15',
        serviceDate: '2026-02-15',
        quantity: 2,
        unitPriceCents: 5000,
        totalCents: 10000,
        gstCents: 0,
      },
    ],
  }

  test('accepts valid input', () => {
    const result = createClaimSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  test('requires at least one line', () => {
    const result = createClaimSchema.safeParse({ ...validInput, lines: [] })
    expect(result.success).toBe(false)
  })

  test('requires invoiceId', () => {
    const { invoiceId: _invoiceId, ...rest } = validInput
    const result = createClaimSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  test('requires support item code in lines', () => {
    const result = createClaimSchema.safeParse({
      ...validInput,
      lines: [{ ...validInput.lines[0], supportItemCode: '' }],
    })
    expect(result.success).toBe(false)
  })

  test('allows optional invoiceLineId', () => {
    const result = createClaimSchema.safeParse({
      ...validInput,
      lines: [{ ...validInput.lines[0], invoiceLineId: 'clxyz123456789abcdef01234' }],
    })
    expect(result.success).toBe(true)
  })

  test('coerces serviceDate string to Date', () => {
    const result = createClaimSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      const firstLine = result.data.lines[0]
      expect(firstLine).toBeDefined()
      expect(firstLine?.serviceDate).toBeInstanceOf(Date)
    }
  })

  test('defaults gstCents to 0', () => {
    const input = {
      ...validInput,
      lines: [{
        supportItemCode: '15_042_0128_1_3',
        supportItemName: 'Test',
        categoryCode: '15',
        serviceDate: '2026-02-15',
        quantity: 1,
        unitPriceCents: 5000,
        totalCents: 5000,
      }],
    }
    const result = createClaimSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      const firstLine = result.data.lines[0]
      expect(firstLine).toBeDefined()
      expect(firstLine?.gstCents).toBe(0)
    }
  })
})

describe('submitClaimSchema', () => {
  test('accepts empty object', () => {
    const result = submitClaimSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('accepts prodaReference', () => {
    const result = submitClaimSchema.safeParse({ prodaReference: 'PRODA-12345' })
    expect(result.success).toBe(true)
  })

  test('accepts notes', () => {
    const result = submitClaimSchema.safeParse({ notes: 'Test notes' })
    expect(result.success).toBe(true)
  })

  test('rejects notes over 500 chars', () => {
    const result = submitClaimSchema.safeParse({ notes: 'x'.repeat(501) })
    expect(result.success).toBe(false)
  })
})

describe('recordOutcomeSchema', () => {
  test('accepts valid APPROVED outcome', () => {
    const result = recordOutcomeSchema.safeParse({
      outcome: 'APPROVED',
      approvedCents: 10000,
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid REJECTED outcome', () => {
    const result = recordOutcomeSchema.safeParse({
      outcome: 'REJECTED',
      approvedCents: 0,
      outcomeNotes: 'Rate exceeds price guide',
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid PARTIAL outcome with line outcomes', () => {
    const result = recordOutcomeSchema.safeParse({
      outcome: 'PARTIAL',
      approvedCents: 5000,
      lineOutcomes: [
        {
          claimLineId: 'clxyz123456789abcdef01234',
          status: 'APPROVED',
          approvedCents: 5000,
        },
        {
          claimLineId: 'clxyz123456789abcdef56789',
          status: 'REJECTED',
          approvedCents: 0,
          outcomeNotes: 'Duplicate line',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid outcome type', () => {
    const result = recordOutcomeSchema.safeParse({
      outcome: 'INVALID',
      approvedCents: 0,
    })
    expect(result.success).toBe(false)
  })

  test('requires approvedCents', () => {
    const result = recordOutcomeSchema.safeParse({ outcome: 'APPROVED' })
    expect(result.success).toBe(false)
  })

  test('rejects negative approvedCents', () => {
    const result = recordOutcomeSchema.safeParse({
      outcome: 'APPROVED',
      approvedCents: -100,
    })
    expect(result.success).toBe(false)
  })
})

describe('createBatchSchema', () => {
  test('accepts valid input', () => {
    const result = createBatchSchema.safeParse({
      claimIds: ['clxyz123456789abcdef01234'],
    })
    expect(result.success).toBe(true)
  })

  test('requires at least one claim', () => {
    const result = createBatchSchema.safeParse({ claimIds: [] })
    expect(result.success).toBe(false)
  })

  test('accepts optional notes', () => {
    const result = createBatchSchema.safeParse({
      claimIds: ['clxyz123456789abcdef01234'],
      notes: 'Weekly batch',
    })
    expect(result.success).toBe(true)
  })
})

describe('submitBatchSchema', () => {
  test('accepts empty object', () => {
    const result = submitBatchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('accepts prodaBatchId', () => {
    const result = submitBatchSchema.safeParse({ prodaBatchId: 'BATCH-123' })
    expect(result.success).toBe(true)
  })
})
