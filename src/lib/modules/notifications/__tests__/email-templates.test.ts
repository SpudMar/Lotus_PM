/**
 * Tests for email templates CRUD, interpolation, preview, and SES sending.
 * All external dependencies (Prisma, SES, S3) are mocked.
 * No real AWS calls are made.
 */

import {
  interpolateTemplate,
  getAvailableMergeFields,
  createEmailTemplate,
  getEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  previewTemplate,
  listEmailTemplates,
} from '../email-templates'

import { sendTemplatedEmail, sendRawEmail } from '../email-send'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    notifEmailTemplate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    notifSentEmail: {
      create: jest.fn(),
    },
    docDocument: {
      findMany: jest.fn(),
    },
    coreAuditLog: {
      create: jest.fn(),
    },
  },
}))

jest.mock('../ses-client', () => ({
  sendSesEmail: jest.fn(),
}))

// S3 mock — intercept all S3Client instances and provide controllable send()
// We store mocked instances in a module-level array for per-test control
const s3MockSendFn = jest.fn()

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: s3MockSendFn })),
    GetObjectCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  }
})

// Helper: set up S3 to return a Buffer for a download call
function mockS3Download(content: Buffer): void {
  const asyncIter = async function* () { yield content }
  s3MockSendFn.mockResolvedValueOnce({ Body: asyncIter() })
}

import { prisma } from '@/lib/db'
import { sendSesEmail } from '../ses-client'
import type { NotifEmailTemplate, NotifSentEmail } from '@prisma/client'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendSesEmail = sendSesEmail as jest.MockedFunction<typeof sendSesEmail>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<NotifEmailTemplate> = {}): NotifEmailTemplate {
  return {
    id: 'tpl-001',
    name: 'Welcome Pack',
    type: 'WELCOME_PACK',
    subject: 'Welcome {participantFirstName}',
    bodyHtml: '<p>Dear {participantFirstName}, welcome to Lotus Assist!</p>',
    bodyText: 'Dear {participantFirstName}, welcome to Lotus Assist!',
    mergeFields: ['participantFirstName', 'companyName'],
    fixedAttachmentIds: [],
    supportsVariableAttachment: false,
    variableAttachmentDescription: null,
    includesFormLink: false,
    formLinkUrl: null,
    isActive: true,
    createdById: 'user-001',
    createdAt: new Date('2026-02-23'),
    updatedAt: new Date('2026-02-23'),
    ...overrides,
  }
}

function makeSentEmail(overrides: Partial<NotifSentEmail> = {}): NotifSentEmail {
  return {
    id: 'sent-001',
    templateId: 'tpl-001',
    toEmail: 'participant@example.com',
    toName: 'Jane Smith',
    subject: 'Welcome Jane',
    bodyHtml: '<p>Dear Jane, welcome to Lotus Assist!</p>',
    sesMessageId: 'ses-msg-001',
    status: 'SENT',
    errorMessage: null,
    sentAt: new Date(),
    participantId: null,
    attachmentKeys: [],
    triggeredById: null,
    createdAt: new Date(),
    ...overrides,
  }
}

// ─── interpolateTemplate ──────────────────────────────────────────────────────

describe('interpolateTemplate', () => {
  test('replaces a known {key} with its value', () => {
    const result = interpolateTemplate('Hello {name}!', { name: 'Jane' })
    expect(result).toBe('Hello Jane!')
  })

  test('replaces multiple different placeholders', () => {
    const result = interpolateTemplate('{greeting} {name}, from {company}', {
      greeting: 'Hello',
      name: 'Jane',
      company: 'Lotus Assist',
    })
    expect(result).toBe('Hello Jane, from Lotus Assist')
  })

  test('leaves unknown placeholders unchanged', () => {
    const result = interpolateTemplate('Hello {name}, see {unknown}', { name: 'Jane' })
    expect(result).toBe('Hello Jane, see {unknown}')
  })

  test('handles empty values map gracefully', () => {
    const result = interpolateTemplate('Hello {name}!', {})
    expect(result).toBe('Hello {name}!')
  })

  test('replaces same placeholder appearing multiple times', () => {
    const result = interpolateTemplate('{name} is the name. Again: {name}.', { name: 'Jane' })
    expect(result).toBe('Jane is the name. Again: Jane.')
  })

  test('does not modify template with no placeholders', () => {
    const template = 'No placeholders here.'
    expect(interpolateTemplate(template, { name: 'Jane' })).toBe(template)
  })

  test('handles empty string value', () => {
    const result = interpolateTemplate('Hello {name}!', { name: '' })
    expect(result).toBe('Hello !')
  })

  test('handles template with only a placeholder', () => {
    expect(interpolateTemplate('{name}', { name: 'Jane' })).toBe('Jane')
  })
})

// ─── getAvailableMergeFields ──────────────────────────────────────────────────

describe('getAvailableMergeFields', () => {
  test('returns a non-empty array of merge field definitions', () => {
    const fields = getAvailableMergeFields()
    expect(Array.isArray(fields)).toBe(true)
    expect(fields.length).toBeGreaterThan(0)
  })

  test('every field has key, label, description, and example', () => {
    const fields = getAvailableMergeFields()
    for (const f of fields) {
      expect(typeof f.key).toBe('string')
      expect(typeof f.label).toBe('string')
      expect(typeof f.description).toBe('string')
      expect(typeof f.example).toBe('string')
    }
  })

  test('includes participantName field', () => {
    const fields = getAvailableMergeFields()
    expect(fields.some((f) => f.key === 'participantName')).toBe(true)
  })

  test('includes providerName field', () => {
    const fields = getAvailableMergeFields()
    expect(fields.some((f) => f.key === 'providerName')).toBe(true)
  })
})

// ─── createEmailTemplate ──────────────────────────────────────────────────────

describe('createEmailTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('creates a template and writes an audit log', async () => {
    const tpl = makeTemplate()
    ;(mockPrisma.notifEmailTemplate.create as jest.Mock).mockResolvedValueOnce(tpl)
    ;(mockPrisma.coreAuditLog.create as jest.Mock).mockResolvedValueOnce({})

    const result = await createEmailTemplate(
      {
        name: 'Welcome Pack',
        type: 'WELCOME_PACK',
        subject: 'Welcome {participantFirstName}',
        bodyHtml: '<p>Dear {participantFirstName}</p>',
        mergeFields: ['participantFirstName'],
      },
      'user-001'
    )

    expect(mockPrisma.notifEmailTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Welcome Pack',
          type: 'WELCOME_PACK',
          createdById: 'user-001',
          isActive: true,
        }),
      })
    )
    expect(mockPrisma.coreAuditLog.create).toHaveBeenCalled()
    expect(result.id).toBe('tpl-001')
  })

  test('rejects invalid merge field identifiers', async () => {
    await expect(
      createEmailTemplate(
        {
          name: 'Bad Template',
          type: 'CUSTOM',
          subject: 'Subject',
          bodyHtml: '<p>Body</p>',
          mergeFields: ['invalid field with spaces'],
        },
        'user-001'
      )
    ).rejects.toThrow('Invalid merge field identifier')
  })

  test('rejects merge fields with special characters', async () => {
    await expect(
      createEmailTemplate(
        {
          name: 'Bad Template 2',
          type: 'CUSTOM',
          subject: 'Subject',
          bodyHtml: '<p>Body</p>',
          mergeFields: ['field-with-dashes'],
        },
        'user-001'
      )
    ).rejects.toThrow('Invalid merge field identifier')
  })

  test('accepts camelCase and snake_case merge fields', async () => {
    const tpl = makeTemplate({ mergeFields: ['participantName', 'some_field'] })
    ;(mockPrisma.notifEmailTemplate.create as jest.Mock).mockResolvedValueOnce(tpl)
    ;(mockPrisma.coreAuditLog.create as jest.Mock).mockResolvedValueOnce({})

    await expect(
      createEmailTemplate(
        {
          name: 'Good Template',
          type: 'CUSTOM',
          subject: 'Subject',
          bodyHtml: '<p>Body</p>',
          mergeFields: ['participantName', 'some_field'],
        },
        'user-001'
      )
    ).resolves.toBeDefined()
  })
})

// ─── getEmailTemplate ─────────────────────────────────────────────────────────

describe('getEmailTemplate', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('returns template when found', async () => {
    const tpl = makeTemplate()
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)
    const result = await getEmailTemplate('tpl-001')
    expect(result).toEqual(tpl)
    expect(mockPrisma.notifEmailTemplate.findUnique).toHaveBeenCalledWith({ where: { id: 'tpl-001' } })
  })

  test('returns null when not found', async () => {
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null)
    const result = await getEmailTemplate('nonexistent')
    expect(result).toBeNull()
  })
})

// ─── updateEmailTemplate ──────────────────────────────────────────────────────

describe('updateEmailTemplate', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('updates fields and logs audit trail', async () => {
    const existing = makeTemplate()
    const updated = makeTemplate({ name: 'Renamed Template', isActive: true })

    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(existing)
    ;(mockPrisma.notifEmailTemplate.update as jest.Mock).mockResolvedValueOnce(updated)
    ;(mockPrisma.coreAuditLog.create as jest.Mock).mockResolvedValueOnce({})

    const result = await updateEmailTemplate('tpl-001', { name: 'Renamed Template' }, 'user-001')

    expect(mockPrisma.notifEmailTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tpl-001' },
        data: expect.objectContaining({ name: 'Renamed Template' }),
      })
    )
    expect(mockPrisma.coreAuditLog.create).toHaveBeenCalled()
    expect(result.name).toBe('Renamed Template')
  })

  test('throws when template not found', async () => {
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(updateEmailTemplate('bad-id', { name: 'X' }, 'user-001')).rejects.toThrow('Email template not found')
  })
})

// ─── deleteEmailTemplate (soft deactivation) ─────────────────────────────────

describe('deleteEmailTemplate', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('sets isActive to false (does not hard-delete)', async () => {
    const existing = makeTemplate()
    const deactivated = makeTemplate({ isActive: false })

    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(existing)
    ;(mockPrisma.notifEmailTemplate.update as jest.Mock).mockResolvedValueOnce(deactivated)
    ;(mockPrisma.coreAuditLog.create as jest.Mock).mockResolvedValueOnce({})

    const result = await deleteEmailTemplate('tpl-001', 'user-001')

    expect(mockPrisma.notifEmailTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-001' },
      data: { isActive: false },
    })
    expect(result.isActive).toBe(false)
  })

  test('throws when template not found', async () => {
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(deleteEmailTemplate('bad-id', 'user-001')).rejects.toThrow('Email template not found')
  })
})

// ─── previewTemplate ──────────────────────────────────────────────────────────

describe('previewTemplate', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('renders template with sample data', async () => {
    const tpl = makeTemplate()
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)

    const result = await previewTemplate('tpl-001', {
      participantFirstName: 'Jane',
      companyName: 'Lotus Assist',
    })

    expect(result.subject).toBe('Welcome Jane')
    expect(result.bodyHtml).toBe('<p>Dear Jane, welcome to Lotus Assist!</p>')
    expect(result.bodyText).toBe('Dear Jane, welcome to Lotus Assist!')
  })

  test('returns null bodyText when template has no bodyText', async () => {
    const tpl = makeTemplate({ bodyText: null })
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)

    const result = await previewTemplate('tpl-001', { participantFirstName: 'Jane' })
    expect(result.bodyText).toBeNull()
  })

  test('leaves unknown placeholders in preview unchanged', async () => {
    const tpl = makeTemplate({ subject: 'Hello {unknownField}', bodyHtml: '<p>Test</p>' })
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)

    const result = await previewTemplate('tpl-001', {})
    expect(result.subject).toBe('Hello {unknownField}')
  })

  test('throws when template not found', async () => {
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(previewTemplate('bad-id', {})).rejects.toThrow('Email template not found')
  })
})

// ─── listEmailTemplates ───────────────────────────────────────────────────────

describe('listEmailTemplates', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('returns all templates with no filter', async () => {
    const templates = [makeTemplate(), makeTemplate({ id: 'tpl-002', name: 'Invoice Alert' })]
    ;(mockPrisma.notifEmailTemplate.findMany as jest.Mock).mockResolvedValueOnce(templates)

    const result = await listEmailTemplates()
    expect(result).toHaveLength(2)
    expect(mockPrisma.notifEmailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })

  test('filters by type', async () => {
    ;(mockPrisma.notifEmailTemplate.findMany as jest.Mock).mockResolvedValueOnce([])
    await listEmailTemplates({ type: 'WELCOME_PACK' })
    expect(mockPrisma.notifEmailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: 'WELCOME_PACK' } })
    )
  })

  test('filters by isActive=false', async () => {
    ;(mockPrisma.notifEmailTemplate.findMany as jest.Mock).mockResolvedValueOnce([])
    await listEmailTemplates({ isActive: false })
    expect(mockPrisma.notifEmailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: false } })
    )
  })
})

// ─── sendTemplatedEmail ───────────────────────────────────────────────────────

describe('sendTemplatedEmail', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('fetches template, interpolates, sends via SES, records NotifSentEmail', async () => {
    const tpl = makeTemplate()
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)
    ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValueOnce([]) // no fixed attachments
    mockSendSesEmail.mockResolvedValueOnce({ messageId: 'ses-001' })
    ;(mockPrisma.notifSentEmail.create as jest.Mock).mockResolvedValueOnce(makeSentEmail())

    const result = await sendTemplatedEmail({
      templateId: 'tpl-001',
      recipientEmail: 'jane@example.com',
      recipientName: 'Jane Smith',
      mergeFieldValues: { participantFirstName: 'Jane', companyName: 'Lotus Assist' },
    })

    expect(mockSendSesEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        subject: 'Welcome Jane',
        htmlBody: '<p>Dear Jane, welcome to Lotus Assist!</p>',
      })
    )
    expect(mockPrisma.notifSentEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: 'tpl-001',
          toEmail: 'jane@example.com',
          status: 'SENT',
          sesMessageId: 'ses-001',
        }),
      })
    )
    expect(result.status).toBe('SENT')
  })

  test('records FAILED status when SES throws', async () => {
    const tpl = makeTemplate()
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)
    ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValueOnce([])
    mockSendSesEmail.mockRejectedValueOnce(new Error('SES throttled'))
    const failedEmail = makeSentEmail({ status: 'FAILED', sesMessageId: null, errorMessage: 'SES throttled' })
    ;(mockPrisma.notifSentEmail.create as jest.Mock).mockResolvedValueOnce(failedEmail)

    const result = await sendTemplatedEmail({
      templateId: 'tpl-001',
      recipientEmail: 'jane@example.com',
      mergeFieldValues: {},
    })

    expect(mockPrisma.notifSentEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'SES throttled',
        }),
      })
    )
    expect(result.status).toBe('FAILED')
  })

  test('throws when template not found', async () => {
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(
      sendTemplatedEmail({ templateId: 'bad', recipientEmail: 'x@y.com', mergeFieldValues: {} })
    ).rejects.toThrow('Email template not found')
  })

  test('throws when template is inactive', async () => {
    ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(makeTemplate({ isActive: false }))
    await expect(
      sendTemplatedEmail({ templateId: 'tpl-001', recipientEmail: 'x@y.com', mergeFieldValues: {} })
    ).rejects.toThrow('Email template is inactive')
  })

  test('includes variable attachment S3 key in attachmentKeys record', async () => {
    // Set env var so getBucket() does not throw
    const origBucket = process.env['AWS_S3_BUCKET']
    process.env['AWS_S3_BUCKET'] = 'test-bucket'

    try {
      const tpl = makeTemplate({ fixedAttachmentIds: [] })
      ;(mockPrisma.notifEmailTemplate.findUnique as jest.Mock).mockResolvedValueOnce(tpl)
      ;(mockPrisma.docDocument.findMany as jest.Mock).mockResolvedValueOnce([])

      // S3 download returns a buffer
      mockS3Download(Buffer.from('PDF content here'))

      mockSendSesEmail.mockResolvedValueOnce({ messageId: 'ses-002' })
      ;(mockPrisma.notifSentEmail.create as jest.Mock).mockResolvedValueOnce(
        makeSentEmail({ attachmentKeys: ['emails/attachments/report.pdf'] })
      )

      await sendTemplatedEmail({
        templateId: 'tpl-001',
        recipientEmail: 'jane@example.com',
        mergeFieldValues: {},
        variableAttachmentKey: 'emails/attachments/report.pdf',
      })

      expect(mockPrisma.notifSentEmail.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachmentKeys: expect.arrayContaining(['emails/attachments/report.pdf']),
          }),
        })
      )
    } finally {
      process.env['AWS_S3_BUCKET'] = origBucket
    }
  })
})

// ─── sendRawEmail ─────────────────────────────────────────────────────────────

describe('sendRawEmail', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('sends email without template and records NotifSentEmail', async () => {
    mockSendSesEmail.mockResolvedValueOnce({ messageId: 'ses-raw-001' })
    ;(mockPrisma.notifSentEmail.create as jest.Mock).mockResolvedValueOnce(makeSentEmail({ templateId: null }))

    const result = await sendRawEmail({
      to: 'staff@lotusassist.com.au',
      subject: 'Budget Alert',
      htmlBody: '<p>Alert body</p>',
    })

    expect(mockSendSesEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'staff@lotusassist.com.au',
        subject: 'Budget Alert',
        htmlBody: '<p>Alert body</p>',
      })
    )
    expect(mockPrisma.notifSentEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toEmail: 'staff@lotusassist.com.au',
          status: 'SENT',
        }),
      })
    )
    expect(result.status).toBe('SENT')
  })

  test('records FAILED status when SES throws on raw send', async () => {
    // Reset all mocks to clear any queued implementations from previous tests
    jest.resetAllMocks()
    mockSendSesEmail.mockRejectedValueOnce(new Error('Network error'))
    ;(mockPrisma.notifSentEmail.create as jest.Mock).mockResolvedValueOnce(
      makeSentEmail({ status: 'FAILED', errorMessage: 'Network error' })
    )

    const result = await sendRawEmail({
      to: 'staff@lotusassist.com.au',
      subject: 'Alert',
      htmlBody: '<p>Test</p>',
    })

    expect(mockPrisma.notifSentEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', errorMessage: 'Network error' }),
      })
    )
    expect(result.status).toBe('FAILED')
  })
})
