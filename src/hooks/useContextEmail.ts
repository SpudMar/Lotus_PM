'use client'

import { useState, useCallback } from 'react'

export interface ContextEmailState {
  open: boolean
  recipientEmail?: string
  recipientName?: string
  subject?: string
  body?: string
  participantId?: string
  providerId?: string
  coordinatorId?: string
  invoiceId?: string
  documentId?: string
  planId?: string
  serviceAgreementId?: string
}

const initialState: ContextEmailState = { open: false }

export function useContextEmail() {
  const [emailState, setEmailState] = useState<ContextEmailState>(initialState)

  const openEmail = useCallback((params: Omit<ContextEmailState, 'open'>) => {
    setEmailState({ ...params, open: true })
  }, [])

  const closeEmail = useCallback(() => {
    setEmailState(initialState)
  }, [])

  return { emailState, openEmail, closeEmail }
}

// ── Email template helpers ──────────────────────────────────────────────────

export function invoiceToProviderEmail(invoice: {
  invoiceNumber: string
  totalCents: number
  status: string
  participant?: { firstName: string; lastName: string }
  provider?: { name: string; email?: string | null }
}) {
  return {
    recipientEmail: invoice.provider?.email ?? undefined,
    recipientName: invoice.provider?.name,
    subject: `Re: Invoice ${invoice.invoiceNumber}`,
    body: `Hi ${invoice.provider?.name ?? 'Provider'},\n\nRegarding Invoice ${invoice.invoiceNumber} for ${invoice.participant?.firstName ?? ''} ${invoice.participant?.lastName ?? ''} ($${(invoice.totalCents / 100).toFixed(2)}).\n\nCurrent status: ${invoice.status}\n\n`,
  }
}

export function invoiceToParticipantEmail(invoice: {
  invoiceNumber: string
  totalCents: number
  status: string
  provider?: { name: string }
  participant?: { firstName: string; lastName: string; email?: string | null }
}) {
  return {
    recipientEmail: invoice.participant?.email ?? undefined,
    recipientName: invoice.participant ? `${invoice.participant.firstName} ${invoice.participant.lastName}` : undefined,
    subject: `Invoice Update — ${invoice.provider?.name ?? 'Provider'}`,
    body: `Hi ${invoice.participant?.firstName ?? ''},\n\nThis is regarding Invoice ${invoice.invoiceNumber} from ${invoice.provider?.name ?? 'your provider'} ($${(invoice.totalCents / 100).toFixed(2)}).\n\nCurrent status: ${invoice.status}\n\n`,
  }
}

export function planToParticipantEmail(plan: {
  startDate: string
  endDate: string
  status: string
  participant?: { firstName: string; lastName: string; email?: string | null }
}) {
  return {
    recipientEmail: plan.participant?.email ?? undefined,
    recipientName: plan.participant ? `${plan.participant.firstName} ${plan.participant.lastName}` : undefined,
    subject: `Plan Update — ${plan.startDate} to ${plan.endDate}`,
    body: `Hi ${plan.participant?.firstName ?? ''},\n\nThis is regarding your NDIS plan for the period ${plan.startDate} to ${plan.endDate}.\n\nCurrent status: ${plan.status}\n\n`,
  }
}

export function saToProviderEmail(sa: {
  agreementRef: string
  provider?: { name: string; email?: string | null }
  participant?: { firstName: string; lastName: string }
}) {
  return {
    recipientEmail: sa.provider?.email ?? undefined,
    recipientName: sa.provider?.name,
    subject: `Service Agreement — ${sa.participant?.firstName ?? ''} ${sa.participant?.lastName ?? ''}`,
    body: `Hi ${sa.provider?.name ?? 'Provider'},\n\nRegarding Service Agreement ${sa.agreementRef} for ${sa.participant?.firstName ?? ''} ${sa.participant?.lastName ?? ''}.\n\n`,
  }
}

export function claimToProviderEmail(claim: {
  claimReference: string
  status: string
  claimedCents: number
  provider?: { name: string; email?: string | null }
}) {
  return {
    recipientEmail: claim.provider?.email ?? undefined,
    recipientName: claim.provider?.name,
    subject: `Claim Status — ${claim.claimReference}`,
    body: `Hi ${claim.provider?.name ?? 'Provider'},\n\nRegarding claim ${claim.claimReference} ($${(claim.claimedCents / 100).toFixed(2)}).\n\nCurrent NDIA status: ${claim.status}\n\n`,
  }
}
