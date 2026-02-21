/**
 * Documents module — file storage and retrieval.
 * REQ-016: Encryption at rest (enforced at S3 layer).
 * REQ-010: Data retention managed at storage level — soft deletes only.
 */

import { prisma } from '@/lib/db'
import type { DocCategory, Prisma } from '@prisma/client'
import type { CreateDocumentInput, ListDocumentsInput } from './validation'

// ─── Prisma select helpers ─────────────────────────────────────────────────

const documentWithRelations = {
  participant: {
    select: { id: true, firstName: true, lastName: true, ndisNumber: true },
  },
  uploadedBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.DocDocumentInclude

// ─── Types ─────────────────────────────────────────────────────────────────

export type DocumentWithRelations = Prisma.DocDocumentGetPayload<{
  include: typeof documentWithRelations
}>

// ─── List ─────────────────────────────────────────────────────────────────

export async function listDocuments(params: ListDocumentsInput): Promise<{
  data: DocumentWithRelations[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const { participantId, category, page, pageSize, search } = params
  const skip = (page - 1) * pageSize

  const where: Prisma.DocDocumentWhereInput = {
    deletedAt: null, // exclude soft-deleted records
    ...(participantId ? { participantId } : {}),
    ...(category ? { category } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [documents, total] = await prisma.$transaction([
    prisma.docDocument.findMany({
      where,
      include: documentWithRelations,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.docDocument.count({ where }),
  ])

  return {
    data: documents,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ─── Get by ID ─────────────────────────────────────────────────────────────

export async function getDocumentById(id: string): Promise<DocumentWithRelations | null> {
  return prisma.docDocument.findFirst({
    where: { id, deletedAt: null },
    include: documentWithRelations,
  })
}

// ─── Get by participant ────────────────────────────────────────────────────

export async function getDocumentsByParticipant(
  participantId: string,
  options: { category?: DocCategory; limit?: number } = {},
): Promise<DocumentWithRelations[]> {
  return prisma.docDocument.findMany({
    where: {
      participantId,
      deletedAt: null,
      ...(options.category ? { category: options.category } : {}),
    },
    include: documentWithRelations,
    orderBy: { createdAt: 'desc' },
    take: options.limit,
  })
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createDocument(
  input: CreateDocumentInput,
  uploadedById: string,
): Promise<DocumentWithRelations> {
  return prisma.docDocument.create({
    data: {
      ...input,
      uploadedById,
    },
    include: documentWithRelations,
  })
}

// ─── Soft delete ───────────────────────────────────────────────────────────

export async function deleteDocument(id: string): Promise<void> {
  await prisma.docDocument.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}
