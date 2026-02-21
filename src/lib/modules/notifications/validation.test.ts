import {
  createNotificationSchema,
  notificationActionSchema,
} from './validation'

describe('createNotificationSchema', () => {
  const validInput = {
    userId: 'clxyz123456789abcdef01234',
    type: 'INFO' as const,
    title: 'New invoice received',
    body: 'Invoice INV-001 from Provider A is ready for review.',
    link: '/invoices?id=123',
    category: 'INVOICE' as const,
    priority: 'NORMAL' as const,
    channels: ['IN_APP'] as const,
  }

  test('accepts valid input', () => {
    const result = createNotificationSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  test('accepts minimal input (no optional fields)', () => {
    const result = createNotificationSchema.safeParse({
      userId: 'user1',
      type: 'INFO',
      title: 'Test',
      body: 'Test body',
      category: 'SYSTEM',
    })
    expect(result.success).toBe(true)
  })

  test('accepts all notification types', () => {
    const types = ['INFO', 'WARNING', 'ACTION_REQUIRED', 'SUCCESS'] as const
    for (const type of types) {
      const result = createNotificationSchema.safeParse({ ...validInput, type })
      expect(result.success).toBe(true)
    }
  })

  test('accepts all categories', () => {
    const categories = ['INVOICE', 'CLAIM', 'PAYMENT', 'PLAN', 'COMPLIANCE', 'SYSTEM'] as const
    for (const category of categories) {
      const result = createNotificationSchema.safeParse({ ...validInput, category })
      expect(result.success).toBe(true)
    }
  })

  test('accepts all priority levels', () => {
    const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const
    for (const priority of priorities) {
      const result = createNotificationSchema.safeParse({ ...validInput, priority })
      expect(result.success).toBe(true)
    }
  })

  test('accepts all channel types', () => {
    const result = createNotificationSchema.safeParse({
      ...validInput,
      channels: ['IN_APP', 'EMAIL', 'SMS'],
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid type', () => {
    const result = createNotificationSchema.safeParse({ ...validInput, type: 'INVALID' })
    expect(result.success).toBe(false)
  })

  test('rejects invalid category', () => {
    const result = createNotificationSchema.safeParse({ ...validInput, category: 'INVALID' })
    expect(result.success).toBe(false)
  })

  test('rejects empty title', () => {
    const result = createNotificationSchema.safeParse({ ...validInput, title: '' })
    expect(result.success).toBe(false)
  })

  test('rejects empty body', () => {
    const result = createNotificationSchema.safeParse({ ...validInput, body: '' })
    expect(result.success).toBe(false)
  })

  test('enforces title max length', () => {
    const result = createNotificationSchema.safeParse({
      ...validInput,
      title: 'x'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  test('enforces body max length', () => {
    const result = createNotificationSchema.safeParse({
      ...validInput,
      body: 'x'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })
})

describe('notificationActionSchema', () => {
  test('accepts read action', () => {
    const result = notificationActionSchema.safeParse({ action: 'read' })
    expect(result.success).toBe(true)
  })

  test('accepts read-all action', () => {
    const result = notificationActionSchema.safeParse({ action: 'read-all' })
    expect(result.success).toBe(true)
  })

  test('accepts dismiss action', () => {
    const result = notificationActionSchema.safeParse({ action: 'dismiss' })
    expect(result.success).toBe(true)
  })

  test('rejects invalid action', () => {
    const result = notificationActionSchema.safeParse({ action: 'delete' })
    expect(result.success).toBe(false)
  })

  test('rejects missing action', () => {
    const result = notificationActionSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
