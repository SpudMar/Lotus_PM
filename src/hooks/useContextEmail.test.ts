import { invoiceToProviderEmail, invoiceToParticipantEmail, planToParticipantEmail, saToProviderEmail, claimToProviderEmail } from './useContextEmail'

describe('email template helpers', () => {
  describe('invoiceToProviderEmail', () => {
    it('generates correct email for provider', () => {
      const result = invoiceToProviderEmail({
        invoiceNumber: 'INV-100',
        totalCents: 15000,
        status: 'APPROVED',
        participant: { firstName: 'Jane', lastName: 'Smith' },
        provider: { name: 'Allied Health Co', email: 'admin@allied.com' },
      })
      expect(result.recipientEmail).toBe('admin@allied.com')
      expect(result.recipientName).toBe('Allied Health Co')
      expect(result.subject).toBe('Re: Invoice INV-100')
      expect(result.body).toContain('$150.00')
    })

    it('handles missing provider email', () => {
      const result = invoiceToProviderEmail({
        invoiceNumber: 'INV-100',
        totalCents: 15000,
        status: 'APPROVED',
        provider: { name: 'Allied', email: null },
      })
      expect(result.recipientEmail).toBeUndefined()
    })
  })

  describe('invoiceToParticipantEmail', () => {
    it('generates correct email for participant', () => {
      const result = invoiceToParticipantEmail({
        invoiceNumber: 'INV-100',
        totalCents: 15000,
        status: 'APPROVED',
        provider: { name: 'Allied' },
        participant: { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      })
      expect(result.recipientEmail).toBe('jane@example.com')
      expect(result.subject).toContain('Allied')
    })
  })

  describe('planToParticipantEmail', () => {
    it('generates correct email', () => {
      const result = planToParticipantEmail({
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        status: 'ACTIVE',
        participant: { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      })
      expect(result.subject).toContain('Plan Update')
      expect(result.body).toContain('2026-01-01')
    })
  })

  describe('saToProviderEmail', () => {
    it('generates correct email', () => {
      const result = saToProviderEmail({
        agreementRef: 'SA-001',
        provider: { name: 'Allied', email: 'admin@allied.com' },
        participant: { firstName: 'Jane', lastName: 'Smith' },
      })
      expect(result.subject).toContain('Service Agreement')
      expect(result.body).toContain('SA-001')
    })
  })

  describe('claimToProviderEmail', () => {
    it('generates correct email', () => {
      const result = claimToProviderEmail({
        claimReference: 'CLM-2026-0001',
        status: 'SUBMITTED',
        claimedCents: 25000,
        provider: { name: 'Allied', email: 'admin@allied.com' },
      })
      expect(result.subject).toContain('CLM-2026-0001')
      expect(result.body).toContain('$250.00')
    })
  })
})
