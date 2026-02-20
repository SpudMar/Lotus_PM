import { z } from 'zod'

export const createDocumentSchema = z.object({
  participantId: z.string().cuid().optional(),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
  mimeType: z.string().min(1, 'MIME type is required').max(100),
  sizeBytes: z.number().int().positive('File size must be positive'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
})

export const listDocumentsSchema = z.object({
  participantId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
})

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>
