'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  CheckCheck,
  Clock,
  Ban,
  Sparkles,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'
import { formatAUD } from '@/lib/shared/currency'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey =
  | 'all'
  | 'NEEDS_CODES'
  | 'NEEDS_REVIEW'
  | 'AUTO_REJECTED'
  | 'PARTICIPANT_APPROVAL'
  | 'AUTO_APPROVED'

interface ProcessingSummary {
  autoApproved: number
  participantApproval: number
  needsCodes: number
  needsReview: number
  autoRejected: number
}

interface InvoiceLine {
  id: string
  supportItemCode: string
  supportItemName: string
  categoryCode: string
  totalCents: number
  aiSuggestedCode: string | null
  aiCodeConfidence: string | null
}

interface QueueInvoice {
  id: string
  invoiceNumber: string
  sourceEmail: string | null
  totalCents: number
  receivedAt: string
  invoiceDate: string | null
  processedAt: string | null
  status: string
  processingCategory: string | null
  aiConfidence: number | null
  participant: { firstName: string; lastName: string; ndisNumber: string } | null
  provider: { name: string } | null
  lines: InvoiceLine[]
}

interface BulkResult {
  succeeded: string[]
  failed: { id: string; error: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function aiCodeBadge(confidence: string | null): React.JSX.Element {
  switch (confidence) {
    case 'HIGH':
      return <Badge className="text-[10px] px-1 py-0 bg-green-600 text-white">HIGH</Badge>
    case 'MEDIUM':
      return <Badge className="text-[10px] px-1 py-0 bg-amber-500 text-white">MED</Badge>
    case 'LOW':
      return <Badge className="text-[10px] px-1 py-0 bg-red-500 text-white">LOW</Badge>
    default:
      return <Badge variant="secondary" className="text-[10px] px-1 py-0">NONE</Badge>
  }
}

function processingCategoryBadge(category: string | null): React.JSX.Element {
  switch (category) {
    case 'NEEDS_CODES':
      return <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Needs Codes</Badge>
    case 'NEEDS_REVIEW':
      return <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">Needs Review</Badge>
    case 'AUTO_APPROVED':
      return <Badge variant="default" className="text-xs bg-green-600">Auto-Approved</Badge>
    case 'AUTO_REJECTED':
      return <Badge variant="destructive" className="text-xs">Auto-Rejected</Badge>
    case 'PARTICIPANT_APPROVAL':
      return <Badge variant="outline" className="text-xs text-purple-700 border-purple-300">Awaiting Participant</Badge>
    default:
      return <Badge variant="secondary" className="text-xs">Pending</Badge>
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Summary dashboard cards ────────────────────────────────────────────────────

interface SummaryCardsProps {
  summary: ProcessingSummary | null
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
}

function SummaryCards({ summary, activeTab, onTabChange }: SummaryCardsProps): React.JSX.Element {
  const cards: { label: string; key: TabKey; value: number; icon: React.ReactNode; color: string }[] = [
    {
      label: 'Auto-Done',
      key: 'AUTO_APPROVED',
      value: summary?.autoApproved ?? 0,
      icon: <CheckCheck className="h-5 w-5" aria-hidden="true" />,
      color: 'text-green-600',
    },
    {
      label: 'Needs Codes',
      key: 'NEEDS_CODES',
      value: summary?.needsCodes ?? 0,
      icon: <Sparkles className="h-5 w-5" aria-hidden="true" />,
      color: 'text-amber-600',
    },
    {
      label: 'Needs Review',
      key: 'NEEDS_REVIEW',
      value: summary?.needsReview ?? 0,
      icon: <AlertCircle className="h-5 w-5" aria-hidden="true" />,
      color: 'text-blue-600',
    },
    {
      label: 'Rejected',
      key: 'AUTO_REJECTED',
      value: summary?.autoRejected ?? 0,
      icon: <Ban className="h-5 w-5" aria-hidden="true" />,
      color: 'text-red-600',
    },
    {
      label: 'Awaiting Participant',
      key: 'PARTICIPANT_APPROVAL',
      value: summary?.participantApproval ?? 0,
      icon: <Clock className="h-5 w-5" aria-hidden="true" />,
      color: 'text-purple-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onTabChange(card.key)}
          className={`rounded-lg border p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
            activeTab === card.key ? 'border-primary bg-primary/5 shadow-sm' : 'bg-card hover:border-muted-foreground/30'
          }`}
          aria-pressed={activeTab === card.key}
          aria-label={`${card.label}: ${card.value} — click to filter`}
        >
          <div className={`mb-1 ${card.color}`}>{card.icon}</div>
          <div className="text-2xl font-bold tabular-nums">
            {summary === null ? (
              <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" />
            ) : (
              card.value
            )}
          </div>
          <div className="text-xs text-muted-foreground">{card.label}</div>
        </button>
      ))}
    </div>
  )
}

// ── Needs Codes card ──────────────────────────────────────────────────────────

interface NeedsCodesCardProps {
  invoice: QueueInvoice
  onAcceptSuggestions: (id: string) => void
  accepting: boolean
}

function NeedsCodesCard({ invoice, onAcceptSuggestions, accepting }: NeedsCodesCardProps): React.JSX.Element {
  const linesWithSuggestions = invoice.lines.filter((l) => l.aiSuggestedCode)
  const linesNeedingCodes = invoice.lines.filter((l) => !l.supportItemCode)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold truncate">
              {invoice.provider?.name ?? (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Unmatched provider
                </span>
              )}
            </CardTitle>
            <Badge variant="outline" className="text-xs shrink-0">
              {invoice.invoiceNumber === 'PENDING' ? (
                <span className="italic text-muted-foreground">Pending</span>
              ) : (
                invoice.invoiceNumber
              )}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {invoice.participant ? (
              <span>
                {invoice.participant.firstName} {invoice.participant.lastName}
                {' '}
                <span className="font-mono">{invoice.participant.ndisNumber}</span>
              </span>
            ) : (
              <span className="text-amber-600">Participant unassigned</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {invoice.invoiceDate ? formatDateAU(new Date(invoice.invoiceDate)) : 'No date'}{' '}
            &middot;{' '}
            <span className="font-medium text-foreground">{formatAUD(invoice.totalCents)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            asChild
          >
            <Link href={`/invoices/review/${invoice.id}`}>
              <ExternalLink className="mr-1 h-3 w-3" aria-hidden="true" />
              Review
            </Link>
          </Button>
          {linesWithSuggestions.length > 0 && (
            <Button
              size="sm"
              className="text-xs bg-green-600 hover:bg-green-700"
              disabled={accepting}
              onClick={() => onAcceptSuggestions(invoice.id)}
              aria-label={`Accept all AI suggestions for invoice ${invoice.invoiceNumber}`}
            >
              <CheckCheck className="mr-1 h-3 w-3" aria-hidden="true" />
              {accepting ? 'Accepting...' : `Accept All (${linesWithSuggestions.length})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {invoice.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No line items extracted.</p>
        ) : (
          <div className="space-y-1">
            {invoice.lines.map((line) => {
              const hasSuggestion = !!line.aiSuggestedCode
              const missingCode = !line.supportItemCode

              return (
                <div
                  key={line.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${missingCode ? 'bg-amber-50 border border-amber-200' : 'bg-muted/30'}`}
                >
                  <span className="font-mono shrink-0 w-36 truncate" title={line.supportItemCode || undefined}>
                    {missingCode ? (
                      <span className="text-amber-600 italic">no code</span>
                    ) : (
                      line.supportItemCode
                    )}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground" title={line.supportItemName}>
                    {line.supportItemName || '(no description)'}
                  </span>
                  {hasSuggestion && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Sparkles className="h-3 w-3 text-amber-500" aria-hidden="true" />
                      <span className="font-mono text-blue-700">{line.aiSuggestedCode}</span>
                      {aiCodeBadge(line.aiCodeConfidence)}
                    </div>
                  )}
                  <span className="font-mono text-muted-foreground shrink-0">{formatAUD(line.totalCents)}</span>
                </div>
              )
            })}
          </div>
        )}
        {linesNeedingCodes.length > 0 && linesWithSuggestions.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {linesNeedingCodes.length} line item{linesNeedingCodes.length !== 1 ? 's' : ''} need support codes — no AI suggestions available.{' '}
            <Link href={`/invoices/review/${invoice.id}`} className="underline">
              Review manually
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Needs Review list row ─────────────────────────────────────────────────────

interface NeedsReviewRowProps {
  invoice: QueueInvoice
}

function NeedsReviewRow({ invoice }: NeedsReviewRowProps): React.JSX.Element {
  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="text-sm">
        <Link href={`/invoices/review/${invoice.id}`} className="hover:underline font-medium">
          {invoice.provider?.name ?? (
            <span className="text-amber-600">Unmatched</span>
          )}
        </Link>
      </TableCell>
      <TableCell className="text-sm">
        {invoice.participant ? (
          <div>
            <div>{invoice.participant.firstName} {invoice.participant.lastName}</div>
            <div className="text-xs text-muted-foreground font-mono">{invoice.participant.ndisNumber}</div>
          </div>
        ) : (
          <span className="text-amber-600 text-xs flex items-center gap-1">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Unassigned
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {invoice.invoiceDate ? formatDateAU(new Date(invoice.invoiceDate)) : '--'}
      </TableCell>
      <TableCell className="text-sm font-mono">
        {invoice.totalCents > 0 ? formatAUD(invoice.totalCents) : (
          <span className="text-muted-foreground italic text-xs">Extracting...</span>
        )}
      </TableCell>
      <TableCell>
        {processingCategoryBadge(invoice.processingCategory)}
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/invoices/review/${invoice.id}`}>
            <ExternalLink className="mr-1 h-3 w-3" aria-hidden="true" />
            Review
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ── Auto-Done feed row ────────────────────────────────────────────────────────

interface AutoDoneRowProps {
  invoice: QueueInvoice
}

function AutoDoneRow({ invoice }: AutoDoneRowProps): React.JSX.Element {
  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="text-sm">
        <Link href={`/invoices/review/${invoice.id}`} className="hover:underline font-medium">
          {invoice.provider?.name ?? <span className="text-muted-foreground">Unknown</span>}
        </Link>
      </TableCell>
      <TableCell className="text-sm">
        {invoice.participant ? (
          <div>
            <div>{invoice.participant.firstName} {invoice.participant.lastName}</div>
            <div className="text-xs text-muted-foreground font-mono">{invoice.participant.ndisNumber}</div>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">--</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {invoice.invoiceDate ? formatDateAU(new Date(invoice.invoiceDate)) : '--'}
      </TableCell>
      <TableCell className="text-sm font-mono">
        {formatAUD(invoice.totalCents)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <CheckCheck className="h-3 w-3 text-green-600" aria-hidden="true" />
          Auto-approved {timeAgo(invoice.processedAt)}
        </div>
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/invoices/review/${invoice.id}`}>
            Audit
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ── All queue (legacy flat queue) ─────────────────────────────────────────────

interface AllQueueProps {
  invoices: QueueInvoice[]
  loading: boolean
  search: string
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  selected: Set<string>
  onToggleAll: () => void
  onToggleOne: (id: string) => void
  bulkLoading: boolean
  onApproveSelected: () => void
  onOpenRejectDialog: () => void
  onGenerateClaims: () => void
  onClearSelection: () => void
}

function AllQueue({
  invoices,
  loading,
  search,
  onSearchChange,
  selected,
  onToggleAll,
  onToggleOne,
  bulkLoading,
  onApproveSelected,
  onOpenRejectDialog,
  onGenerateClaims,
  onClearSelection,
}: AllQueueProps): React.JSX.Element {
  const allVisibleIds = invoices.map((inv) => inv.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0
  const selectedInvoices = invoices.filter((inv) => selected.has(inv.id))
  const selectedPendingReview = selectedInvoices.filter((inv) => inv.status === 'PENDING_REVIEW')
  const selectedApproved = selectedInvoices.filter((inv) => inv.status === 'APPROVED')

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
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
                  onClick={onApproveSelected}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Approve Selected ({selectedPendingReview.length})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkLoading}
                  onClick={onOpenRejectDialog}
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
                onClick={onGenerateClaims}
              >
                <FileText className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Generate Claims ({selectedApproved.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkLoading}
              onClick={onClearSelection}
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
          placeholder="Search by email or invoice number..."
          value={search}
          onChange={onSearchChange}
          className="pl-9"
          aria-label="Search invoice queue"
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
                  onCheckedChange={onToggleAll}
                  aria-label="Select all"
                  disabled={loading || invoices.length === 0}
                />
              </TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading queue...
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
                  className={`cursor-pointer hover:bg-muted/50 ${selected.has(inv.id) ? 'bg-muted/30' : ''}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(inv.id)}
                      onCheckedChange={() => onToggleOne(inv.id)}
                      aria-label={`Select invoice ${inv.invoiceNumber}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={`/invoices/review/${inv.id}`} className="hover:underline font-medium">
                      {inv.provider?.name ?? (
                        <span className="flex items-center gap-1 text-amber-600 text-xs">
                          <AlertCircle className="h-3 w-3" aria-hidden="true" />
                          Unmatched
                        </span>
                      )}
                    </Link>
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
                  <TableCell>
                    <Link href={`/invoices/review/${inv.id}`} className="hover:underline">
                      <span className={inv.invoiceNumber === 'PENDING' ? 'italic text-muted-foreground text-sm' : 'text-sm font-mono'}>
                        {inv.invoiceNumber}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {inv.totalCents > 0 ? formatAUD(inv.totalCents) : (
                      <span className="italic text-muted-foreground text-xs">Extracting...</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {processingCategoryBadge(inv.processingCategory)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateAU(new Date(inv.receivedAt))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InvoiceReviewPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [summary, setSummary] = useState<ProcessingSummary | null>(null)

  // Invoice list state
  const [invoices, setInvoices] = useState<QueueInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Selection + bulk state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ succeeded: string[]; failed: { id: string; error: string }[] } | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Needs Codes accept-all state
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadSummary = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/invoices/processing-summary')
      if (res.ok) {
        const json = await res.json() as { data: ProcessingSummary }
        setSummary(json.data)
      }
    } catch {
      // non-fatal; summary cards will stay at zero
    }
  }, [])

  const loadInvoices = useCallback(async (q?: string): Promise<void> => {
    setLoading(true)
    setSelected(new Set())
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100' })

      if (activeTab === 'all') {
        params.set('statuses', 'PENDING_REVIEW,APPROVED')
      } else if (activeTab === 'AUTO_REJECTED') {
        params.set('statuses', 'REJECTED')
        params.set('processingCategory', 'AUTO_REJECTED')
      } else if (activeTab === 'AUTO_APPROVED') {
        params.set('statuses', 'APPROVED')
        params.set('processingCategory', 'AUTO_APPROVED')
      } else {
        params.set('statuses', 'PENDING_REVIEW')
        params.set('processingCategory', activeTab)
      }

      if (q) params.set('search', q)

      const res = await fetch(`/api/invoices?${params.toString()}`)
      if (res.ok) {
        const json = await res.json() as { data: QueueInvoice[] }
        setInvoices(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    setSearch('')
    void loadInvoices()
  }, [loadInvoices])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value
    setSearch(val)
    setTimeout(() => void loadInvoices(val), 300)
  }

  function handleTabChange(tab: TabKey): void {
    setActiveTab(tab)
    setBulkResult(null)
  }

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
      void loadSummary()
    } finally {
      setBulkLoading(false)
    }
  }

  const selectedInvoices = invoices.filter((inv) => selected.has(inv.id))
  const selectedPendingReview = selectedInvoices.filter((inv) => inv.status === 'PENDING_REVIEW')
  const selectedApproved = selectedInvoices.filter((inv) => inv.status === 'APPROVED')

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

  function toggleAll(): void {
    const allIds = invoices.map((inv) => inv.id)
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
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

  // ── Accept all AI suggestions for a NEEDS_CODES invoice ──────────────────

  async function handleAcceptSuggestions(invoiceId: string): Promise<void> {
    const invoice = invoices.find((inv) => inv.id === invoiceId)
    if (!invoice) return

    setAcceptingId(invoiceId)
    try {
      // Build updated lines with aiSuggestedCode applied to empty codes
      const updatedLines = invoice.lines.map((line) => ({
        supportItemCode: !line.supportItemCode && line.aiSuggestedCode
          ? line.aiSuggestedCode
          : line.supportItemCode,
        supportItemName: line.supportItemName,
        categoryCode: line.categoryCode,
        serviceDate: new Date().toISOString().split('T')[0] ?? '',
        quantity: 1,
        unitPriceCents: line.totalCents,
        totalCents: line.totalCents,
        gstCents: 0,
      }))

      // Save the updated lines
      await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: updatedLines }),
      })

      void loadInvoices()
      void loadSummary()
    } finally {
      setAcceptingId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabConfig: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'NEEDS_CODES', label: 'Needs Codes' },
    { key: 'NEEDS_REVIEW', label: 'Needs Review' },
    { key: 'AUTO_REJECTED', label: 'Rejected' },
    { key: 'PARTICIPANT_APPROVAL', label: 'Awaiting Participant' },
    { key: 'AUTO_APPROVED', label: 'Auto-Done' },
  ]

  return (
    <DashboardShell>
      <PageHeader
        title="Invoice Review"
        description="AI-categorised invoice queue. Review, code, and approve incoming invoices."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void loadSummary(); void loadInvoices(); }}
            aria-label="Refresh queue"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {/* Processing summary cards */}
      <SummaryCards
        summary={summary}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Bulk result banner */}
      {bulkResult && (
        <div
          className={`rounded-md border p-3 text-sm ${bulkResult.failed.length > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-green-300 bg-green-50 text-green-800'}`}
          role="status"
        >
          {bulkResult.succeeded.length > 0 && (
            <span className="mr-3">
              <CheckCheck className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
              {bulkResult.succeeded.length} succeeded
            </span>
          )}
          {bulkResult.failed.length > 0 && (
            <span>
              <XCircle className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
              {bulkResult.failed.length} failed: {bulkResult.failed.map((f) => f.error).join('; ')}
            </span>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabKey)}>
        <TabsList className="h-auto flex-wrap gap-1">
          {tabConfig.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── ALL tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="all">
          <AllQueue
            invoices={invoices}
            loading={loading}
            search={search}
            onSearchChange={handleSearchChange}
            selected={selected}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            bulkLoading={bulkLoading}
            onApproveSelected={handleApproveSelected}
            onOpenRejectDialog={handleOpenRejectDialog}
            onGenerateClaims={handleGenerateClaims}
            onClearSelection={() => setSelected(new Set())}
          />
        </TabsContent>

        {/* ── NEEDS CODES tab ──────────────────────────────────────────────── */}
        <TabsContent value="NEEDS_CODES">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Invoices where AI extracted data but support codes are missing.
                Accept AI suggestions or review manually.
              </p>
              <Badge variant="secondary" className="tabular-nums">
                {loading ? '...' : invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Sparkles className="h-10 w-10 opacity-30" aria-hidden="true" />
                <p className="text-sm">No invoices needing codes. Great work!</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {invoices.map((inv) => (
                  <NeedsCodesCard
                    key={inv.id}
                    invoice={inv}
                    onAcceptSuggestions={handleAcceptSuggestions}
                    accepting={acceptingId === inv.id}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── NEEDS REVIEW tab ─────────────────────────────────────────────── */}
        <TabsContent value="NEEDS_REVIEW">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Invoices flagged for manual review due to ambiguity, low AI confidence, or validation issues.
              </p>
              <Badge variant="secondary" className="tabular-nums">
                {loading ? '...' : invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="h-8 w-8 opacity-30" aria-hidden="true" />
                          <span className="text-sm">No invoices needing review.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => <NeedsReviewRow key={inv.id} invoice={inv} />)
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── AUTO_REJECTED tab ────────────────────────────────────────────── */}
        <TabsContent value="AUTO_REJECTED">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Invoices automatically rejected by the AI engine. Read-only for audit.
              </p>
              <Badge variant="secondary" className="tabular-nums">
                {loading ? '...' : invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Ban className="h-8 w-8 opacity-30" aria-hidden="true" />
                          <span className="text-sm">No auto-rejected invoices.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <NeedsReviewRow key={inv.id} invoice={inv} />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── PARTICIPANT_APPROVAL tab ──────────────────────────────────────── */}
        <TabsContent value="PARTICIPANT_APPROVAL">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Invoices awaiting participant approval before processing.
              </p>
              <Badge variant="secondary" className="tabular-nums">
                {loading ? '...' : invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Clock className="h-8 w-8 opacity-30" aria-hidden="true" />
                          <span className="text-sm">No invoices awaiting participant approval.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <NeedsReviewRow key={inv.id} invoice={inv} />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── AUTO_APPROVED (Auto-Done) tab ────────────────────────────────── */}
        <TabsContent value="AUTO_APPROVED">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Invoices auto-approved by the AI engine. Reverse-chronological audit feed.
              </p>
              <Badge variant="secondary" className="tabular-nums">
                {loading ? '...' : invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Auto-approved</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCheck className="h-8 w-8 opacity-30" aria-hidden="true" />
                          <span className="text-sm">No auto-approved invoices yet.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => <AutoDoneRow key={inv.id} invoice={inv} />)
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Reject dialog (for bulk actions on All tab) */}
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
              placeholder="e.g. Duplicate invoice, missing participant details..."
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
