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

export const CreateCoordinatorSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  password: z.string().min(8).max(72),
})

export const UpdateCoordinatorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(20).optional().nullable(),
})

export type CreateCoordinatorInput = z.infer<typeof CreateCoordinatorSchema>
export type UpdateCoordinatorInput = z.infer<typeof UpdateCoordinatorSchema>
