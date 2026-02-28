/**
 * Invoice Versioning — creates a new version of an invoice when
 * providers reissue with the same number.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { recordStatusTransition } from './status-history'

export async function createNewVersion(invoiceId: string, userId: string) {
  const invoice = await prisma.invInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  })
  if (!invoice) throw new Error('Invoice not found')

  // Supersede old invoice
  await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'SUPERSEDED',
      supersededAt: new Date(),
    },
  })

  void recordStatusTransition({
    invoiceId,
    fromStatus: invoice.status,
    toStatus: 'SUPERSEDED',
    changedBy: userId,
  })

  // Create new version at RECEIVED
  const newInvoice = await prisma.invInvoice.create({
    data: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      participantId: invoice.participantId,
      providerId: invoice.providerId,
      planId: invoice.planId,
      subtotalCents: invoice.subtotalCents,
      gstCents: invoice.gstCents,
      totalCents: invoice.totalCents,
      s3Key: invoice.s3Key,
      s3Bucket: invoice.s3Bucket,
      status: 'RECEIVED',
      version: invoice.version + 1,
      ingestSource: 'MANUAL',
    },
  })

  // Link old invoice to new version
  await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: { supersededById: newInvoice.id },
  })

  await createAuditLog({
    userId,
    action: 'INVOICE_VERSION_CREATED',
    resource: 'invoice',
    resourceId: newInvoice.id,
    after: { previousVersionId: invoiceId, version: newInvoice.version },
  })

  return newInvoice
}
