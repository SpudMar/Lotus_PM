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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, CheckCircle, XCircle, Flag, Plus, Trash2, FileWarning, AlertCircle, AlertTriangle, ShieldAlert, Mail, Upload, Zap, Building2 } from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'
import { formatAUD, centsToDollars, dollarsToCents } from '@/lib/shared/currency'
import { PdfViewer } from '@/components/shared/PdfViewer'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BudgetLineRef {
  id: string
  categoryCode: string
  categoryName: string
  allocatedCents: number
  spentCents: number
  reservedCents: number
  saCommittedCents: number
  remainingCents: number
}

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
  budgetLineId?: string | null
  budgetLine?: { id: string; categoryCode: string; allocatedCents: number; spentCents: number } | null
  // Pattern-learning fields -- WS-F4
  suggestedItemCode?: string | null
  suggestedConfidence?: number | null
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
  matchConfidence: number | null
  matchMethod: string | null
  ingestSource: string | null
  s3Key: string | null
  participantId: string | null
  providerId: string | null
  planId: string | null
  participant: { id: string; firstName: string; lastName: string; ndisNumber: string } | null
  provider: { id: string; name: string; abn: string } | null
  plan: {
    id: string
    startDate: string
    endDate: string
    budgetLines?: { id: string; categoryCode: string; categoryName: string; allocatedCents: number; spentCents: number }[]
  } | null
  lines: InvoiceLine[]
  processingCategory: string | null
  aiProcessingResult: Record<string, unknown> | null
  processedAt: string | null
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

// ── Validation types ─────────────────────────────────────────────────────────

interface ValidationIssue {
  code: string
  message: string
  lineId?: string
}

interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

interface ActiveFlag {
  id: string
  severity: 'ADVISORY' | 'BLOCKING'
  reason: string
  createdBy: { id: string; name: string }
}


// -- Per-line decision types -- Wave 3 ---

type LineDecisionStatus = 'APPROVE' | 'REJECT' | 'ADJUST'

interface LineDecisionState {
  decision: LineDecisionStatus
  reason?: string
  adjustedAmountCents?: number
}

type FormLine = InvoiceLine

// ── Match confidence helpers ───────────────────────────────────────────────────

type MatchTier = 'verified' | 'needs-verify' | 'no-match'

function getMatchTier(confidence: number | null, method: string | null): MatchTier {
  if (confidence === null || confidence === undefined || method === 'NONE' || method === null) return 'no-match'
  if (confidence >= 0.9) return 'verified'
  return 'needs-verify'
}

function getMatchTierStyles(tier: MatchTier): { dot: string; bg: string; text: string; badge: string } {
  switch (tier) {
    case 'verified':
      return { dot: 'bg-green-500', bg: 'bg-green-50 border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800 border-green-300' }
    case 'needs-verify':
      return { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-300' }
    case 'no-match':
      return { dot: 'bg-red-500', bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800 border-red-300' }
  }
}

function getMatchMethodLabel(method: string | null): string {
  switch (method) {
    case 'ABN_EXACT': return 'ABN match'
    case 'EMAIL_EXACT': return 'Email match'
    case 'EMAIL_DOMAIN': return 'Email domain'
    case 'HISTORICAL': return 'Historical'
    case 'NDIS_NUMBER': return 'NDIS# match'
    case 'MANUAL': return 'Manual'
    default: return 'No match'
  }
}

function getMatchTierLabel(tier: MatchTier): string {
  switch (tier) {
    case 'verified': return 'Verified'
    case 'needs-verify': return 'Verify'
    case 'no-match': return 'Assign'
  }
}

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
    budgetLineId: null,
  }
}

// ── Attention items helper ─────────────────────────────────────────────────────

interface AttentionItem {
  label: string
  severity: 'warning' | 'error'
}

function computeAttentionItems(
  invoice: Invoice,
  lines: FormLine[],
  selectedParticipantId: string,
  selectedPlanId: string,
): AttentionItem[] {
  const items: AttentionItem[] = []

  // Provider match quality
  if (!invoice.providerId && !invoice.provider) {
    items.push({ label: 'No provider assigned', severity: 'error' })
  } else if (invoice.matchConfidence !== null && invoice.matchConfidence < 1.0 && invoice.ingestSource === 'EMAIL') {
    const pct = Math.round(invoice.matchConfidence * 100)
    items.push({ label: `Provider matched by ${getMatchMethodLabel(invoice.matchMethod).toLowerCase()} (${pct}%) -- please verify`, severity: 'warning' })
  }

  // Participant
  if (!selectedParticipantId) {
    items.push({ label: 'No participant assigned', severity: 'error' })
  }

  // Lines missing support codes
  const missingCodes = lines.filter((l) => !l.supportItemCode).length
  if (missingCodes > 0) {
    items.push({ label: `${missingCodes} line item${missingCodes > 1 ? 's' : ''} missing support codes`, severity: 'warning' })
  }

  // Lines missing budget links (only if a plan is selected)
  if (selectedPlanId) {
    const missingBudget = lines.filter((l) => !l.budgetLineId).length
    if (missingBudget > 0) {
      items.push({ label: `${missingBudget} line item${missingBudget > 1 ? 's' : ''} missing budget line links`, severity: 'warning' })
    }
  }

  // Low AI confidence
  if (invoice.aiConfidence !== null && invoice.aiConfidence < 0.7) {
    items.push({ label: `Low AI extraction confidence (${Math.round(invoice.aiConfidence * 100)}%)`, severity: 'warning' })
  }

  return items
}


// ── Create Provider from Invoice inline form ──────────────────────────────────

function CreateProviderFromInvoiceForm({
  invoiceId,
  onCreated,
  onCancel,
}: {
  invoiceId: string
  onCreated: (providerId: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [abn, setAbn] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [abnInfo, setAbnInfo] = useState<{ entityName: string; abnStatus: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAbnBlur(): Promise<void> {
    const clean = abn.replace(/\s/g, '')
    if (clean.length !== 11) return
    try {
      const res = await fetch(`/api/crm/providers/abn-lookup?abn=${clean}`)
      if (res.status === 503) return // ABR not configured — skip
      if (!res.ok) return
      const json = (await res.json()) as { data: { entityName: string; abnStatus: string } | null }
      if (json.data) {
        setAbnInfo(json.data)
        if (!name) setName(json.data.entityName)
      }
    } catch {
      // ABR lookup failure is non-fatal
    }
  }

  async function handleCreate(): Promise<void> {
    setCreating(true)
    setFormError(null)
    try {
      const res = await fetch('/api/crm/providers/create-from-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn: abn || undefined, name: name || undefined, email: email || undefined, invoiceId }),
      })
      const json = (await res.json()) as { data?: { providerId: string }; error?: string }
      if (!res.ok) {
        setFormError(json.error ?? 'Failed to create provider.')
        return
      }
      if (json.data?.providerId) {
        onCreated(json.data.providerId)
      }
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cp-abn">ABN (optional)</Label>
        <Input
          id="cp-abn"
          placeholder="e.g. 51 824 753 556"
          value={abn}
          onChange={(e) => setAbn(e.target.value)}
          onBlur={() => void handleAbnBlur()}
        />
        {abnInfo && (
          <p className="text-xs text-emerald-600">{abnInfo.entityName} ({abnInfo.abnStatus})</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-name">Business Name</Label>
        <Input
          id="cp-name"
          placeholder="Provider name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-email">Email (optional)</Label>
        <Input
          id="cp-email"
          type="email"
          placeholder="invoices@provider.com.au"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {formError && <p className="text-sm text-red-600">{formError}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={creating}>
          Cancel
        </Button>
        <Button onClick={() => void handleCreate()} disabled={creating || (!abn && !name)}>
          {creating ? 'Creating...' : 'Create Provider'}
        </Button>
      </DialogFooter>
    </div>
  )
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

  // Budget lines for the selected plan
  const [budgetLines, setBudgetLines] = useState<BudgetLineRef[]>([])

  // Dropdowns
  const [participants, setParticipants] = useState<Participant[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [plans, setPlans] = useState<Plan[]>([])

  // Dialogs
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [flagNote, setFlagNote] = useState('')
  const [showCreateProviderModal, setShowCreateProviderModal] = useState(false)

  // Validation & flags
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [activeFlags, setActiveFlags] = useState<ActiveFlag[]>([])
  const [flagsAcknowledged, setFlagsAcknowledged] = useState(false)

  // Per-line decisions -- Wave 3
  const [lineDecisions, setLineDecisions] = useState<Record<string, LineDecisionState>>({})
  const [expandedLineAction, setExpandedLineAction] = useState<{ idx: number; type: 'reject' | 'adjust' } | null>(null)
  const [pendingLineReason, setPendingLineReason] = useState('')
  const [pendingLineAdjusted, setPendingLineAdjusted] = useState('')

  // AI processing
  const [aiProcessing, setAiProcessing] = useState(false)

  // -- Data loading ---

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
        setLineDecisions({})
        setExpandedLineAction(null)
        setLines(inv.lines.map((l) => ({

          ...l,
          serviceDate: new Date(l.serviceDate).toISOString().split('T')[0] ?? '',
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadInvoice()
  }, [loadInvoice])

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

  // Load budget lines when plan changes
  useEffect(() => {
    if (!selectedPlanId) {
      setBudgetLines([])
      return
    }
    void fetch(`/api/plans/${selectedPlanId}/budget-lines`)
      .then(r => r.json())
      .then((j: { data: BudgetLineRef[] }) => setBudgetLines(j.data ?? []))
      .catch(() => setBudgetLines([]))
  }, [selectedPlanId])

  // Load active flags whenever participant or provider changes
  useEffect(() => {
    const flagParams = new URLSearchParams()
    if (selectedParticipantId) flagParams.set('participantId', selectedParticipantId)
    if (selectedProviderId) flagParams.set('providerId', selectedProviderId)
    if (!selectedParticipantId && !selectedProviderId) {
      setActiveFlags([])
      return
    }
    void fetch(`/api/crm/flags?${flagParams.toString()}`)
      .then(r => r.json())
      .then((j: { data: ActiveFlag[] }) => setActiveFlags(j.data ?? []))
      .catch(() => null)
  }, [selectedParticipantId, selectedProviderId])

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
        budgetLineId: l.budgetLineId || undefined,
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

  async function handleApprove(force = false): Promise<void> {
    setActionLoading('approve')
    setValidationResult(null)
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
        body: JSON.stringify({
          action: 'approve',
          planId: selectedPlanId || undefined,
          force,
          lineDecisions: Object.keys(lineDecisions).length > 0
            ? Object.entries(lineDecisions).map(([lineId, ld]) => ({
                lineId,
                decision: ld.decision,
                reason: ld.reason,
                adjustedAmountCents: ld.adjustedAmountCents,
              }))
            : undefined,
        }),
      })
      if (res.ok) {
        router.push('/invoices/review')
        return
      }
      if (res.status === 422) {
        const json = await res.json() as { code: string; validation: ValidationResult }
        if (json.code === 'VALIDATION_FAILED') {
          setValidationResult(json.validation)
          return
        }
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

  async function handleRunAiAnalysis(): Promise<void> {
    setAiProcessing(true)
    try {
      await fetch(`/api/invoices/${id}/process`, { method: 'POST' })
      await loadInvoice()
    } finally {
      setAiProcessing(false)
    }
  }

  // ── Line item helpers ───────────────────────────────────────────────────────

  function updateLine(idx: number, field: keyof FormLine, value: string | number | null): void {
    setLines((prev) => {
      const updated = [...prev]
      const line = { ...(updated[idx] as FormLine) }
      if (field === 'quantity') {
        line.quantity = typeof value === 'string' ? parseFloat(value) || 0 : (value ?? 0) as number
      } else if (field === 'unitPriceCents') {
        line.unitPriceCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : (value ?? 0) as number)
      } else if (field === 'totalCents') {
        line.totalCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : (value ?? 0) as number)
      } else if (field === 'gstCents') {
        line.gstCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : (value ?? 0) as number)
      } else if (field === 'budgetLineId') {
        line.budgetLineId = value === null || value === '' ? null : String(value)
      } else if (field === 'supportItemCode' || field === 'supportItemName' || field === 'categoryCode' || field === 'serviceDate') {
        line[field] = String(value ?? '')
      }
      // Auto-calculate total from qty * unit price (if both are set)
      if (field === 'quantity' || field === 'unitPriceCents') {
        line.totalCents = Math.round(line.quantity * line.unitPriceCents)
      }
      updated[idx] = line
      return updated
    })
  }

  function applySuggestedCode(idx: number): void {
    const line = lines[idx]
    if (line?.suggestedItemCode) {
      updateLine(idx, 'supportItemCode', line.suggestedItemCode)
    }
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(idx: number): void {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isEditable = invoice?.status === 'RECEIVED' || invoice?.status === 'PENDING_REVIEW'
  const blockingFlags = activeFlags.filter((f) => f.severity === 'BLOCKING')
  const advisoryFlags = activeFlags.filter((f) => f.severity === 'ADVISORY')
  const hasBlockingFlags = blockingFlags.length > 0
  const canApprove = isEditable && !!selectedParticipantId && (!hasBlockingFlags || flagsAcknowledged)

  // Attention items computation
  const attentionItems = invoice ? computeAttentionItems(invoice, lines, selectedParticipantId, selectedPlanId) : []

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading invoice...
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

  // Match card values
  const isEmailIngested = invoice.ingestSource === 'EMAIL'
  const providerTier = isEmailIngested ? getMatchTier(invoice.matchConfidence, invoice.matchMethod) : 'verified'
  const providerStyles = getMatchTierStyles(providerTier)
  const participantTier: MatchTier = invoice.participantId ? 'verified' : 'no-match'
  const participantStyles = getMatchTierStyles(participantTier)
  const aiTier: MatchTier = invoice.aiConfidence !== null
    ? (invoice.aiConfidence >= 0.7 ? 'verified' : 'needs-verify')
    : 'no-match'
  const aiStyles = getMatchTierStyles(aiTier)

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
                  {saving ? 'Saving...' : 'Save Draft'}
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
                  {actionLoading === 'approve' ? 'Approving...' : (() => {
                    const decisions = Object.values(lineDecisions)
                    if (decisions.length === 0) return 'Approve'
                    const approvedCount = decisions.filter((d) => d.decision === 'APPROVE').length
                    const rejectedCount = decisions.filter((d) => d.decision === 'REJECT').length
                    const adjustedCount = decisions.filter((d) => d.decision === 'ADJUST').length
                    const parts: string[] = []
                    if (approvedCount > 0) parts.push(approvedCount + ' approved')
                    if (adjustedCount > 0) parts.push(adjustedCount + ' adjusted')
                    if (rejectedCount > 0) parts.push(rejectedCount + ' rejected')
                    return 'Approve Invoice (' + parts.join(', ') + ')'
                  })()}
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

      {/* ── BLOCKING flag banners ────────────────────────────────────────── */}
      {blockingFlags.length > 0 && (
        <div className="space-y-2">
          {blockingFlags.map((flag, idx) => (
            <Alert key={idx} variant="destructive">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Blocking Flag -- Approval Restricted</AlertTitle>
              <AlertDescription>{flag.reason}</AlertDescription>
            </Alert>
          ))}
          {isEditable && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <Checkbox
                id="flags-acknowledged"
                checked={flagsAcknowledged}
                onCheckedChange={(v) => setFlagsAcknowledged(v === true)}
                aria-label="Acknowledge blocking flags to enable approval"
              />
              <label htmlFor="flags-acknowledged" className="text-sm cursor-pointer">
                I acknowledge these blocking flags and take responsibility for approving this invoice
              </label>
            </div>
          )}
        </div>
      )}

      {/* ── ADVISORY flag banners ─────────────────────────────────────────── */}
      {advisoryFlags.length > 0 && (
        <div className="space-y-2">
          {advisoryFlags.map((flag, idx) => (
            <Alert key={idx} className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <AlertTitle className="text-amber-800">Advisory Notice</AlertTitle>
              <AlertDescription className="text-amber-700">{flag.reason}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* ── Unknown Provider Banner ─────────────────────────────────────── */}
      {!invoice.providerId && isEditable && (
        <Alert className="border-blue-300 bg-blue-50 text-blue-900">
          <Building2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <AlertTitle className="text-blue-800">Unknown Provider</AlertTitle>
          <AlertDescription className="text-blue-700 flex items-center justify-between gap-4 flex-wrap">
            <span>
              {invoice.provider
                ? 'Provider matched with low confidence. Consider creating a formal provider record.'
                : 'No provider matched to this invoice. Create a provider record to enable full processing.'}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
              onClick={() => setShowCreateProviderModal(true)}
            >
              <Building2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Create Provider
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Create Provider Modal */}
      {showCreateProviderModal && (
        <Dialog open={showCreateProviderModal} onOpenChange={setShowCreateProviderModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Provider from Invoice</DialogTitle>
            </DialogHeader>
            <CreateProviderFromInvoiceForm
              invoiceId={invoice.id}
              onCreated={(providerId) => {
                setSelectedProviderId(providerId)
                setShowCreateProviderModal(false)
                void loadInvoice()
              }}
              onCancel={() => setShowCreateProviderModal(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Step 2: Auto-Match Results Card ──────────────────────────────── */}
      <Card data-testid="match-confidence-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" aria-hidden="true" />
            Auto-Match Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isEmailIngested ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Manually uploaded -- no auto-match performed</span>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Source email */}
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-sm font-medium truncate">{invoice.sourceEmail ?? 'Unknown'}</p>
                </div>
              </div>

              {/* Provider match */}
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${providerStyles.dot}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Provider</p>
                  {invoice.provider ? (
                    <>
                      <p className="text-sm font-medium truncate">{invoice.provider.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${providerStyles.badge}`}>
                          {getMatchMethodLabel(invoice.matchMethod)}
                        </Badge>
                        <span className={`text-xs font-medium ${providerStyles.text}`}>
                          {invoice.matchConfidence !== null ? `${Math.round(invoice.matchConfidence * 100)}%` : '--'}
                        </span>
                        <span className={`text-xs ${providerStyles.text}`}>
                          {getMatchTierLabel(providerTier)}
                          {providerTier === 'needs-verify' && ' \u26A0'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-red-600">Not matched -- assign manually</p>
                  )}
                </div>
              </div>

              {/* Participant match */}
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${participantStyles.dot}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Participant</p>
                  {invoice.participant ? (
                    <>
                      <p className="text-sm font-medium truncate">
                        {invoice.participant.firstName} {invoice.participant.lastName}
                      </p>
                      <span className={`text-xs ${participantStyles.text}`}>
                        NDIS# match - Verified
                      </span>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-red-600">Not matched</p>
                      <span className="text-xs text-red-600">Assign manually {'\u26A0'}</span>
                    </>
                  )}
                </div>
              </div>

              {/* AI Extraction confidence */}
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${aiStyles.dot}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">AI Extraction</p>
                  {invoice.aiConfidence !== null ? (
                    <>
                      <p className="text-sm font-medium">{Math.round(invoice.aiConfidence * 100)}%</p>
                      {invoice.aiConfidence < 0.7 && (
                        <span className="text-xs text-amber-600">Low {'\u26A0'}</span>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">N/A</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Analysis Card ──────────────────────────────────────────────── */}
      <Card data-testid="ai-analysis-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" aria-hidden="true" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.processingCategory ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {invoice.processingCategory === 'AUTO_APPROVED' && (
                  <Badge className="bg-green-100 text-green-800 border-green-300 border">Auto Approved</Badge>
                )}
                {invoice.processingCategory === 'PARTICIPANT_APPROVAL' && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-300 border">Participant Approval Required</Badge>
                )}
                {invoice.processingCategory === 'NEEDS_CODES' && (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 border">Needs NDIS Codes</Badge>
                )}
                {invoice.processingCategory === 'NEEDS_REVIEW' && (
                  <Badge className="bg-orange-100 text-orange-800 border-orange-300 border">Needs Review</Badge>
                )}
                {invoice.processingCategory === 'AUTO_REJECTED' && (
                  <Badge className="bg-red-100 text-red-800 border-red-300 border">Auto Rejected</Badge>
                )}
                {invoice.processedAt && (
                  <span className="text-xs text-muted-foreground">
                    Processed {formatDateAU(new Date(invoice.processedAt))}
                  </span>
                )}
              </div>
            </div>
          ) : (invoice.status === 'RECEIVED' || invoice.status === 'PENDING_REVIEW') ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">No AI analysis has been run on this invoice yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRunAiAnalysis()}
                disabled={aiProcessing}
              >
                {aiProcessing ? (
                  <>
                    <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                    Analysing...
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Run AI Analysis
                  </>
                )}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">AI analysis not available for this invoice status.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Step 3: Attention-Needed Summary Banner ──────────────────────── */}
      {attentionItems.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900" data-testid="attention-banner">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <AlertTitle className="text-amber-800">
            {attentionItems.length} item{attentionItems.length !== 1 ? 's' : ''} need{attentionItems.length === 1 ? 's' : ''} review
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-700">
              {attentionItems.map((item, idx) => (
                <li key={idx} className={item.severity === 'error' ? 'text-red-700 font-medium' : ''}>
                  {item.label}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Validation errors from approval attempt ──────────────────────── */}
      {validationResult !== null && (
        <div className="space-y-2">
          {validationResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Approval Blocked -- Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  {validationResult.errors.map((e, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-xs">[{e.code}]</span> {e.message}
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => void handleApprove(true)}
                    disabled={actionLoading === 'approve'}
                  >
                    Force Approve Anyway (override warnings)
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {validationResult.warnings.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <AlertTitle className="text-amber-800">Validation Warnings</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc list-inside space-y-1 text-amber-700">
                  {validationResult.warnings.map((w, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-xs">[{w.code}]</span> {w.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: PDF Preview ──────────────────────────────────────────── */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Invoice Document
          </h2>
          <PdfViewer invoiceId={id} height="80vh" />
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
                    <SelectValue placeholder="Select participant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} -- {p.ndisNumber}
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
                    <SelectValue placeholder="Select provider..." />
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
                      <SelectValue placeholder="Select plan..." />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatDateAU(new Date(p.startDate))} - {formatDateAU(new Date(p.endDate))}{' '}
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
                      <TableHead className="text-xs">Budget line</TableHead>
                      {isEditable && <TableHead className="text-xs">Decision</TableHead>}
                      {isEditable && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isEditable ? 9 : 7} className="py-4 text-center text-sm text-muted-foreground">
                          No line items. Add support items above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      lines.map((line, idx) => {
                        const isMissingCode = !line.supportItemCode
                        const hasSuggestion = !!line.suggestedItemCode

                        return (
                          <TableRow
                            key={idx}
                            className={(() => {
                              const lineId = line.id
                              const ld = lineId ? lineDecisions[lineId] : undefined
                              if (ld?.decision === 'REJECT') return 'border-l-4 border-l-red-400 bg-red-50/40 opacity-75'
                              if (ld?.decision === 'ADJUST') return 'border-l-4 border-l-amber-400 bg-amber-50/50'
                              if (ld?.decision === 'APPROVE') return 'border-l-4 border-l-green-400 bg-green-50/40'
                              if (isMissingCode) return 'border-l-4 border-l-amber-400 bg-amber-50/50'
                              return ''
                            })()}
                          >
                            <TableCell className="p-1">
                              {isEditable ? (
                                <div className="flex flex-col gap-0.5">
                                  <Input
                                    value={line.supportItemCode}
                                    onChange={(e) => updateLine(idx, 'supportItemCode', e.target.value)}
                                    className={`h-7 text-xs font-mono w-32 ${isMissingCode ? 'border-amber-400' : ''}`}
                                    placeholder="01_011_..."
                                    aria-label="Support item code"
                                  />
                                  {hasSuggestion && isMissingCode && (
                                    <button
                                      type="button"
                                      onClick={() => applySuggestedCode(idx)}
                                      className="inline-flex items-center gap-1 rounded-md bg-blue-100 hover:bg-blue-200 border border-blue-300 px-1.5 py-0.5 text-[10px] text-blue-800 font-medium transition-colors cursor-pointer w-fit"
                                      title="Click to apply this suggested code"
                                    >
                                      <span>Use: </span>
                                      <span className="font-mono">{line.suggestedItemCode}</span>
                                      {line.suggestedConfidence !== null && line.suggestedConfidence !== undefined && (
                                        <span className="text-blue-600">({Math.round(line.suggestedConfidence * 100)}%)</span>
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-mono">{line.supportItemCode || '--'}</span>
                                  {hasSuggestion && isMissingCode && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Suggested: <span className="font-mono">{line.suggestedItemCode}</span>
                                      {line.suggestedConfidence !== null && line.suggestedConfidence !== undefined && (
                                        <> ({Math.round(line.suggestedConfidence * 100)}% match)</>
                                      )}
                                    </span>
                                  )}
                                </div>
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
                            <TableCell className="p-1">
                              {isEditable ? (
                                selectedPlanId && budgetLines.length > 0 ? (
                                  <Select
                                    value={line.budgetLineId ?? ''}
                                    onValueChange={(val) => updateLine(idx, 'budgetLineId', val === '__none__' ? null : val)}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-44" aria-label="Budget line">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">
                                        <span className="text-muted-foreground">None</span>
                                      </SelectItem>
                                      {budgetLines.map((bl) => (
                                        <SelectItem key={bl.id} value={bl.id}>
                                          {bl.categoryCode} - {bl.categoryName} ({formatAUD(bl.remainingCents)} left)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">
                                    {selectedPlanId ? 'No budget lines' : 'Select plan first'}
                                  </span>
                                )
                              ) : (
                                <span className="text-xs">
                                  {line.budgetLine
                                    ? `${line.budgetLine.categoryCode}`
                                    : '--'}
                                </span>
                              )}
                            </TableCell>
                            {isEditable && (
                              <TableCell className="p-1">
                                {(() => {
                                  const lineId = line.id
                                  if (!lineId) return null
                                  const ld = lineDecisions[lineId]
                                  const decisionStatus = ld?.decision ?? null
                                  return (
                                    <div className="flex flex-col gap-0.5 min-w-[130px]">
                                      <div className="flex gap-0.5 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setLineDecisions((prev) => ({ ...prev, [lineId]: { decision: 'APPROVE' } }))
                                            if (expandedLineAction?.idx === idx) setExpandedLineAction(null)
                                          }}
                                          className={'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ' + (decisionStatus === 'APPROVE' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200')}
                                          aria-label="Approve this line"
                                          title="Approve this line"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setExpandedLineAction(expandedLineAction?.idx === idx && expandedLineAction.type === 'reject' ? null : { idx, type: 'reject' })
                                            setPendingLineReason(ld?.reason ?? '')
                                          }}
                                          className={'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ' + (decisionStatus === 'REJECT' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 hover:bg-red-200')}
                                          aria-label="Reject this line"
                                          title="Reject this line"
                                        >
                                          Reject
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setExpandedLineAction(expandedLineAction?.idx === idx && expandedLineAction.type === 'adjust' ? null : { idx, type: 'adjust' })
                                            setPendingLineAdjusted(ld?.adjustedAmountCents !== undefined ? centsToDollars(ld.adjustedAmountCents).toFixed(2) : centsToDollars(line.totalCents).toFixed(2))
                                          }}
                                          className={'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ' + (decisionStatus === 'ADJUST' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200')}
                                          aria-label="Adjust this line amount"
                                          title="Adjust this line amount"
                                        >
                                          Adjust
                                        </button>
                                      </div>
                                      {expandedLineAction?.idx === idx && expandedLineAction.type === 'reject' && (
                                        <div className="flex gap-1 mt-0.5">
                                          <input
                                            type="text"
                                            className="h-6 w-28 rounded border border-red-300 px-1 text-[10px]"
                                            placeholder="Reason..."
                                            value={pendingLineReason}
                                            onChange={(e) => setPendingLineReason(e.target.value)}
                                            aria-label="Rejection reason"
                                          />
                                          <button
                                            type="button"
                                            className="rounded bg-red-600 px-1.5 text-[10px] text-white hover:bg-red-700"
                                            onClick={() => {
                                              setLineDecisions((prev) => ({ ...prev, [lineId]: { decision: 'REJECT', reason: pendingLineReason } }))
                                              setExpandedLineAction(null)
                                            }}
                                          >
                                            Set
                                          </button>
                                        </div>
                                      )}
                                      {expandedLineAction?.idx === idx && expandedLineAction.type === 'adjust' && (
                                        <div className="flex gap-1 mt-0.5">
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="h-6 w-20 rounded border border-amber-300 px-1 text-[10px]"
                                            value={pendingLineAdjusted}
                                            onChange={(e) => setPendingLineAdjusted(e.target.value)}
                                            aria-label="Adjusted amount"
                                          />
                                          <button
                                            type="button"
                                            className="rounded bg-amber-600 px-1.5 text-[10px] text-white hover:bg-amber-700"
                                            onClick={() => {
                                              setLineDecisions((prev) => ({ ...prev, [lineId]: { decision: 'ADJUST', adjustedAmountCents: dollarsToCents(parseFloat(pendingLineAdjusted) || 0) } }))
                                              setExpandedLineAction(null)
                                            }}
                                          >
                                            Set
                                          </button>
                                        </div>
                                      )}
                                      {decisionStatus === 'REJECT' && ld?.reason && (
                                        <span className="text-[9px] text-red-700 truncate max-w-[130px]" title={ld.reason}>{ld.reason}</span>
                                      )}
                                      {decisionStatus === 'ADJUST' && ld?.adjustedAmountCents !== undefined && (
                                        <span className="text-[9px] text-amber-700">{'Adjusted: ' + formatAUD(ld.adjustedAmountCents)}</span>
                                      )}
                                    </div>
                                  )
                                })()}
                              </TableCell>
                            )}
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
                        )
                      })
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
              placeholder="e.g. Provider not registered, duplicate invoice, incorrect amounts..."
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
              {actionLoading === 'reject' ? 'Rejecting...' : 'Reject invoice'}
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
              placeholder="e.g. Needs clarification on provider ABN, awaiting participant confirmation..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFlagDialog(false)}>Cancel</Button>
            <Button
              onClick={() => void handleFlag()}
              disabled={actionLoading === 'flag'}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {actionLoading === 'flag' ? 'Saving...' : 'Save & Flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
