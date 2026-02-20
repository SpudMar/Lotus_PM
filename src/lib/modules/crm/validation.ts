import { z } from 'zod'
import { isValidNdisNumber, isValidABN } from '@/lib/shared/ndis'

export const createParticipantSchema = z.object({
  ndisNumber: z.string().refine(isValidNdisNumber, 'Invalid NDIS number (must be 9 digits)'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.coerce.date(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  suburb: z.string().max(100).optional(),
  state: z.enum(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']).optional(),
  postcode: z.string().regex(/^\d{4}$/, 'Must be 4 digits').optional(),
  assignedToId: z.string().cuid().optional(),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRel: z.string().max(50).optional(),
})

export const updateParticipantSchema = createParticipantSchema.partial()

export const createProviderSchema = z.object({
  name: z.string().min(1, 'Provider name is required').max(200),
  abn: z.string().refine(isValidABN, 'Invalid ABN'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  ndisRegistered: z.boolean().default(true),
  registrationNo: z.string().max(50).optional(),
  bankBsb: z.string().regex(/^\d{6}$/, 'BSB must be 6 digits').optional(),
  bankAccount: z.string().max(10).optional(),
  bankAccountName: z.string().max(100).optional(),
})

export const updateProviderSchema = createProviderSchema.partial()

export const createCommLogSchema = z.object({
  type: z.enum(['EMAIL', 'PHONE', 'SMS', 'IN_PERSON', 'PORTAL_MESSAGE', 'NOTE']),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']).default('OUTBOUND'),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, 'Message body is required'),
  participantId: z.string().cuid().optional(),
  providerId: z.string().cuid().optional(),
  occurredAt: z.coerce.date().optional(),
})
