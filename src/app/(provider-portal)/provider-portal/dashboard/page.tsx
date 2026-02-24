/**
 * Provider portal dashboard page — premium redesign.
 * Server component — keeps all original Prisma queries.
 */

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth/config'
import { getProviderForSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'
import { FileText } from 'lucide-react'
import { InvoiceStatusBadge, statusBorderColor } from '@/components/provider-portal/invoice-status-badge'

function getFinancialYearStart(): Date {
  const now = new Date()
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(`${year}-07-01T00:00:00.000Z`)
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

  const [totalInvoices, pendingCount, clearedPayments, recentInvoices] = await Promise.all([
    prisma.invInvoice.count({
      where: { providerId: provider.id, deletedAt: null },
    }),
    prisma.invInvoice.count({
      where: {
        providerId: provider.id,
        deletedAt: null,
        status: { in: ['RECEIVED', 'PROCESSING', 'PENDING_REVIEW', 'APPROVED'] },
      },
    }),
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
    prisma.invInvoice.findMany({
      where: { providerId: provider.id, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        receivedAt: true,
        totalCents: true,
        status: true,
        participant: { select: { firstName: true, lastName: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 5,
    }),
  ])

  const ytdPaidCents = clearedPayments._sum.amountCents ?? 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900">Welcome back</h1>
        <p className="text-stone-500 mt-1">{provider.name}</p>
      </div>

      {/* Hero card */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-8 text-white shadow-lg animate-fade-slide-up">
        <p className="text-emerald-200 text-xs font-semibold uppercase tracking-[0.12em] mb-2">
          Paid This Financial Year
        </p>
        <p className="font-display text-5xl font-bold tracking-tight mb-3">
          {formatAUD(ytdPaidCents)}
        </p>
        <p className="text-emerald-100 text-sm">
          {totalInvoices} invoice{totalInvoices !== 1 ? 's' : ''} submitted
          {pendingCount > 0 && ` · ${pendingCount} currently in progress`}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-stone-300 animate-fade-slide-up" style={{ animationDelay: '0.05s' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">Total Submitted</p>
          <p className="font-display text-4xl font-bold text-stone-900">{totalInvoices}</p>
          <p className="text-stone-500 text-sm mt-1">invoices all time</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-amber-400 animate-fade-slide-up" style={{ animationDelay: '0.1s' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">In Progress</p>
          <p className="font-display text-4xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-stone-500 text-sm mt-1">being processed</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-emerald-500 animate-fade-slide-up" style={{ animationDelay: '0.15s' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">Account Status</p>
          <div className="mt-2">
            {provider.providerStatus === 'ACTIVE' && (
              <span className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 text-sm font-semibold px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse-gentle" aria-hidden="true" />
                Active
              </span>
            )}
            {provider.providerStatus === 'PENDING_APPROVAL' && (
              <span className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 text-sm font-semibold px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 bg-amber-500 rounded-full" aria-hidden="true" />
                Pending Approval
              </span>
            )}
            {provider.providerStatus === 'SUSPENDED' && (
              <span className="inline-flex items-center gap-2 bg-red-100 text-red-800 text-sm font-semibold px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
                Suspended
              </span>
            )}
            {!['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'].includes(provider.providerStatus) && (
              <span className="inline-flex items-center gap-2 bg-stone-100 text-stone-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                {provider.providerStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent invoices */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden animate-fade-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-display font-semibold text-stone-900">Recent Invoices</h2>
            <Link href="/provider-portal/invoices" className="text-sm text-emerald-600 hover:text-emerald-800 font-medium">
              View all →
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-stone-400" aria-hidden="true" />
              </div>
              <p className="font-display font-semibold text-stone-700 mb-1">No invoices yet</p>
              <p className="text-stone-400 text-sm">Your invoices will appear here once submitted.</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-50">
              {recentInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors border-l-4"
                  style={{ borderColor: statusBorderColor(inv.status) }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{inv.invoiceNumber}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {inv.participant
                        ? `${inv.participant.firstName} ${inv.participant.lastName}`
                        : '—'}
                      {' · '}
                      {formatDateAU(inv.receivedAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-stone-900 text-sm">{formatAUD(inv.totalCents)}</p>
                    <div className="mt-1">
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* How payments work */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6 animate-fade-slide-up" style={{ animationDelay: '0.25s' }}>
          <h2 className="font-display font-semibold text-stone-900 mb-5">How payments work</h2>
          <div className="space-y-5">
            {[
              { num: '1', title: 'Invoice received', desc: "We review and validate your invoice against the participant's NDIS plan." },
              { num: '2', title: 'Lodged with NDIS', desc: 'Approved invoices are submitted to NDIS (PACE) within 2 business days.' },
              { num: '3', title: 'Payment cleared', desc: 'NDIS releases funds to us and we pay you directly. Typically 5 business days after lodgement.' },
            ].map(({ num, title, desc }) => (
              <div key={num} className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" aria-hidden="true">
                  {num}
                </div>
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{title}</p>
                  <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-5 border-t border-stone-100">
            <Link href="/provider-portal/payments" className="text-sm text-emerald-600 hover:text-emerald-800 font-medium">
              View payment history →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
