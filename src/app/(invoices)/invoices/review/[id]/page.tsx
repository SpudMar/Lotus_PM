'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, CheckCircle, XCircle, Flag, Plus, Trash2, FileWarning } from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'
import { formatAUD, centsToDollars, dollarsToCents } from '@/lib/shared/currency'

// ── Types ──────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  id?: string
  supportItemCode: string
  supportItemName: string
  categoryCode: string
  serviceDate: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  gstCents: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  subtotalCents: number
  gstCents: number
  totalCents: number
  status: string
  sourceEmail: string | null
  aiConfidence: number | null
  s3Key: string | null
  participantId: string | null
  providerId: string | null
  planId: string | null
  participant: { id: string; firstName: string; lastName: string; ndisNumber: string } | null
  provider: { id: string; name: string; abn: string } | null
  plan: { id: string; startDate: string; endDate: string } | null
  lines: InvoiceLine[]
}

interface Participant {
  id: string
  firstName: string
  lastName: string
  ndisNumber: string
}

interface Provider {
  id: string
  name: string
  abn: string
}

interface Plan {
  id: string
  startDate: string
  endDate: string
  status: string
}

type FormLine = InvoiceLine

// ── Empty line template ────────────────────────────────────────────────────────

function emptyLine(): FormLine {
  return {
    supportItemCode: '',
    supportItemName: '',
    categoryCode: '01',
    serviceDate: new Date().toISOString().split('T')[0] ?? '',
    quantity: 1,
    unitPriceCents: 0,
    totalCents: 0,
    gstCents: 0,
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoiceReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): React.JSX.Element {
  const { id } = use(params)
  const router = useRouter()

  // Invoice state
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // PDF preview
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Form state (editable)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [subtotalStr, setSubtotalStr] = useState('')
  const [gstStr, setGstStr] = useState('')
  const [totalStr, setTotalStr] = useState('')
  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [lines, setLines] = useState<FormLine[]>([])

  // Dropdowns
  const [participants, setParticipants] = useState<Participant[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [plans, setPlans] = useState<Plan[]>([])

  // Dialogs
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [flagNote, setFlagNote] = useState('')

  // ── Data loading ──────────────────────────────────────────────────────────────

  const loadInvoice = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices/${id}`)
      if (res.ok) {
        const json = await res.json() as { data: Invoice }
        const inv = json.data
        setInvoice(inv)
        // Populate form
        setInvoiceNumber(inv.invoiceNumber === 'PENDING' ? '' : inv.invoiceNumber)
        setInvoiceDate(inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] ?? '' : '')
        setSubtotalStr(centsToDollars(inv.subtotalCents).toFixed(2))
        setGstStr(centsToDollars(inv.gstCents).toFixed(2))
        setTotalStr(centsToDollars(inv.totalCents).toFixed(2))
        setSelectedParticipantId(inv.participantId ?? '')
        setSelectedProviderId(inv.providerId ?? '')
        setSelectedPlanId(inv.planId ?? '')
        setLines(inv.lines.map((l) => ({
          ...l,
          serviceDate: new Date(l.serviceDate).toISOString().split('T')[0] ?? '',
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadPdfUrl = useCallback(async (): Promise<void> => {
    setPdfLoading(true)
    try {
      const res = await fetch(`/api/invoices/${id}/presigned-url`)
      if (res.ok) {
        const json = await res.json() as { data: { downloadUrl: string } }
        setPdfUrl(json.data.downloadUrl)
      }
    } finally {
      setPdfLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadInvoice()
  }, [loadInvoice])

  useEffect(() => {
    void loadPdfUrl()
  }, [loadPdfUrl])

  // Load participants and providers for dropdowns
  useEffect(() => {
    void fetch('/api/crm/participants?pageSize=200')
      .then(r => r.json())
      .then((j: { data: Participant[] }) => setParticipants(j.data))
      .catch(() => null)
    void fetch('/api/crm/providers?pageSize=200')
      .then(r => r.json())
      .then((j: { data: Provider[] }) => setProviders(j.data))
      .catch(() => null)
  }, [])

  // Load plans filtered by selected participant
  useEffect(() => {
    if (!selectedParticipantId) {
      setPlans([])
      return
    }
    void fetch(`/api/plans?participantId=${selectedParticipantId}&pageSize=50`)
      .then(r => r.json())
      .then((j: { data: Plan[] }) => setPlans(j.data))
      .catch(() => null)
  }, [selectedParticipantId])

  // ── Form helpers ────────────────────────────────────────────────────────────

  function buildPayload() {
    return {
      invoiceNumber: invoiceNumber || undefined,
      invoiceDate: invoiceDate || undefined,
      subtotalCents: dollarsToCents(parseFloat(subtotalStr) || 0),
      gstCents: dollarsToCents(parseFloat(gstStr) || 0),
      totalCents: dollarsToCents(parseFloat(totalStr) || 0),
      participantId: selectedParticipantId || undefined,
      providerId: selectedProviderId || undefined,
      planId: selectedPlanId || undefined,
      lines: lines.map((l) => ({
        supportItemCode: l.supportItemCode,
        supportItemName: l.supportItemName,
        categoryCode: l.categoryCode,
        serviceDate: l.serviceDate,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        totalCents: l.totalCents,
        gstCents: l.gstCents,
      })),
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleSaveDraft(): Promise<void> {
    setSaving(true)
    try {
      await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      await loadInvoice()
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove(): Promise<void> {
    setActionLoading('approve')
    try {
      // Save draft first, then approve
      await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', planId: selectedPlanId || undefined }),
      })
      if (res.ok) {
        router.push('/invoices/review')
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(): Promise<void> {
    if (!rejectReason.trim()) return
    setActionLoading('reject')
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason }),
      })
      if (res.ok) {
        setShowRejectDialog(false)
        router.push('/invoices/review')
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleFlag(): Promise<void> {
    // Save with a note — keeps PENDING_REVIEW status
    setActionLoading('flag')
    try {
      await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      // Create a CrmCorrespondence NOTE for the flag comment
      if (flagNote.trim()) {
        await fetch('/api/crm/correspondence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'NOTE',
            subject: `Flagged: invoice ${invoiceNumber || id}`,
            body: flagNote,
            invoiceId: id,
            participantId: selectedParticipantId || undefined,
            providerId: selectedProviderId || undefined,
          }),
        })
      }
      setShowFlagDialog(false)
      setFlagNote('')
      await loadInvoice()
    } finally {
      setActionLoading(null)
    }
  }

  // ── Line item helpers ───────────────────────────────────────────────────────

  function updateLine(idx: number, field: keyof FormLine, value: string | number): void {
    setLines((prev) => {
      const updated = [...prev]
      const line = { ...(updated[idx] as FormLine) }
      if (field === 'quantity') {
        line.quantity = typeof value === 'string' ? parseFloat(value) || 0 : value
      } else if (field === 'unitPriceCents') {
        line.unitPriceCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : value)
      } else if (field === 'totalCents') {
        line.totalCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : value)
      } else if (field === 'gstCents') {
        line.gstCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : value)
      } else if (field === 'supportItemCode' || field === 'supportItemName' || field === 'categoryCode' || field === 'serviceDate') {
        line[field] = String(value)
      }
      // Auto-calculate total from qty × unit price (if both are set)
      if (field === 'quantity' || field === 'unitPriceCents') {
        line.totalCents = Math.round(line.quantity * line.unitPriceCents)
      }
      updated[idx] = line
      return updated
    })
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(idx: number): void {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isEditable = invoice?.status === 'RECEIVED' || invoice?.status === 'PENDING_REVIEW'
  const canApprove = isEditable && !!selectedParticipantId

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading invoice…
        </div>
      </DashboardShell>
    )
  }

  if (!invoice) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center gap-4 py-16">
          <FileWarning className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">Invoice not found.</p>
          <Button asChild variant="outline">
            <Link href="/invoices/review">Back to Email Triage</Link>
          </Button>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <PageHeader
        title={`Review Invoice ${invoice.invoiceNumber === 'PENDING' ? '(Pending)' : invoice.invoiceNumber}`}
        description={invoice.sourceEmail ? `From: ${invoice.sourceEmail}` : 'Manually uploaded invoice'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/invoices/review">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back
              </Link>
            </Button>
            {isEditable && (
              <>
                <Button variant="outline" onClick={() => void handleSaveDraft()} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save Draft'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowFlagDialog(true)}
                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
                  Flag
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectDialog(true)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Reject
                </Button>
                <Button
                  onClick={() => void handleApprove()}
                  disabled={!canApprove || actionLoading === 'approve'}
                  title={!selectedParticipantId ? 'Assign a participant before approving' : undefined}
                >
                  <CheckCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  {actionLoading === 'approve' ? 'Approving…' : 'Approve'}
                </Button>
              </>
            )}
            {!isEditable && (
              <Badge variant={invoice.status === 'APPROVED' ? 'default' : 'secondary'}>
                {invoice.status}
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: PDF Preview ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Invoice Document
          </h2>
          <div className="rounded-lg border bg-muted/30 overflow-hidden" style={{ height: '70vh' }}>
            {pdfLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                Loading PDF…
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                title="Invoice PDF"
                className="h-full w-full"
                aria-label="Invoice PDF preview"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                <FileWarning className="h-8 w-8 opacity-40" aria-hidden="true" />
                <span>No document attached</span>
              </div>
            )}
          </div>
          {invoice.aiConfidence !== null && (
            <p className="text-xs text-muted-foreground">
              AI extraction confidence:{' '}
              <span className="font-medium">{Math.round(invoice.aiConfidence * 100)}%</span>
            </p>
          )}
        </div>

        {/* ── Right: Edit Form ───────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Invoice header */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="inv-number">Invoice number</Label>
                  <Input
                    id="inv-number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-2026-001"
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-date">Invoice date</Label>
                  <Input
                    id="inv-date"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="inv-subtotal">Subtotal ($)</Label>
                  <Input
                    id="inv-subtotal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={subtotalStr}
                    onChange={(e) => setSubtotalStr(e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-gst">GST ($)</Label>
                  <Input
                    id="inv-gst"
                    type="number"
                    min="0"
                    step="0.01"
                    value={gstStr}
                    onChange={(e) => setGstStr(e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-total">Total ($)</Label>
                  <Input
                    id="inv-total"
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalStr}
                    onChange={(e) => setTotalStr(e.target.value)}
                    disabled={!isEditable}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Participant / Provider / Plan */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="participant-select">
                  Participant{' '}
                  <span className="text-xs text-muted-foreground">(required to approve)</span>
                </Label>
                <Select
                  value={selectedParticipantId}
                  onValueChange={(val) => {
                    setSelectedParticipantId(val)
                    setSelectedPlanId('') // reset plan when participant changes
                  }}
                  disabled={!isEditable}
                >
                  <SelectTrigger id="participant-select">
                    <SelectValue placeholder="Select participant…" />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} — {p.ndisNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="provider-select">Provider</Label>
                <Select
                  value={selectedProviderId}
                  onValueChange={setSelectedProviderId}
                  disabled={!isEditable}
                >
                  <SelectTrigger id="provider-select">
                    <SelectValue placeholder="Select provider…" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (ABN {p.abn})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedParticipantId && plans.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="plan-select">Plan</Label>
                  <Select
                    value={selectedPlanId}
                    onValueChange={setSelectedPlanId}
                    disabled={!isEditable}
                  >
                    <SelectTrigger id="plan-select">
                      <SelectValue placeholder="Select plan…" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatDateAU(new Date(p.startDate))} – {formatDateAU(new Date(p.endDate))}{' '}
                          <Badge variant="outline" className="ml-1 text-xs">{p.status}</Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Support Items</CardTitle>
              {isEditable && (
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                  Add line
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Support code</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Qty</TableHead>
                      <TableHead className="text-xs">Unit price</TableHead>
                      <TableHead className="text-xs">Total</TableHead>
                      {isEditable && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isEditable ? 7 : 6} className="py-4 text-center text-sm text-muted-foreground">
                          No line items. Add support items above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      lines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="p-1">
                            {isEditable ? (
                              <Input
                                value={line.supportItemCode}
                                onChange={(e) => updateLine(idx, 'supportItemCode', e.target.value)}
                                className="h-7 text-xs font-mono w-32"
                                placeholder="01_011_…"
                                aria-label="Support item code"
                              />
                            ) : (
                              <span className="text-xs font-mono">{line.supportItemCode}</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1">
                            {isEditable ? (
                              <Input
                                value={line.supportItemName}
                                onChange={(e) => updateLine(idx, 'supportItemName', e.target.value)}
                                className="h-7 text-xs w-44"
                                placeholder="Description"
                                aria-label="Support item name"
                              />
                            ) : (
                              <span className="text-xs">{line.supportItemName}</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1">
                            {isEditable ? (
                              <Input
                                type="date"
                                value={line.serviceDate}
                                onChange={(e) => updateLine(idx, 'serviceDate', e.target.value)}
                                className="h-7 text-xs w-32"
                                aria-label="Service date"
                              />
                            ) : (
                              <span className="text-xs">{formatDateAU(new Date(line.serviceDate))}</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1">
                            {isEditable ? (
                              <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                className="h-7 text-xs w-16"
                                min="0"
                                step="0.5"
                                aria-label="Quantity"
                              />
                            ) : (
                              <span className="text-xs">{line.quantity}</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1">
                            {isEditable ? (
                              <Input
                                type="number"
                                value={centsToDollars(line.unitPriceCents).toFixed(2)}
                                onChange={(e) => updateLine(idx, 'unitPriceCents', dollarsToCents(parseFloat(e.target.value) || 0))}
                                className="h-7 text-xs w-24"
                                min="0"
                                step="0.01"
                                aria-label="Unit price"
                              />
                            ) : (
                              <span className="text-xs">{formatAUD(line.unitPriceCents)}</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1 text-xs font-mono">
                            {formatAUD(line.totalCents)}
                          </TableCell>
                          {isEditable && (
                            <TableCell className="p-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => removeLine(idx)}
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {lines.length > 0 && (
                <div className="border-t px-4 py-2 text-right text-sm font-medium">
                  Total: {formatAUD(lines.reduce((sum, l) => sum + l.totalCents, 0))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Reject dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent aria-describedby="reject-desc">
          <DialogHeader>
            <DialogTitle>Reject invoice</DialogTitle>
            <p id="reject-desc" className="text-sm text-muted-foreground">
              Provide a reason for rejection. This will be stored with the invoice.
            </p>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Provider not registered, duplicate invoice, incorrect amounts…"
              aria-required="true"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={!rejectReason.trim() || actionLoading === 'reject'}
            >
              {actionLoading === 'reject' ? 'Rejecting…' : 'Reject invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Flag dialog ────────────────────────────────────────────────────────── */}
      <Dialog open={showFlagDialog} onOpenChange={setShowFlagDialog}>
        <DialogContent aria-describedby="flag-desc">
          <DialogHeader>
            <DialogTitle>Flag for review</DialogTitle>
            <p id="flag-desc" className="text-sm text-muted-foreground">
              Save your current edits and add a note. The invoice stays in Pending Review.
            </p>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="flag-note">Note (optional)</Label>
            <Textarea
              id="flag-note"
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              rows={3}
              placeholder="e.g. Needs clarification on provider ABN, awaiting participant confirmation…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFlagDialog(false)}>Cancel</Button>
            <Button
              onClick={() => void handleFlag()}
              disabled={actionLoading === 'flag'}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {actionLoading === 'flag' ? 'Saving…' : 'Save & Flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
