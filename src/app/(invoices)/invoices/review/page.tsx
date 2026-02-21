'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Mail, Search, AlertCircle } from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'
import { formatAUD } from '@/lib/shared/currency'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TriageInvoice {
  id: string
  invoiceNumber: string
  sourceEmail: string | null
  totalCents: number
  receivedAt: string
  status: string
  aiConfidence: number | null
  participant: { firstName: string; lastName: string; ndisNumber: string } | null
  provider: { name: string } | null
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmailTriagePage(): React.JSX.Element {
  const [invoices, setInvoices] = useState<TriageInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadInvoices = useCallback(async (q?: string): Promise<void> => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        ingestSource: 'EMAIL',
        status: 'PENDING_REVIEW',
        page: '1',
        pageSize: '100',
      })
      if (q) params.set('search', q)
      const res = await fetch(`/api/invoices?${params.toString()}`)
      if (res.ok) {
        const json = await res.json() as { data: TriageInvoice[] }
        setInvoices(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value
    setSearch(val)
    setTimeout(() => void loadInvoices(val), 300)
  }

  function confidenceBadge(confidence: number | null): React.JSX.Element {
    if (confidence === null) return <Badge variant="secondary" className="text-xs">Unknown</Badge>
    const pct = Math.round(confidence * 100)
    if (pct >= 80) return <Badge variant="default" className="text-xs bg-green-600">{pct}%</Badge>
    if (pct >= 50) return <Badge variant="default" className="text-xs bg-yellow-600">{pct}%</Badge>
    return <Badge variant="destructive" className="text-xs">{pct}%</Badge>
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Email Triage"
        description="Review invoices received via email. Assign participants, verify amounts, then approve or reject."
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" aria-hidden="true" />
            {loading ? '…' : `${invoices.length} pending`}
          </div>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search by email or invoice number…"
          value={search}
          onChange={handleSearchChange}
          className="pl-9"
          aria-label="Search email triage"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sender email</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>AI confidence</TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading email queue…
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Mail className="h-8 w-8 opacity-30" aria-hidden="true" />
                    <span>No invoices pending review.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/invoices/review/${inv.id}`}
                      className="block hover:underline"
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="text-sm font-medium">
                          {inv.sourceEmail ?? '(no sender)'}
                        </span>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/invoices/review/${inv.id}`} className="hover:underline">
                      <span className={inv.invoiceNumber === 'PENDING' ? 'italic text-muted-foreground text-sm' : 'text-sm font-mono'}>
                        {inv.invoiceNumber}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.provider?.name ?? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        Unmatched
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.participant ? (
                      <div>
                        <div>{inv.participant.firstName} {inv.participant.lastName}</div>
                        <div className="text-xs text-muted-foreground">{inv.participant.ndisNumber}</div>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 text-xs">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {inv.totalCents > 0 ? formatAUD(inv.totalCents) : (
                      <span className="italic text-muted-foreground text-xs">Extracting…</span>
                    )}
                  </TableCell>
                  <TableCell>{confidenceBadge(inv.aiConfidence)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateAU(new Date(inv.receivedAt))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardShell>
  )
}
