/**
 * Provider portal payments history page — premium redesign.
 * Server component — requires PROVIDER session.
 */

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getProviderForSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'
import { Check } from 'lucide-react'

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
        invoice: { providerId: provider.id, deletedAt: null },
      },
    },
    select: {
      id: true,
      amountCents: true,
      processedAt: true,
      reference: true,
      claim: {
        select: {
          invoice: { select: { invoiceNumber: true } },
        },
      },
    },
    orderBy: { processedAt: 'desc' },
  })

  const totalPaidCents = payments.reduce((sum, p) => sum + p.amountCents, 0)
  const now = new Date()
  const fyStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1

  // Group by month label
  const grouped = payments.reduce<Record<string, typeof payments>>((acc, p) => {
    const monthKey = new Date(p.processedAt!).toLocaleDateString('en-AU', {
      month: 'long',
      year: 'numeric',
    })
    if (!acc[monthKey]) acc[monthKey] = []
    acc[monthKey]!.push(p)
    return acc
  }, {})

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900">Payments</h1>
        <p className="text-stone-500 mt-1">Your complete payment history</p>
      </div>

      {/* Summary banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-emerald-700 text-xs font-semibold uppercase tracking-[0.12em] mb-1">Total Received</p>
          <p className="font-display text-4xl font-bold text-emerald-800">{formatAUD(totalPaidCents)}</p>
          <p className="text-emerald-600 text-sm mt-1">
            {payments.length} payment{payments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-sm text-emerald-700">
          <p className="font-semibold">Financial Year</p>
          <p>1 Jul {fyStart} – 30 Jun {fyStart + 1}</p>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm">
          <p className="font-display font-semibold text-stone-700 mb-1">No payments yet</p>
          <p className="text-stone-400 text-sm">Cleared payments will appear here.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([month, monthPayments]) => (
          <div key={month}>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-400 pb-3 border-b border-stone-200 mb-1">
              {month}
            </p>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {monthPayments.map((payment, idx) => (
                <div
                  key={payment.id}
                  className={`flex items-center justify-between px-6 py-4 hover:bg-stone-50 transition-colors ${idx !== 0 ? 'border-t border-stone-50' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0" aria-hidden="true">
                      <Check className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">
                        {payment.claim.invoice.invoiceNumber}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {payment.processedAt ? formatDateAU(payment.processedAt) : '—'}
                        {payment.reference && ` · Ref: ${payment.reference}`}
                      </p>
                    </div>
                  </div>
                  <p className="font-bold text-emerald-700 text-base">{formatAUD(payment.amountCents)}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
