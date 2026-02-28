/**
 * Approved Supports module (Holly's feature).
 * Per-participant, per-category controls for which support items are allowed.
 * Default mode = everything allowed. Restricted mode = only ticked items pass.
 */

import { prisma } from '@/lib/db'

export async function checkSupportApproved(
  participantId: string,
  categoryCode: string,
  supportItemCode: string
): Promise<{ approved: boolean; reason?: string }> {
  const rule = await prisma.participantApprovedSupport.findUnique({
    where: { participantId_categoryCode: { participantId, categoryCode } },
  })

  // No rule = default = all allowed
  if (!rule) return { approved: true }

  // Not restricted = all allowed
  if (!rule.restrictedMode) return { approved: true }

  // Restricted: check allowed list
  if (rule.allowedItemCodes.includes(supportItemCode)) {
    return { approved: true }
  }

  return {
    approved: false,
    reason: `Support item ${supportItemCode} is not in the approved list for category ${categoryCode}`,
  }
}

export async function updateApprovedSupports(
  participantId: string,
  categoryCode: string,
  restrictedMode: boolean,
  allowedItemCodes: string[],
  userId: string
) {
  return prisma.participantApprovedSupport.upsert({
    where: { participantId_categoryCode: { participantId, categoryCode } },
    create: {
      participantId,
      categoryCode,
      restrictedMode,
      allowedItemCodes,
      createdById: userId,
    },
    update: {
      restrictedMode,
      allowedItemCodes,
    },
  })
}

export async function getApprovedSupports(participantId: string) {
  return prisma.participantApprovedSupport.findMany({
    where: { participantId },
    orderBy: { categoryCode: 'asc' },
  })
}
