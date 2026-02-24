/**
 * PM Fee Schedule CRUD — manages fee schedules and per-participant overrides.
 *
 * Fee schedules define the standard plan management fees charged to participants.
 * These are NDIS Category 14 support items (Plan Management).
 *
 * All amounts in cents (integers) — REQ: never floats for money.
 * Soft deletes where appropriate (deletedAt pattern).
 */

import { prisma } from '@/lib/db'
import type { PmFeeFrequency } from '@prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateFeeScheduleInput {
  name: string
  supportItemCode: string
  description?: string
  rateCents: number
  frequency?: PmFeeFrequency
}

export interface UpdateFeeScheduleInput {
  name?: string
  supportItemCode?: string
  description?: string
  rateCents?: number
  frequency?: PmFeeFrequency
  isActive?: boolean
}

// ─── List ────────────────────────────────────────────────────────────────────

/** List all active (non-deleted) fee schedules. */
export async function listFeeSchedules(): Promise<FeeScheduleListItem[]> {
  const schedules = await prisma.pmFeeSchedule.findMany({
    where: { deletedAt: null },
    include: {
      _count: { select: { overrides: true, charges: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return schedules.map((s) => ({
    id: s.id,
    name: s.name,
    supportItemCode: s.supportItemCode,
    description: s.description,
    rateCents: s.rateCents,
    frequency: s.frequency,
    isActive: s.isActive,
    overrideCount: s._count.overrides,
    chargeCount: s._count.charges,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }))
}

export interface FeeScheduleListItem {
  id: string
  name: string
  supportItemCode: string
  description: string | null
  rateCents: number
  frequency: PmFeeFrequency
  isActive: boolean
  overrideCount: number
  chargeCount: number
  createdAt: Date
  updatedAt: Date
}

// ─── Create ──────────────────────────────────────────────────────────────────

/** Create a new fee schedule. */
export async function createFeeSchedule(
  data: CreateFeeScheduleInput
): Promise<{ id: string }> {
  const schedule = await prisma.pmFeeSchedule.create({
    data: {
      name: data.name,
      supportItemCode: data.supportItemCode,
      description: data.description,
      rateCents: data.rateCents,
      frequency: data.frequency ?? 'MONTHLY',
    },
    select: { id: true },
  })

  return schedule
}

// ─── Update ──────────────────────────────────────────────────────────────────

/** Update an existing fee schedule. */
export async function updateFeeSchedule(
  id: string,
  data: UpdateFeeScheduleInput
): Promise<{ id: string }> {
  const existing = await prisma.pmFeeSchedule.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })

  if (!existing || existing.deletedAt) {
    throw new Error('Fee schedule not found')
  }

  await prisma.pmFeeSchedule.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.supportItemCode !== undefined && { supportItemCode: data.supportItemCode }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.rateCents !== undefined && { rateCents: data.rateCents }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })

  return { id }
}

// ─── Overrides ───────────────────────────────────────────────────────────────

/** Set or update a per-participant rate override. */
export async function setParticipantOverride(
  feeScheduleId: string,
  participantId: string,
  rateCents: number,
  notes?: string
): Promise<{ id: string }> {
  // Verify schedule exists
  const schedule = await prisma.pmFeeSchedule.findUnique({
    where: { id: feeScheduleId },
    select: { id: true, deletedAt: true },
  })
  if (!schedule || schedule.deletedAt) {
    throw new Error('Fee schedule not found')
  }

  // Upsert: create or update
  const override = await prisma.pmFeeOverride.upsert({
    where: {
      feeScheduleId_participantId: { feeScheduleId, participantId },
    },
    create: {
      feeScheduleId,
      participantId,
      rateCents,
      notes,
    },
    update: {
      rateCents,
      notes,
      deletedAt: null, // reactivate if previously soft-deleted
    },
    select: { id: true },
  })

  return override
}

/** Soft-delete a per-participant rate override. */
export async function removeParticipantOverride(
  feeScheduleId: string,
  participantId: string
): Promise<void> {
  const override = await prisma.pmFeeOverride.findUnique({
    where: {
      feeScheduleId_participantId: { feeScheduleId, participantId },
    },
    select: { id: true },
  })

  if (!override) {
    throw new Error('Override not found')
  }

  await prisma.pmFeeOverride.update({
    where: { id: override.id },
    data: { deletedAt: new Date() },
  })
}
