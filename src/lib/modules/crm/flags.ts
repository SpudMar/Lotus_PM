/**
 * Flag/Hold module — WS-F3
 * Any authenticated role can create a flag.
 * Only PLAN_MANAGER+ can resolve a flag.
 * REQ-017: Full audit logging on create and resolve.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { FlagSeverity, type CrmFlag, type Prisma } from '@prisma/client'

export { FlagSeverity }

// ── Re-export Prisma type so callers don't need to import from @prisma/client ──
export type { CrmFlag }

// ── Enriched flag type (includes joined user info) ────────────────────────────

export type FlagWithUsers = CrmFlag & {
  createdBy: { id: string; name: string }
  resolvedBy: { id: string; name: string } | null
}

export type ActiveFlag = CrmFlag & {
  createdBy: { id: string; name: string }
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateFlagInput {
  severity: FlagSeverity
  reason: string
  participantId?: string
  providerId?: string
}

export interface ListFlagsFilters {
  participantId?: string
  providerId?: string
  includeResolved?: boolean
  limit?: number
  offset?: number
}

export interface GetActiveFlagsOpts {
  participantId?: string
  providerId?: string
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Create a flag on a participant or provider.
 * Exactly one of participantId or providerId must be provided.
 * Any authenticated role can call this.
 */
export async function createFlag(
  input: CreateFlagInput,
  userId: string
): Promise<CrmFlag> {
  const { severity, reason, participantId, providerId } = input

  if ((participantId == null) === (providerId == null)) {
    throw new Error('Exactly one of participantId or providerId must be provided')
  }

  const flag = await prisma.crmFlag.create({
    data: {
      severity,
      reason,
      createdById: userId,
      participantId: participantId ?? undefined,
      providerId: providerId ?? undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'flag.created',
    resource: 'flag',
    resourceId: flag.id,
    after: {
      severity,
      participantId: participantId ?? null,
      providerId: providerId ?? null,
    },
  })

  return flag
}

/**
 * List flags with optional filters.
 * Returns flags with creator and resolver user info.
 * Supports pagination via limit/offset.
 */
export async function listFlags(filters: ListFlagsFilters): Promise<{
  flags: FlagWithUsers[]
  total: number
}> {
  const {
    participantId,
    providerId,
    includeResolved = false,
    limit = 20,
    offset = 0,
  } = filters

  const where: Prisma.CrmFlagWhereInput = {
    deletedAt: null,
    ...(participantId != null ? { participantId } : {}),
    ...(providerId != null ? { providerId } : {}),
    ...(includeResolved ? {} : { resolvedAt: null }),
  }

  const [flags, total] = await Promise.all([
    prisma.crmFlag.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.crmFlag.count({ where }),
  ])

  return { flags, total }
}

/**
 * Resolve a flag.
 * Sets resolvedAt, resolvedById, and resolveNote.
 * PLAN_MANAGER+ only — caller must enforce RBAC before calling this.
 */
export async function resolveFlag(
  id: string,
  note: string,
  userId: string
): Promise<CrmFlag> {
  const flag = await prisma.crmFlag.update({
    where: { id },
    data: {
      resolvedAt: new Date(),
      resolvedById: userId,
      resolveNote: note,
    },
  })

  await createAuditLog({
    userId,
    action: 'flag.resolved',
    resource: 'flag',
    resourceId: flag.id,
    after: { resolveNote: note },
  })

  return flag
}

/**
 * Get all active (unresolved, not soft-deleted) flags for a participant and/or provider.
 * Used by the invoice approval gate.
 * If both participantId and providerId are provided, returns flags for either.
 */
export async function getActiveFlags(opts: GetActiveFlagsOpts): Promise<ActiveFlag[]> {
  const { participantId, providerId } = opts

  const orClauses: Prisma.CrmFlagWhereInput[] = []

  if (participantId != null) {
    orClauses.push({ participantId })
  }
  if (providerId != null) {
    orClauses.push({ providerId })
  }

  if (orClauses.length === 0) {
    return []
  }

  return prisma.crmFlag.findMany({
    where: {
      OR: orClauses,
      resolvedAt: null,
      deletedAt: null,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  })
}
