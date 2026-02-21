/**
 * CRM Correspondence Module
 *
 * Unified per-client communication timeline.
 * Covers inbound/outbound emails, SMS, phone calls, and manual notes.
 *
 * REQ-017: No PII in audit logs.
 * REQ-024: Email ingestion creates EMAIL_INBOUND entries automatically.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { CorrespondenceType, Prisma } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListCorrespondenceFilters {
  participantId?: string
  providerId?: string
  invoiceId?: string
  type?: CorrespondenceType
  page?: number
  pageSize?: number
}

export interface CreateCorrespondenceInput {
  type: CorrespondenceType
  subject?: string
  body: string
  fromAddress?: string
  toAddress?: string
  participantId?: string
  providerId?: string
  invoiceId?: string
  documentId?: string
  metadata?: Record<string, unknown>
}

export interface CreateFromEmailIngestInput {
  invoiceId: string
  fromAddress: string
  subject: string
  body: string
  metadata?: Record<string, unknown>
}

// ── Module functions ───────────────────────────────────────────────────────────

/**
 * List correspondence entries with optional filters.
 * Results are ordered chronologically descending (most recent first).
 */
export async function listCorrespondence(filters: ListCorrespondenceFilters) {
  const { participantId, providerId, invoiceId, type, page = 1, pageSize = 50 } = filters

  const where: Prisma.CrmCorrespondenceWhereInput = {
    ...(participantId ? { participantId } : {}),
    ...(providerId ? { providerId } : {}),
    ...(invoiceId ? { invoiceId } : {}),
    ...(type ? { type } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.crmCorrespondence.findMany({
      where,
      include: {
        participant: {
          select: { id: true, firstName: true, lastName: true, ndisNumber: true },
        },
        provider: {
          select: { id: true, name: true, abn: true },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, totalCents: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.crmCorrespondence.count({ where }),
  ])

  return { data, total }
}

/**
 * Get a single correspondence entry by ID.
 */
export async function getCorrespondence(id: string) {
  return prisma.crmCorrespondence.findUnique({
    where: { id },
    include: {
      participant: {
        select: { id: true, firstName: true, lastName: true, ndisNumber: true },
      },
      provider: {
        select: { id: true, name: true, abn: true },
      },
      invoice: {
        select: { id: true, invoiceNumber: true, totalCents: true },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  })
}

/**
 * Create a manual correspondence entry (NOTE, PHONE_CALL, etc.) logged by a staff member.
 */
export async function createCorrespondence(
  input: CreateCorrespondenceInput,
  createdById: string
) {
  const entry = await prisma.crmCorrespondence.create({
    data: {
      type: input.type,
      subject: input.subject,
      body: input.body,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      participantId: input.participantId,
      providerId: input.providerId,
      invoiceId: input.invoiceId,
      documentId: input.documentId,
      createdById,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  })

  // REQ-017: Audit log — no PII in the log
  await createAuditLog({
    userId: createdById,
    action: 'correspondence.created',
    resource: 'correspondence',
    resourceId: entry.id,
    after: {
      type: entry.type,
      participantId: entry.participantId,
      providerId: entry.providerId,
      invoiceId: entry.invoiceId,
    },
  })

  return entry
}

/**
 * Auto-create an EMAIL_INBOUND correspondence entry when an email invoice is ingested.
 * Called from src/lib/modules/invoices/email-ingest.ts after the draft invoice is created.
 *
 * Participant and provider are NOT linked yet — they are resolved during triage.
 */
export async function createFromEmailIngest(input: CreateFromEmailIngestInput) {
  const MAX_BODY_CHARS = 5000

  return prisma.crmCorrespondence.create({
    data: {
      type: 'EMAIL_INBOUND',
      subject: input.subject || undefined,
      body: input.body.slice(0, MAX_BODY_CHARS),
      fromAddress: input.fromAddress || undefined,
      invoiceId: input.invoiceId,
      // participantId / providerId left null — set during triage
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}

/**
 * Update an existing correspondence entry to link a participant or provider.
 * Called when a PM matches participant/provider during invoice triage.
 */
export async function linkCorrespondenceToParticipant(
  correspondenceId: string,
  participantId: string
) {
  return prisma.crmCorrespondence.update({
    where: { id: correspondenceId },
    data: { participantId },
  })
}

/**
 * Update an existing correspondence entry to link a provider.
 */
export async function linkCorrespondenceToProvider(
  correspondenceId: string,
  providerId: string
) {
  return prisma.crmCorrespondence.update({
    where: { id: correspondenceId },
    data: { providerId },
  })
}
