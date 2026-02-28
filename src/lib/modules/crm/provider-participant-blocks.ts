/**
 * Provider-Participant Block module.
 * Blocks a specific provider from billing a specific participant.
 * Auto-creates a BLOCKING CrmFlag when a block is created.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

export interface CreateBlockInput {
  participantId: string
  providerId: string
  blockAllLines: boolean
  blockedLineItems: string[]
  reason: string
}

export async function createBlock(input: CreateBlockInput, userId: string) {
  const block = await prisma.providerParticipantBlock.create({
    data: {
      participantId: input.participantId,
      providerId: input.providerId,
      blockAllLines: input.blockAllLines,
      blockedLineItems: input.blockedLineItems,
      reason: input.reason,
      createdById: userId,
    },
  })

  // Auto-create BLOCKING flag
  await prisma.crmFlag.create({
    data: {
      severity: 'BLOCKING',
      reason: `Provider blocked: ${input.reason}`,
      participantId: input.participantId,
      createdById: userId,
    },
  })

  await createAuditLog({
    userId,
    action: 'PROVIDER_PARTICIPANT_BLOCKED',
    resource: 'provider-participant-block',
    resourceId: block.id,
    after: { participantId: input.participantId, providerId: input.providerId },
  })

  return block
}

export async function getActiveBlock(participantId: string, providerId: string) {
  return prisma.providerParticipantBlock.findFirst({
    where: {
      participantId,
      providerId,
      resolvedAt: null,
    },
  })
}

export async function resolveBlock(blockId: string, userId: string, note: string) {
  const block = await prisma.providerParticipantBlock.update({
    where: { id: blockId },
    data: {
      resolvedAt: new Date(),
      resolvedById: userId,
      resolveNote: note,
    },
  })

  await createAuditLog({
    userId,
    action: 'PROVIDER_PARTICIPANT_UNBLOCKED',
    resource: 'provider-participant-block',
    resourceId: blockId,
    after: { note },
  })

  return block
}

export async function listBlocks(participantId?: string, providerId?: string) {
  return prisma.providerParticipantBlock.findMany({
    where: {
      ...(participantId ? { participantId } : {}),
      ...(providerId ? { providerId } : {}),
    },
    include: {
      participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
      provider: { select: { id: true, name: true, abn: true } },
      createdBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Check if an invoice should be blocked based on provider-participant blocks.
 * Used by validation check #12.
 */
export async function checkProviderBlocked(
  participantId: string,
  providerId: string,
  lineItemCodes: string[]
): Promise<{ blocked: boolean; reason?: string }> {
  const block = await getActiveBlock(participantId, providerId)
  if (!block) return { blocked: false }

  if (block.blockAllLines) {
    return { blocked: true, reason: block.reason }
  }

  // Check if any invoice line items are in the blocked list
  const blockedItems = lineItemCodes.filter((code) => block.blockedLineItems.includes(code))
  if (blockedItems.length > 0) {
    return {
      blocked: true,
      reason: `${block.reason} (blocked items: ${blockedItems.join(', ')})`,
    }
  }

  return { blocked: false }
}
