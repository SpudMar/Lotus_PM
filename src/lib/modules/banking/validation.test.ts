import {
  createPaymentSchema,
  generateAbaSchema,
  submitAbaSchema,
  reconcilePaymentsSchema,
} from './validation'

describe('createPaymentSchema', () => {
  const validInput = {
    claimId: 'clxyz123456789abcdef01234',
    amountCents: 10000,
    bsb: '062-000',
    accountNumber: '12345678',
    accountName: 'Blue Mountains Allied Health',
    reference: 'CLM-2026-0001',
  }

  test('accepts valid input', () => {
    const result = createPaymentSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  test('accepts BSB without dash', () => {
    const result = createPaymentSchema.safeParse({ ...validInput, bsb: '062000' })
    expect(result.success).toBe(true)
  })

  test('rejects invalid BSB format', () => {
    const result = createPaymentSchema.safeParse({ ...validInput, bsb: '12' })
    expect(result.success).toBe(false)
  })

  test('rejects BSB with letters', () => {
    const result = createPaymentSchema.safeParse({ ...validInput, bsb: 'abc-def' })
    expect(result.success).toBe(false)
  })

  test('requires amount greater than zero', () => {
    const result = createPaymentSchema.safeParse({ ...validInput, amountCents: 0 })
    expect(result.success).toBe(false)
  })

  test('rejects negative amount', () => {
    const result = createPaymentSchema.safeParse({ ...validInput, amountCents: -100 })
    expect(result.success).toBe(false)
  })

  test('requires account number between 5-9 chars', () => {
    const tooShort = createPaymentSchema.safeParse({ ...validInput, accountNumber: '1234' })
    expect(tooShort.success).toBe(false)

    const tooLong = createPaymentSchema.safeParse({ ...validInput, accountNumber: '1234567890' })
    expect(tooLong.success).toBe(false)

    const justRight = createPaymentSchema.safeParse({ ...validInput, accountNumber: '12345' })
    expect(justRight.success).toBe(true)
  })

  test('enforces account name max 32 chars', () => {
    const tooLong = createPaymentSchema.safeParse({
      ...validInput,
      accountName: 'x'.repeat(33),
    })
    expect(tooLong.success).toBe(false)

    const exactlyMax = createPaymentSchema.safeParse({
      ...validInput,
      accountName: 'x'.repeat(32),
    })
    expect(exactlyMax.success).toBe(true)
  })

  test('limits reference to 18 chars', () => {
    const result = createPaymentSchema.safeParse({
      ...validInput,
      reference: 'x'.repeat(19),
    })
    expect(result.success).toBe(false)
  })

  test('allows optional reference', () => {
    const { reference: _reference, ...rest } = validInput
    const result = createPaymentSchema.safeParse(rest)
    expect(result.success).toBe(true)
  })
})

describe('generateAbaSchema', () => {
  test('accepts valid payment IDs', () => {
    const result = generateAbaSchema.safeParse({
      paymentIds: ['clxyz123456789abcdef01234'],
    })
    expect(result.success).toBe(true)
  })

  test('requires at least one payment', () => {
    const result = generateAbaSchema.safeParse({ paymentIds: [] })
    expect(result.success).toBe(false)
  })

  test('accepts multiple payment IDs', () => {
    const result = generateAbaSchema.safeParse({
      paymentIds: [
        'clxyz123456789abcdef01234',
        'clxyz123456789abcdef56789',
        'clxyz123456789abcdef11111',
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('submitAbaSchema', () => {
  test('accepts valid bank reference', () => {
    const result = submitAbaSchema.safeParse({ bankReference: 'CBA-20260221-001' })
    expect(result.success).toBe(true)
  })

  test('requires bank reference', () => {
    const result = submitAbaSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  test('rejects empty bank reference', () => {
    const result = submitAbaSchema.safeParse({ bankReference: '' })
    expect(result.success).toBe(false)
  })
})

describe('reconcilePaymentsSchema', () => {
  test('accepts valid payment IDs', () => {
    const result = reconcilePaymentsSchema.safeParse({
      paymentIds: ['clxyz123456789abcdef01234'],
    })
    expect(result.success).toBe(true)
  })

  test('requires at least one payment', () => {
    const result = reconcilePaymentsSchema.safeParse({ paymentIds: [] })
    expect(result.success).toBe(false)
  })
})
