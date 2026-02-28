/**
 * Bulk Claim CSV Export — NDIS 16-column format for PRODA upload.
 *
 * Constraints:
 *   - Filename <= 20 chars
 *   - Max 5000 rows
 *   - Date format: YYYY/MM/DD
 *   - Quantity format: NNN.NN
 *   - Hours format: HHH:MM (if unit=hour)
 */

import { prisma } from '@/lib/db'

const CSV_HEADERS = [
  'RegistrationNumber',
  'NDISNumber',
  'SupportsDeliveredFrom',
  'SupportsDeliveredTo',
  'SupportNumber',
  'ClaimReference',
  'Quantity',
  'Hours',
  'UnitPrice',
  'GSTCode',
  'AuthorisedBy',
  'ParticipantApproved',
  'InKindFundingProgram',
  'ClaimType',
  'CancellationReason',
  'ABN of Support Provider',
] as const

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

function formatQuantity(qty: number): string {
  return qty.toFixed(2)
}

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2)
}

function gstCode(gstCents: number): string {
  if (gstCents === 0) return 'P1' // GST-free
  return 'P2' // GST inclusive
}

export async function generateBulkClaimCSV(
  batchId: string,
  registrationNumber: string
): Promise<string> {
  const batch = await prisma.clmBatch.findUnique({
    where: { id: batchId },
    include: {
      claims: {
        include: {
          invoice: {
            include: {
              participant: { select: { ndisNumber: true } },
              provider: { select: { abn: true } },
            },
          },
          lines: true,
        },
      },
    },
  })

  if (!batch) throw new Error('Batch not found')

  const rows: string[] = [CSV_HEADERS.join(',')]

  for (const claim of batch.claims) {
    // Skip manual enquiry claims
    if (claim.claimType === 'MANUAL_ENQUIRY') continue

    const ndisNumber = claim.invoice?.participant?.ndisNumber ?? ''
    const providerAbn = claim.invoice?.provider?.abn ?? ''
    const participantApproved = claim.invoice?.participantApprovalStatus === 'APPROVED' ? 'Y' : 'N'

    for (const line of claim.lines) {
      const row = [
        registrationNumber,
        ndisNumber,
        formatDate(new Date(line.serviceDate)),
        formatDate(new Date(line.serviceDate)),
        line.supportItemCode,
        claim.claimReference,
        formatQuantity(Number(line.quantity)),
        '', // Hours — derived if unit=hour
        centsToPrice(line.unitPriceCents),
        gstCode(line.gstCents),
        '', // AuthorisedBy (empty for plan managed)
        participantApproved,
        '', // InKindFundingProgram
        '1', // ClaimType (1 = standard)
        '', // CancellationReason
        providerAbn,
      ]
      rows.push(row.join(','))
    }
  }

  if (rows.length > 5001) {
    throw new Error('CSV exceeds maximum 5000 data rows')
  }

  return rows.join('\n')
}
