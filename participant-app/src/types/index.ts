/**
 * Shared types for the Lotus PM Participant App.
 * REQ-018: Separate participant-facing mobile app.
 * Types mirror the backend API response shapes exactly.
 */

export interface Participant {
  id: string
  firstName: string
  lastName: string
  ndisNumber: string
}

export interface BudgetLine {
  id: string
  categoryCode: string
  categoryName: string
  allocatedCents: number
  spentCents: number
  reservedCents: number
  availableCents: number
  usedPercent: number
}

export interface Plan {
  id: string
  startDate: string
  endDate: string
  reviewDate: string | null
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNDER_REVIEW' | 'INACTIVE'
  budgetLines: BudgetLine[]
}

export interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  receivedAt: string
  totalCents: number
  status:
    | 'RECEIVED'
    | 'PROCESSING'
    | 'PENDING_REVIEW'
    | 'PENDING_PARTICIPANT_APPROVAL'
    | 'APPROVED'
    | 'REJECTED'
    | 'CLAIMED'
    | 'PAID'
  provider: {
    name: string
  }
}

export interface CommLog {
  id: string
  type: 'EMAIL' | 'PHONE' | 'SMS' | 'IN_PERSON' | 'PORTAL_MESSAGE' | 'NOTE'
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL'
  subject: string
  body: string | null
  createdAt: string
}

export interface Document {
  id: string
  name: string
  description: string | null
  mimeType: string
  sizeBytes: number
  version: number
  createdAt: string
}

export interface ParticipantProfile {
  id: string
  firstName: string
  lastName: string
  ndisNumber: string
  email: string | null
  phone: string | null
  planManager: {
    name: string
    email: string | null
    phone: string | null
  } | null
}

export interface AuthSession {
  userId: string
  participantId: string
  name: string
  ndisNumber: string
  token: string
}
