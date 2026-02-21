/**
 * Documents module — file storage and retrieval.
 * REQ-016: Encryption at rest (enforced at S3 layer).
 * REQ-010: Data retention managed at storage level.
 */

import { prisma } from '@/lib/db'
import type { CreateDocumentInput, ListDocumentsInput } from './validation'

export async function listDocuments(params: ListDocumentsInput): Promise<{
  data: Awaited<ReturnType<typeof prisma.docDocument.findMany>>
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const { participantId, page, pageSize, search } = params
  const skip = (page - 1) * pageSize

  const where = {
    ...(participantId ? { participantId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [documents, total] = await prisma.$transaction([
    prisma.docDocument.findMany({
      where,
      include: {
        participant: {
          select: { firstName: true, lastName: true, ndisNumber: true },
        },
      },
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

export async function getDocument(id: string): Promise<ReturnType<typeof prisma.docDocument.findUnique>> {
  return prisma.docDocument.findUnique({
    where: { id },
    include: {
      participant: {
        select: { id: true, firstName: true, lastName: true, ndisNumber: true },
      },
    },
  })
}

export async function createDocument(
  input: CreateDocumentInput,
  uploadedById: string,
): Promise<Awaited<ReturnType<typeof prisma.docDocument.create>>> {
  return prisma.docDocument.create({
    data: {
      ...input,
      uploadedById,
    },
    include: {
      participant: {
        select: { firstName: true, lastName: true, ndisNumber: true },
      },
    },
  })
}

export async function deleteDocument(id: string): Promise<void> {
  await prisma.docDocument.delete({ where: { id } })
}
