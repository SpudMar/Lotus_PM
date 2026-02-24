'use client'

const STATUS_CONFIG: Record<string, { label: string; bg: string; dot: string }> = {
  RECEIVED:                    { label: 'Received',          bg: 'bg-stone-100 text-stone-700',     dot: 'bg-stone-400' },
  PROCESSING:                  { label: 'Processing',         bg: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500' },
  PENDING_REVIEW:              { label: 'Being Reviewed',     bg: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-500' },
  PENDING_PARTICIPANT_APPROVAL:{ label: 'Awaiting Approval',  bg: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-400' },
  APPROVED:                    { label: 'Approved',           bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
  CLAIMED:                     { label: 'Lodged with NDIS',   bg: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  PAID:                        { label: 'Paid',               bg: 'bg-emerald-200 text-emerald-900', dot: 'bg-emerald-700' },
  REJECTED:                    { label: 'Action Required',    bg: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
}

const STATUS_BORDER_COLOR: Record<string, string> = {
  RECEIVED:                     '#a8a29e',
  PROCESSING:                   '#f59e0b',
  PENDING_REVIEW:               '#3b82f6',
  PENDING_PARTICIPANT_APPROVAL: '#60a5fa',
  APPROVED:                     '#34d399',
  CLAIMED:                      '#10b981',
  PAID:                         '#059669',
  REJECTED:                     '#ef4444',
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-stone-100 text-stone-600', dot: 'bg-stone-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}

export function statusBorderColor(status: string): string {
  return STATUS_BORDER_COLOR[status] ?? '#a8a29e'
}
