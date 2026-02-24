/**
 * Event Wiring Tests
 *
 * Verifies that:
 *   1. participant-approval.ts calls processEvent with correctly-prefixed event names
 *      (lotus-pm.invoices.*) rather than bare names (invoices.*)
 *   2. The budget alert threshold logic in invoices.ts fires at >= 80% utilisation
 *      and does not fire below 80%.
 */

// ── Mocks for participant-approval tests ──────────────────────────────────────

jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notifEmailTemplate: {
      findFirst: jest.fn(),
    },
    notifNotification: {
      create: jest.fn(),
    },
    planBudgetLine: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/modules/notifications/notifications', () => ({
  createNotificationRecord: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  sendSmsToStaffByRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/notifications/email-send', () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({ id: 'sent-1' }),
}))

jest.mock('@/lib/modules/invoices/status-history', () => ({
  recordStatusTransition: jest.fn().mockResolvedValue(undefined),
  recordInvoiceCreated: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/invoices/invoice-validation', () => ({
  validateInvoiceForApproval: jest.fn().mockResolvedValue({ errors: [], warnings: [] }),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db'
import { processEvent } from '@/lib/modules/automation/engine'
import {
  requestParticipantApproval,
  processApprovalResponse,
  skipExpiredApprovals,
} from '@/lib/modules/invoices/participant-approval'
import { approveInvoice } from '@/lib/modules/invoices/invoices'

// ── Casts ─────────────────────────────────────────────────────────────────────

const mockInvoice = prisma.invInvoice as jest.Mocked<typeof prisma.invInvoice>
const mockEmailTemplate = prisma.notifEmailTemplate as jest.Mocked<typeof prisma.notifEmailTemplate>
const mockBudgetLine = prisma.planBudgetLine as jest.Mocked<typeof prisma.planBudgetLine>
const mockProcessEvent = processEvent as jest.MockedFunction<typeof processEvent>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PARTICIPANT_ID = 'part-001'
const INVOICE_ID = 'inv-001'
const USER_ID = 'user-001'

function makeParticipant(overrides: Partial<{
  invoiceApprovalEnabled: boolean
  invoiceApprovalMethod: 'APP' | 'EMAIL' | 'SMS' | null
  email: string | null
  phone: string | null
}> = {}) {
  return {
    id: PARTICIPANT_ID,
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '+61400000000',
    invoiceApprovalEnabled: true,
    invoiceApprovalMethod: 'APP' as const,
    ...overrides,
  }
}

function makeFullInvoice(overrides: Partial<{
  status: string
  participantId: string | null
  approvalTokenHash: string | null
  approvalTokenExpiresAt: Date | null
}> = {}) {
  return {
    id: INVOICE_ID,
    participantId: PARTICIPANT_ID,
    totalCents: 15000,
    invoiceDate: new Date('2026-02-01'),
    invoiceNumber: 'INV-001',
    status: 'PENDING_REVIEW',
    participant: makeParticipant(),
    provider: { id: 'prov-1', name: 'Allied Health Co' },
    approvalTokenHash: null,
    approvalTokenExpiresAt: null,
    deletedAt: null,
    ...overrides,
  }
}

// ── Section 1: Participant Approval Event Name Tests ──────────────────────────

describe('participant-approval event name wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEmailTemplate.findFirst.mockResolvedValue(null)
  })

  describe('requestParticipantApproval', () => {
    it('emits lotus-pm.invoices.approval-requested (with full prefix)', async () => {
      const invoice = makeFullInvoice()
      mockInvoice.findFirst.mockResolvedValue(invoice as never)
      mockInvoice.update.mockResolvedValue({ ...invoice, status: 'PENDING_PARTICIPANT_APPROVAL' } as never)

      await requestParticipantApproval(INVOICE_ID, USER_ID)

      expect(mockProcessEvent).toHaveBeenCalledWith(
        'lotus-pm.invoices.approval-requested',
        expect.objectContaining({ invoiceId: INVOICE_ID, participantId: PARTICIPANT_ID })
      )
    })

    it('does NOT emit bare invoices.approval-requested (without prefix)', async () => {
      const invoice = makeFullInvoice()
      mockInvoice.findFirst.mockResolvedValue(invoice as never)
      mockInvoice.update.mockResolvedValue({ ...invoice, status: 'PENDING_PARTICIPANT_APPROVAL' } as never)

      await requestParticipantApproval(INVOICE_ID, USER_ID)

      const calledEventNames = mockProcessEvent.mock.calls.map((call) => call[0])
      expect(calledEventNames).not.toContain('invoices.approval-requested')
    })
  })

  describe('processApprovalResponse — APPROVED', () => {
    it('emits lotus-pm.invoices.participant-approved', async () => {
      // Build a valid token
      const { generateApprovalToken, hashToken } = await import('./../../modules/invoices/participant-approval')
      const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
      const tokenHash = hashToken(token)

      const invoice = makeFullInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: tokenHash,
        approvalTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      })
      mockInvoice.findFirst.mockResolvedValue(invoice as never)
      mockInvoice.update.mockResolvedValue({ ...invoice, status: 'APPROVED' } as never)

      await processApprovalResponse(token, 'APPROVED')

      expect(mockProcessEvent).toHaveBeenCalledWith(
        'lotus-pm.invoices.participant-approved',
        expect.objectContaining({ invoiceId: INVOICE_ID, participantId: PARTICIPANT_ID })
      )
    })

    it('does NOT emit bare invoices.participant-approved', async () => {
      const { generateApprovalToken, hashToken } = await import('./../../modules/invoices/participant-approval')
      const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
      const tokenHash = hashToken(token)

      const invoice = makeFullInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: tokenHash,
        approvalTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      })
      mockInvoice.findFirst.mockResolvedValue(invoice as never)
      mockInvoice.update.mockResolvedValue({ ...invoice, status: 'APPROVED' } as never)

      await processApprovalResponse(token, 'APPROVED')

      const calledEventNames = mockProcessEvent.mock.calls.map((call) => call[0])
      expect(calledEventNames).not.toContain('invoices.participant-approved')
    })
  })

  describe('processApprovalResponse — REJECTED', () => {
    it('emits lotus-pm.invoices.participant-rejected', async () => {
      const { generateApprovalToken, hashToken } = await import('./../../modules/invoices/participant-approval')
      const token = generateApprovalToken(INVOICE_ID, PARTICIPANT_ID)
      const tokenHash = hashToken(token)

      const invoice = makeFullInvoice({
        status: 'PENDING_PARTICIPANT_APPROVAL',
        approvalTokenHash: tokenHash,
        approvalTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      })
      mockInvoice.findFirst.mockResolvedValue(invoice as never)
      mockInvoice.update.mockResolvedValue({ ...invoice, status: 'PENDING_REVIEW' } as never)

      await processApprovalResponse(token, 'REJECTED')

      expect(mockProcessEvent).toHaveBeenCalledWith(
        'lotus-pm.invoices.participant-rejected',
        expect.objectContaining({ invoiceId: INVOICE_ID, participantId: PARTICIPANT_ID })
      )
    })
  })

  describe('skipExpiredApprovals', () => {
    it('emits lotus-pm.invoices.approval-skipped for each expired invoice', async () => {
      const expiredInvoices = [
        { id: 'inv-exp-1', participantId: 'part-a' },
        { id: 'inv-exp-2', participantId: 'part-b' },
      ]
      mockInvoice.findMany.mockResolvedValue(expiredInvoices as never)
      mockInvoice.updateMany.mockResolvedValue({ count: 2 })

      await skipExpiredApprovals()

      expect(mockProcessEvent).toHaveBeenCalledWith(
        'lotus-pm.invoices.approval-skipped',
        expect.objectContaining({ invoiceId: 'inv-exp-1', participantId: 'part-a' })
      )
      expect(mockProcessEvent).toHaveBeenCalledWith(
        'lotus-pm.invoices.approval-skipped',
        expect.objectContaining({ invoiceId: 'inv-exp-2', participantId: 'part-b' })
      )
    })

    it('does NOT emit bare invoices.approval-skipped', async () => {
      const expiredInvoices = [{ id: 'inv-exp-1', participantId: 'part-a' }]
      mockInvoice.findMany.mockResolvedValue(expiredInvoices as never)
      mockInvoice.updateMany.mockResolvedValue({ count: 1 })

      await skipExpiredApprovals()

      const calledEventNames = mockProcessEvent.mock.calls.map((call) => call[0])
      expect(calledEventNames).not.toContain('invoices.approval-skipped')
    })

    it('returns 0 and emits no events when no expired invoices', async () => {
      mockInvoice.findMany.mockResolvedValue([])

      const count = await skipExpiredApprovals()

      expect(count).toBe(0)
      expect(mockProcessEvent).not.toHaveBeenCalledWith(
        'lotus-pm.invoices.approval-skipped',
        expect.anything()
      )
    })
  })
})

// ── Section 2: Budget Alert Threshold Logic ───────────────────────────────────

describe('budget alert threshold logic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Build a minimal approved invoice with one line attached to a budget line.
   * spentCents: current spent before this invoice
   * allocatedCents: total allocated
   * amountCents: amount being added by this approval
   */
  function makeBudgetLineInvoice(
    spentCents: number,
    allocatedCents: number,
    amountCents: number
  ) {
    const budgetLine = {
      id: 'bl-001',
      planId: 'plan-001',
      categoryCode: '01',
      categoryName: 'Daily Activities',
      allocatedCents,
      spentCents,
      reservedCents: 0,
    }

    const lines = [
      {
        id: 'line-001',
        budgetLineId: 'bl-001',
        totalCents: amountCents,
        budgetLine,
      },
    ]

    const invoice = {
      id: INVOICE_ID,
      participantId: PARTICIPANT_ID,
      totalCents: amountCents,
      invoiceNumber: 'INV-TEST',
      invoiceDate: new Date('2026-02-01'),
      status: 'APPROVED',
      approvedById: USER_ID,
      approvedAt: new Date(),
      lines,
    }

    return invoice
  }

  function setupApproveInvoiceMocks(
    spentCents: number,
    allocatedCents: number,
    amountCents: number
  ) {
    const invoice = makeBudgetLineInvoice(spentCents, allocatedCents, amountCents)
    mockInvoice.findFirst.mockResolvedValue({ status: 'PENDING_REVIEW' } as never)
    mockInvoice.update.mockResolvedValue(invoice as never)
    mockBudgetLine.update.mockResolvedValue({} as never)
  }

  it('does NOT emit budget-alert when usage is below 80%', async () => {
    // 100 total, 50 spent, 20 being added → 70% used
    setupApproveInvoiceMocks(50_00, 100_00, 20_00)

    await approveInvoice(INVOICE_ID, USER_ID)

    const budgetAlertCalls = mockProcessEvent.mock.calls.filter(
      (call) => call[0] === 'lotus-pm.plans.budget-alert'
    )
    expect(budgetAlertCalls).toHaveLength(0)
  })

  it('emits budget-alert when usage reaches exactly 80%', async () => {
    // 100 total, 60 spent, 20 being added → 80% used
    setupApproveInvoiceMocks(60_00, 100_00, 20_00)

    await approveInvoice(INVOICE_ID, USER_ID)

    const budgetAlertCalls = mockProcessEvent.mock.calls.filter(
      (call) => call[0] === 'lotus-pm.plans.budget-alert'
    )
    expect(budgetAlertCalls).toHaveLength(1)
    expect(budgetAlertCalls[0]?.[1]).toMatchObject({
      participantId: PARTICIPANT_ID,
      planId: 'plan-001',
      categoryCode: '01',
      usedPercent: 80,
    })
  })

  it('emits budget-alert when usage exceeds 80%', async () => {
    // 100 total, 70 spent, 25 being added → 95% used
    setupApproveInvoiceMocks(70_00, 100_00, 25_00)

    await approveInvoice(INVOICE_ID, USER_ID)

    const budgetAlertCalls = mockProcessEvent.mock.calls.filter(
      (call) => call[0] === 'lotus-pm.plans.budget-alert'
    )
    expect(budgetAlertCalls).toHaveLength(1)
    expect(budgetAlertCalls[0]?.[1]).toMatchObject({
      usedPercent: 95,
    })
  })

  it('emits budget-alert at 100% (full budget consumed)', async () => {
    // 100 total, 80 spent, 20 being added → 100% used
    setupApproveInvoiceMocks(80_00, 100_00, 20_00)

    await approveInvoice(INVOICE_ID, USER_ID)

    const budgetAlertCalls = mockProcessEvent.mock.calls.filter(
      (call) => call[0] === 'lotus-pm.plans.budget-alert'
    )
    expect(budgetAlertCalls).toHaveLength(1)
    expect(budgetAlertCalls[0]?.[1]).toMatchObject({
      usedPercent: 100,
    })
  })

  it('does NOT emit budget-alert at 79% (one cent below threshold boundary)', async () => {
    // 10000 total, 7800 spent, 100 being added → 79% used
    setupApproveInvoiceMocks(7800, 10000, 100)

    await approveInvoice(INVOICE_ID, USER_ID)

    const budgetAlertCalls = mockProcessEvent.mock.calls.filter(
      (call) => call[0] === 'lotus-pm.plans.budget-alert'
    )
    expect(budgetAlertCalls).toHaveLength(0)
  })

  it('includes correct spentCents (after-increment value) in the event context', async () => {
    // 100 total, 70 spent, 20 being added → 90% used; spentCents = 90
    setupApproveInvoiceMocks(70, 100, 20)

    await approveInvoice(INVOICE_ID, USER_ID)

    const budgetAlertCalls = mockProcessEvent.mock.calls.filter(
      (call) => call[0] === 'lotus-pm.plans.budget-alert'
    )
    expect(budgetAlertCalls).toHaveLength(1)
    expect(budgetAlertCalls[0]?.[1]).toMatchObject({
      spentCents: 90,
      allocatedCents: 100,
    })
  })
})
