import { z } from 'zod'

export const DOC_CATEGORIES = [
  'SERVICE_AGREEMENT',
  'PLAN_LETTER',
  'INVOICE',
  'ASSESSMENT',
  'CORRESPONDENCE',
  'OTHER',
] as const

export const docCategorySchema = z.enum(DOC_CATEGORIES)

export const createDocumentSchema = z.object({
  participantId: z.string().cuid().optional(),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
  category: docCategorySchema.default('OTHER'),
  mimeType: z.string().min(1, 'MIME type is required').max(100),
  sizeBytes: z.number().int().positive('File size must be positive'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
})

export const listDocumentsSchema = z.object({
  participantId: z.string().cuid().optional(),
  category: docCategorySchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
})

export const generateUploadUrlSchema = z.object({
  participantId: z.string().cuid().optional(),
  filename: z.string().min(1, 'Filename is required').max(255),
  mimeType: z.string().min(1, 'MIME type is required').max(100),
  sizeBytes: z.number().int().positive('File size must be positive'),
})

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>
export type GenerateUploadUrlInput = z.infer<typeof generateUploadUrlSchema>
