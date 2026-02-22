import { z } from 'zod'

export const AssignCoordinatorSchema = z.object({
  coordinatorId: z.string().cuid(),
  participantId: z.string().cuid(),
  organisation: z.string().max(255).optional(),
})

export const UnassignCoordinatorSchema = z.object({
  assignmentId: z.string().cuid(),
})

export type AssignCoordinatorInput = z.infer<typeof AssignCoordinatorSchema>
export type UnassignCoordinatorInput = z.infer<typeof UnassignCoordinatorSchema>
