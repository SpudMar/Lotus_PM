/**
 * Provider portal invoices list page.
 * Server component — requires PROVIDER session.
 */

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getProviderForSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'
import { formatAUD } from '@/lib/shared/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function getStatusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'APPROVED':
    case 'CLAIMED':
    case 'PAID':
      return 'default'
    case 'REJECTED':
      return 'destructive'
    case 'PENDING_REVIEW':
    case 'PROCESSING':
    case 'PENDING_PARTICIPANT_APPROVAL':
      return 'secondary'
    default:
      return 'outline'
  }
}

function getStatusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

export default async function ProviderInvoicesPage(): Promise<React.JSX.Element> {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'PROVIDER') {
    redirect('/provider-portal/login')
  }

  const provider = await getProviderForSession(session.user.id)

  if (!provider) {
    redirect('/provider-portal/login')
  }

  const invoices = await prisma.invInvoice.findMany({
    where: { providerId: provider.id, deletedAt: null },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      receivedAt: true,
      totalCents: true,
      status: true,
      rejectionReason: true,
      participant: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { receivedAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Invoices</h1>
        <p className="text-gray-500 mt-1">
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} submitted
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">
              No invoices have been submitted yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Invoice #</th>
                    <th className="pb-3 font-medium">Participant</th>
                    <th className="pb-3 font-medium">Date Submitted</th>
                    <th className="pb-3 font-medium text-right">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{inv.invoiceNumber}</td>
                      <td className="py-3 text-gray-600">
                        {inv.participant
                          ? `${inv.participant.firstName} ${inv.participant.lastName}`
                          : '—'}
                      </td>
                      <td className="py-3 text-gray-600">
                        {inv.receivedAt.toLocaleDateString('en-AU')}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatAUD(inv.totalCents)}
                      </td>
                      <td className="py-3">
                        <div className="space-y-1">
                          <Badge variant={getStatusVariant(inv.status)}>
                            {getStatusLabel(inv.status)}
                          </Badge>
                          {inv.status === 'REJECTED' && inv.rejectionReason && (
                            <p className="text-xs text-red-600">
                              {inv.rejectionReason}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
