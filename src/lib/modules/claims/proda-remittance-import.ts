/**
 * PRODA Remittance CSV Import.
 * Parses NDIA remittance results and updates claim + invoice statuses.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

interface RemittanceRow {
  claimReference: string
  status: string
  approvedAmount: string
  rejectionReason: string
}

export interface ImportResult {
  approved: number
  rejected: number
  partial: number
  unmatched: number
  details: Array<{ claimReference: string; status: string; matched: boolean }>
}

function parseCSV(csv: string): RemittanceRow[] {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0]!.split(',').map((h) => h.trim())
  const refIdx = headers.indexOf('ClaimReference')
  const statusIdx = headers.indexOf('Status')
  const amountIdx = headers.indexOf('ApprovedAmount')
  const reasonIdx = headers.indexOf('RejectionReason')

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    return {
      claimReference: cols[refIdx] ?? '',
      status: cols[statusIdx] ?? '',
      approvedAmount: cols[amountIdx] ?? '0',
      rejectionReason: cols[reasonIdx] ?? '',
    }
  })
}

export async function importProdaRemittance(
  csvContent: string,
  userId: string
): Promise<ImportResult> {
  const rows = parseCSV(csvContent)
  const result: ImportResult = { approved: 0, rejected: 0, partial: 0, unmatched: 0, details: [] }

  for (const row of rows) {
    if (!row.claimReference) continue

    const claim = await prisma.clmClaim.findUnique({
      where: { claimReference: row.claimReference },
    })

    if (!claim) {
      result.unmatched++
      result.details.push({ claimReference: row.claimReference, status: row.status, matched: false })
      continue
    }

    const normalizedStatus = row.status.toLowerCase()
    let claimStatus: string

    if (normalizedStatus === 'paid' || normalizedStatus === 'approved') {
      claimStatus = 'APPROVED'
      result.approved++
    } else if (normalizedStatus === 'rejected') {
      claimStatus = 'REJECTED'
      result.rejected++
    } else {
      claimStatus = 'PARTIAL'
      result.partial++
    }

    const approvedCents = Math.round(parseFloat(row.approvedAmount) * 100)

    await prisma.clmClaim.update({
      where: { id: claim.id },
      data: {
        status: claimStatus as 'APPROVED' | 'REJECTED' | 'PARTIAL',
        approvedCents,
        outcomeAt: new Date(),
        outcomeNotes: row.rejectionReason || null,
      },
    })

    // If NDIA rejected → set rejectionSource on invoice
    if (claimStatus === 'REJECTED' && claim.invoiceId) {
      await prisma.invInvoice.update({
        where: { id: claim.invoiceId },
        data: { rejectionSource: 'NDIA_REJECTED' },
      })
    }

    await createAuditLog({
      userId,
      action: 'PRODA_REMITTANCE_IMPORTED',
      resource: 'claim',
      resourceId: claim.id,
      after: { status: claimStatus, approvedCents },
    })

    result.details.push({ claimReference: row.claimReference, status: claimStatus, matched: true })
  }

  return result
}
