/**
 * TypeScript types for the Service Agreements module.
 * WS1: Service agreements linking providers to participants.
 */

export type SaStatusValue = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED'

export interface ServiceAgreement {
  id: string
  agreementRef: string
  participantId: string
  providerId: string
  startDate: Date
  endDate: Date
  reviewDate: Date | null
  status: SaStatusValue
  notes: string | null
  managedById: string
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface RateLine {
  id: string
  agreementId: string
  categoryCode: string
  categoryName: string
  supportItemCode: string | null
  supportItemName: string | null
  agreedRateCents: number
  maxQuantity: number | null
  unitType: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ServiceAgreementWithRelations extends ServiceAgreement {
  rateLines: RateLine[]
  participant: {
    id: string
    firstName: string
    lastName: string
    ndisNumber: string
  }
  provider: {
    id: string
    name: string
  }
  managedBy: {
    id: string
    name: string
  }
}

export interface ListServiceAgreementsFilters {
  participantId?: string
  providerId?: string
  status?: SaStatusValue
}
