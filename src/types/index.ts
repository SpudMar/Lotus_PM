/**
 * Shared TypeScript types for Lotus PM.
 * Module-specific types live in src/lib/modules/<module>/types.ts
 */

export type { Role, Permission } from '@/lib/auth/rbac'

/** Standard API success response */
export interface ApiSuccess<T> {
  data: T
  message?: string
}

/** Standard API error response */
export interface ApiError {
  error: string
  code: string
  details?: unknown
}

/** Pagination params */
export interface PaginationParams {
  page: number
  pageSize: number
}

/** Paginated response */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Audit log entry shape */
export interface AuditEntry {
  userId: string
  action: string
  resource: string
  resourceId: string
  before?: unknown
  after?: unknown
  ipAddress?: string
  timestamp: Date
}

/** Invoice status values */
export type InvoiceStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLAIMED'
  | 'PAID'

/** Claim status values */
export type ClaimStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PARTIAL'
  | 'PAID'

/** Plan status values */
export type PlanStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'UNDER_REVIEW'
  | 'INACTIVE'
