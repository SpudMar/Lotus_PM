'use client'

import { useState } from 'react'
import { InvoiceStatusBadge, statusBorderColor } from '@/components/provider-portal/invoice-status-badge'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'

export type PortalInvoice = {
  id: string
  invoiceNumber: string
  participantName: string
  receivedAt: Date
  totalCents: number
  status: string
  rejectionReason?: string | null
}

const FILTER_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'progress', label: 'In Progress' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid',     label: 'Paid' },
  { key: 'action',   label: 'Action Required' },
]

const FILTER_STATUS: Record<string, string[]> = {
  all:      [],
  progress: ['RECEIVED', 'PROCESSING', 'PENDING_REVIEW', 'PENDING_PARTICIPANT_APPROVAL'],
  approved: ['APPROVED', 'CLAIMED'],
  paid:     ['PAID'],
  action:   ['REJECTED'],
}

export function InvoiceList({ invoices }: { invoices: PortalInvoice[] }) {
  const [activeTab, setActiveTab] = useState('all')

  const filtered =
    activeTab === 'all'
      ? invoices
      : invoices.filter(inv => FILTER_STATUS[activeTab]?.includes(inv.status))

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1" role="tablist" aria-label="Filter invoices">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {FILTER_STATUS[tab.key]
                  ? invoices.filter(i => FILTER_STATUS[tab.key]!.includes(i.status)).length
                  : invoices.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm">
          <p className="font-display font-semibold text-stone-700 mb-1">No invoices found</p>
          <p className="text-stone-400 text-sm">No invoices match this filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {filtered.map((inv, idx) => (
            <div key={inv.id}>
              <div
                className={`flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors border-l-4 ${idx !== 0 ? 'border-t border-stone-50' : ''}`}
                style={{ borderColor: statusBorderColor(inv.status) }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm">{inv.invoiceNumber}</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {inv.participantName} · {formatDateAU(new Date(inv.receivedAt))}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-stone-900 text-sm">{formatAUD(inv.totalCents)}</p>
                  <div className="mt-1">
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </div>
              </div>
              {inv.status === 'REJECTED' && inv.rejectionReason && (
                <div className="mx-6 mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <span className="font-semibold">Reason: </span>{inv.rejectionReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
