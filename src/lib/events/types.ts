/**
 * EventBridge event type definitions for Lotus PM.
 * Modules communicate ONLY via events — never by importing each other's internals.
 * Bus name: lotus-pm-events
 * Naming: lotus-pm.<module>.<action>
 */

export type LotusEvent =
  | InvoiceReceivedEvent
  | InvoiceEmailReceivedEvent
  | InvoiceExtractionCompleteEvent
  | InvoiceApprovedEvent
  | InvoiceRejectedEvent
  | ClaimSubmittedEvent
  | ClaimOutcomeReceivedEvent
  | PaymentProcessedEvent
  | BudgetAlertEvent
  | PlanReviewDueEvent
  | ParticipantCreatedEvent
  | ServiceAgreementCreatedEvent
  | ServiceAgreementActivatedEvent
  | ServiceAgreementTerminatedEvent

interface BaseEvent {
  eventBusName: 'lotus-pm-events'
  source: string
  time: string
}

export interface InvoiceReceivedEvent extends BaseEvent {
  source: 'lotus-pm.invoices'
  detailType: 'lotus-pm.invoices.received'
  detail: {
    invoiceId: string
    providerId: string
    participantId: string
    amountCents: number
    receivedAt: string
  }
}

/** Emitted when an invoice arrives via SES inbound email — REQ-024 */
export interface InvoiceEmailReceivedEvent extends BaseEvent {
  source: 'lotus-pm.invoices'
  detailType: 'lotus-pm.invoices.email-received'
  detail: {
    invoiceId: string
    ingestSource: 'EMAIL'
    receivedAt: string
  }
}

/** Emitted when Textract extraction completes and invoice moves to PENDING_REVIEW */
export interface InvoiceExtractionCompleteEvent extends BaseEvent {
  source: 'lotus-pm.invoices'
  detailType: 'lotus-pm.invoices.extraction-complete'
  detail: {
    invoiceId: string
    confidence: number
    lineItemCount: number
    status: 'PENDING_REVIEW'
    extractedAt: string
  }
}

export interface InvoiceApprovedEvent extends BaseEvent {
  source: 'lotus-pm.invoices'
  detailType: 'lotus-pm.invoices.approved'
  detail: {
    invoiceId: string
    approvedBy: string
    approvedAt: string
    amountCents: number
  }
}

export interface InvoiceRejectedEvent extends BaseEvent {
  source: 'lotus-pm.invoices'
  detailType: 'lotus-pm.invoices.rejected'
  detail: {
    invoiceId: string
    rejectedBy: string
    reason: string
  }
}

export interface ClaimSubmittedEvent extends BaseEvent {
  source: 'lotus-pm.claims'
  detailType: 'lotus-pm.claims.submitted'
  detail: {
    claimId: string
    invoiceId: string
    participantNdisNumber: string
    amountCents: number
    submittedAt: string
  }
}

export interface ClaimOutcomeReceivedEvent extends BaseEvent {
  source: 'lotus-pm.claims'
  detailType: 'lotus-pm.claims.outcome-received'
  detail: {
    claimId: string
    outcome: 'APPROVED' | 'REJECTED' | 'PARTIAL'
    paidAmountCents: number
    receivedAt: string
  }
}

export interface PaymentProcessedEvent extends BaseEvent {
  source: 'lotus-pm.banking'
  detailType: 'lotus-pm.banking.payment-processed'
  detail: {
    paymentId: string
    providerId: string
    amountCents: number
    abaReference: string
    processedAt: string
  }
}

export interface BudgetAlertEvent extends BaseEvent {
  source: 'lotus-pm.plans'
  detailType: 'lotus-pm.plans.budget-alert'
  detail: {
    participantId: string
    planId: string
    categoryCode: string
    usedPercent: number
    remainingCents: number
  }
}

export interface PlanReviewDueEvent extends BaseEvent {
  source: 'lotus-pm.plans'
  detailType: 'lotus-pm.plans.review-due'
  detail: {
    participantId: string
    planId: string
    reviewDate: string
    daysUntilReview: number
  }
}

export interface ParticipantCreatedEvent extends BaseEvent {
  source: 'lotus-pm.crm'
  detailType: 'lotus-pm.crm.participant-created'
  detail: {
    participantId: string
    ndisNumber: string
    createdAt: string
  }
}

export interface ServiceAgreementCreatedEvent extends BaseEvent {
  source: 'lotus-pm.service-agreements'
  detailType: 'lotus-pm.service-agreements.created'
  detail: {
    agreementId: string
    agreementRef: string
    participantId: string
    providerId: string
    createdAt: string
  }
}

export interface ServiceAgreementActivatedEvent extends BaseEvent {
  source: 'lotus-pm.service-agreements'
  detailType: 'lotus-pm.service-agreements.activated'
  detail: {
    agreementId: string
    agreementRef: string
    participantId: string
    providerId: string
    activatedAt: string
  }
}

export interface ServiceAgreementTerminatedEvent extends BaseEvent {
  source: 'lotus-pm.service-agreements'
  detailType: 'lotus-pm.service-agreements.terminated'
  detail: {
    agreementId: string
    agreementRef: string
    participantId: string
    providerId: string
    terminatedAt: string
  }
}
