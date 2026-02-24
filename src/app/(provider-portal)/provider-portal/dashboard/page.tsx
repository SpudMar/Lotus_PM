/**
 * Provider portal dashboard page.
 * Server component — fetches data directly, redirects if not authenticated.
 */

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getProviderForSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'
import { formatAUD } from '@/lib/shared/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function getFinancialYearStart(): Date {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(`${year}-07-01T00:00:00.000Z`)
}

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
      return 'secondary'
    default:
      return 'outline'
  }
}

export default async function ProviderDashboardPage(): Promise<React.JSX.Element> {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'PROVIDER') {
    redirect('/provider-portal/login')
  }

  const provider = await getProviderForSession(session.user.id)

  if (!provider) {
    redirect('/provider-portal/login')
  }

  // Parallel data fetches
  const [totalInvoices, pendingInvoices, clearedPayments, recentInvoices] =
    await Promise.all([
      // Total invoice count
      prisma.invInvoice.count({
        where: { providerId: provider.id, deletedAt: null },
      }),

      // Pending invoices (submitted or approved — awaiting claim/payment)
      prisma.invInvoice.count({
        where: {
          providerId: provider.id,
          deletedAt: null,
          status: { in: ['RECEIVED', 'PROCESSING', 'PENDING_REVIEW', 'APPROVED'] },
        },
      }),

      // Total paid this financial year
      prisma.bnkPayment.aggregate({
        where: {
          status: 'CLEARED',
          processedAt: { gte: getFinancialYearStart() },
          claim: {
            invoice: { providerId: provider.id, deletedAt: null },
          },
        },
        _sum: { amountCents: true },
      }),

      // Recent 5 invoices
      prisma.invInvoice.findMany({
        where: { providerId: provider.id, deletedAt: null },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          totalCents: true,
          status: true,
          participant: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 5,
      }),
    ])

  const paidThisYear = clearedPayments._sum.amountCents ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {provider.name}
        </h1>
        <p className="text-gray-500 mt-1">Here is your provider portal summary.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Invoices Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{totalInvoices}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Paid This Financial Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">
              {formatAUD(paidThisYear)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Pending Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{pendingInvoices}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Account Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-emerald-100 text-emerald-800 text-sm">
              {provider.providerStatus}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Recent invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Invoice #</th>
                    <th className="pb-2 font-medium">Participant</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map(inv => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{inv.invoiceNumber}</td>
                      <td className="py-3 text-gray-600">
                        {inv.participant
                          ? `${inv.participant.firstName} ${inv.participant.lastName}`
                          : '—'}
                      </td>
                      <td className="py-3 text-gray-600">
                        {inv.invoiceDate.toLocaleDateString('en-AU')}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatAUD(inv.totalCents)}
                      </td>
                      <td className="py-3">
                        <Badge variant={getStatusVariant(inv.status)}>
                          {inv.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <a
              href="/provider-portal/invoices"
              className="text-sm text-emerald-600 hover:underline font-medium"
            >
              View all invoices
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
