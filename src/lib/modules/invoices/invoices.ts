import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type { z } from 'zod'
import type { createInvoiceSchema } from './validation'

type CreateInput = z.infer<typeof createInvoiceSchema>

export async function listInvoices(params: {
  page: number
  pageSize: number
  status?: string
  participantId?: string
  providerId?: string
}) {
  const { page, pageSize, status, participantId, providerId } = params
  const where = {
    deletedAt: null,
    ...(status ? { status: status as 'RECEIVED' | 'APPROVED' } : {}),
    ...(participantId ? { participantId } : {}),
    ...(providerId ? { providerId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.invInvoice.findMany({
      where,
      include: {
        participant: { select: { id: true, firstName: true, lastName: true, ndisNumber: true } },
        provider: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invInvoice.count({ where }),
  ])

  return { data, total }
}

export async function getInvoice(id: string) {
  return prisma.invInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      participant: true,
      provider: true,
      plan: { include: { budgetLines: true } },
      lines: { include: { budgetLine: true } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      claims: true,
    },
  })
}

export async function createInvoice(input: CreateInput, userId: string) {
  const invoice = await prisma.invInvoice.create({
    data: {
      participantId: input.participantId,
      providerId: input.providerId,
      planId: input.planId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: new Date(input.invoiceDate),
      subtotalCents: input.subtotalCents,
      gstCents: input.gstCents,
      totalCents: input.totalCents,
      lines: input.lines
        ? {
            create: input.lines.map((line) => ({
              supportItemCode: line.supportItemCode,
              supportItemName: line.supportItemName,
              categoryCode: line.categoryCode,
              serviceDate: new Date(line.serviceDate),
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              totalCents: line.totalCents,
              gstCents: line.gstCents,
              budgetLineId: line.budgetLineId,
            })),
          }
        : undefined,
    },
    include: { lines: true },
  })

  await createAuditLog({
    userId,
    action: 'invoice.created',
    resource: 'invoice',
    resourceId: invoice.id,
    after: { invoiceNumber: invoice.invoiceNumber, totalCents: invoice.totalCents },
  })

  return invoice
}

export async function approveInvoice(id: string, userId: string, planId?: string) {
  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      planId: planId ?? undefined,
    },
  })

  await createAuditLog({
    userId,
    action: 'invoice.approved',
    resource: 'invoice',
    resourceId: id,
    after: { status: 'APPROVED' },
  })

  return invoice
}

export async function rejectInvoice(id: string, userId: string, reason: string) {
  const invoice = await prisma.invInvoice.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectedById: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  })

  await createAuditLog({
    userId,
    action: 'invoice.rejected',
    resource: 'invoice',
    resourceId: id,
    after: { status: 'REJECTED', reason },
  })

  return invoice
}

/** Get counts by status for dashboard */
export async function getInvoiceStatusCounts() {
  const counts = await prisma.invInvoice.groupBy({
    by: ['status'],
    where: { deletedAt: null },
    _count: true,
  })

  return Object.fromEntries(counts.map((c) => [c.status, c._count]))
}
