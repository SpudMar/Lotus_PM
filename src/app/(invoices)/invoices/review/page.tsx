'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Mail,
  Search,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
} from 'lucide-react'
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

interface BulkResult {
  succeeded: string[]
  failed: { id: string; error: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string): React.JSX.Element {
  switch (status) {
    case 'PENDING_REVIEW':
      return <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Pending Review</Badge>
    case 'APPROVED':
      return <Badge variant="default" className="text-xs bg-green-600">Approved</Badge>
    default:
      return <Badge variant="secondary" className="text-xs">{status}</Badge>
  }
}

function confidenceBadge(confidence: number | null): React.JSX.Element {
  if (confidence === null) return <Badge variant="secondary" className="text-xs">Unknown</Badge>
  const pct = Math.round(confidence * 100)
  if (pct >= 80) return <Badge variant="default" className="text-xs bg-green-600">{pct}%</Badge>
  if (pct >= 50) return <Badge variant="default" className="text-xs bg-yellow-600">{pct}%</Badge>
  return <Badge variant="destructive" className="text-xs">{pct}%</Badge>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmailTriagePage(): React.JSX.Element {
  const [invoices, setInvoices] = useState<TriageInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Bulk action state
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const loadInvoices = useCallback(async (q?: string): Promise<void> => {
    setLoading(true)
    setSelected(new Set()) // clear selection on reload
    try {
      const params = new URLSearchParams({
        ingestSource: 'EMAIL',
        statuses: 'PENDING_REVIEW,APPROVED',
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

  // ── Selection helpers ──────────────────────────────────────────────────────

  const allVisibleIds = invoices.map((inv) => inv.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0

  function toggleAll(): void {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allVisibleIds))
    }
  }

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Partition selected invoices by status for contextual actions
  const selectedInvoices = invoices.filter((inv) => selected.has(inv.id))
  const selectedPendingReview = selectedInvoices.filter((inv) => inv.status === 'PENDING_REVIEW')
  const selectedApproved = selectedInvoices.filter((inv) => inv.status === 'APPROVED')

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async function executeBulk(
    action: 'approve' | 'reject' | 'claim',
    ids: string[],
    reason?: string
  ): Promise<void> {
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/invoices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, invoiceIds: ids, reason }),
      })
      const json = await res.json() as BulkResult
      setBulkResult(json)
      void loadInvoices(search || undefined)
    } finally {
      setBulkLoading(false)
    }
  }

  function handleApproveSelected(): void {
    const ids = selectedPendingReview.map((inv) => inv.id)
    if (ids.length === 0) return
    void executeBulk('approve', ids)
  }

  function handleOpenRejectDialog(): void {
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  function handleRejectConfirm(): void {
    const ids = selectedPendingReview.map((inv) => inv.id)
    if (ids.length === 0 || !rejectReason.trim()) return
    setRejectDialogOpen(false)
    void executeBulk('reject', ids, rejectReason.trim())
  }

  function handleGenerateClaims(): void {
    const ids = selectedApproved.map((inv) => inv.id)
    if (ids.length === 0) return
    void executeBulk('claim', ids)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <PageHeader
        title="Email Triage"
        description="Review invoices received via email. Assign participants, verify amounts, then approve or reject."
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" aria-hidden="true" />
            {loading ? '…' : `${invoices.length} invoices`}
          </div>
        }
      />

      {/* Bulk result banner */}
      {bulkResult && (
        <div
          className={`rounded-md border p-3 text-sm ${bulkResult.failed.length > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-green-300 bg-green-50 text-green-800'}`}
          role="status"
        >
          {bulkResult.succeeded.length > 0 && (
            <span className="mr-3">✓ {bulkResult.succeeded.length} succeeded</span>
          )}
          {bulkResult.failed.length > 0 && (
            <span>✗ {bulkResult.failed.length} failed: {bulkResult.failed.map((f) => f.error).join('; ')}</span>
          )}
          <button
            className="ml-4 underline"
            onClick={() => setBulkResult(null)}
            type="button"
            aria-label="Dismiss result"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bulk action bar — visible when items are selected */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {selectedPendingReview.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={bulkLoading}
                  onClick={handleApproveSelected}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Approve Selected ({selectedPendingReview.length})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkLoading}
                  onClick={handleOpenRejectDialog}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Reject Selected ({selectedPendingReview.length})
                </Button>
              </>
            )}
            {selectedApproved.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                onClick={handleGenerateClaims}
              >
                <FileText className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Generate Claims ({selectedApproved.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkLoading}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

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
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  disabled={loading || invoices.length === 0}
                />
              </TableHead>
              <TableHead>Sender email</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AI confidence</TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Loading email queue…
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
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
                  className={`cursor-pointer hover:bg-muted/50 ${selected.has(inv.id) ? 'bg-muted/30' : ''}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(inv.id)}
                      onCheckedChange={() => toggleOne(inv.id)}
                      aria-label={`Select invoice ${inv.invoiceNumber}`}
                    />
                  </TableCell>
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
                  <TableCell>{statusBadge(inv.status)}</TableCell>
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

      {/* Reject reason dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {selectedPendingReview.length} invoice{selectedPendingReview.length !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              Enter a reason for rejection. This will be recorded on all selected invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulkRejectReason">Rejection reason</Label>
            <Textarea
              id="bulkRejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Duplicate invoice, missing participant details…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={handleRejectConfirm}
            >
              Reject {selectedPendingReview.length} invoice{selectedPendingReview.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
