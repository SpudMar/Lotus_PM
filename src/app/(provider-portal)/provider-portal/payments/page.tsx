/**
 * Provider portal payments history page.
 * Server component — requires PROVIDER session.
 */

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getProviderForSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'
import { formatAUD } from '@/lib/shared/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProviderPaymentsPage(): Promise<React.JSX.Element> {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'PROVIDER') {
    redirect('/provider-portal/login')
  }

  const provider = await getProviderForSession(session.user.id)

  if (!provider) {
    redirect('/provider-portal/login')
  }

  const payments = await prisma.bnkPayment.findMany({
    where: {
      status: 'CLEARED',
      claim: {
        invoice: {
          providerId: provider.id,
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      amountCents: true,
      processedAt: true,
      reference: true,
      claim: {
        select: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
        },
      },
    },
    orderBy: { processedAt: 'desc' },
  })

  const totalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
        <p className="text-gray-500 mt-1">
          {payments.length} cleared payment{payments.length !== 1 ? 's' : ''} ·{' '}
          <span className="font-medium text-emerald-700">{formatAUD(totalPaid)} total</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cleared Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">
              No cleared payments found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Date Paid</th>
                    <th className="pb-3 font-medium">Invoice #</th>
                    <th className="pb-3 font-medium">Reference</th>
                    <th className="pb-3 font-medium text-right">Amount</th>
                    <th className="pb-3 font-medium">Remittance</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-3 text-gray-600">
                        {p.processedAt
                          ? p.processedAt.toLocaleDateString('en-AU')
                          : '—'}
                      </td>
                      <td className="py-3 font-medium">
                        {p.claim.invoice.invoiceNumber}
                      </td>
                      <td className="py-3 text-gray-600">
                        {p.reference ?? '—'}
                      </td>
                      <td className="py-3 text-right font-medium text-emerald-700">
                        {formatAUD(p.amountCents)}
                      </td>
                      <td className="py-3 text-gray-500 text-xs">
                        Remittance available via your plan manager
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
