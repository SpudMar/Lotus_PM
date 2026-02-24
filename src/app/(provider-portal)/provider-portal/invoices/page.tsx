/**
 * Provider portal invoices list page — premium redesign.
 * Server component — requires PROVIDER session.
 */

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getProviderForSession } from '@/lib/modules/crm/provider-session'
import { prisma } from '@/lib/db'
import { InvoiceList, type PortalInvoice } from './invoice-list'

export default async function ProviderInvoicesPage(): Promise<React.JSX.Element> {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'PROVIDER') {
    redirect('/provider-portal/login')
  }

  const provider = await getProviderForSession(session.user.id)

  if (!provider) {
    redirect('/provider-portal/login')
  }

  const rawInvoices = await prisma.invInvoice.findMany({
    where: { providerId: provider.id, deletedAt: null },
    select: {
      id: true,
      invoiceNumber: true,
      receivedAt: true,
      totalCents: true,
      status: true,
      rejectionReason: true,
      participant: { select: { firstName: true, lastName: true } },
    },
    orderBy: { receivedAt: 'desc' },
  })

  const invoices: PortalInvoice[] = rawInvoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    participantName: inv.participant
      ? `${inv.participant.firstName} ${inv.participant.lastName}`
      : '—',
    receivedAt: inv.receivedAt,
    totalCents: inv.totalCents,
    status: inv.status,
    rejectionReason: inv.rejectionReason,
  }))

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-stone-900">My Invoices</h1>
        <p className="text-stone-500 mt-1">
          {invoices.length} total invoice{invoices.length !== 1 ? 's' : ''}
        </p>
      </div>
      <InvoiceList invoices={invoices} />
    </div>
  )
}
