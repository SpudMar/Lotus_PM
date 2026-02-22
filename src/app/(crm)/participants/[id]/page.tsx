'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Mail,
  Phone,
  MessageSquare,
  PhoneCall,
  FileText,
  StickyNote,
  Plus,
  Receipt,
} from 'lucide-react'
import { formatDateAU, formatDateTimeAU } from '@/lib/shared/dates'
import { formatNdisNumber } from '@/lib/shared/ndis'
import { formatAUD } from '@/lib/shared/currency'

// ── Types ─────────────────────────────────────────────────────────────────────

type CorrespondenceType =
  | 'EMAIL_INBOUND'
  | 'EMAIL_OUTBOUND'
  | 'SMS_INBOUND'
  | 'SMS_OUTBOUND'
  | 'NOTE'
  | 'PHONE_CALL'

interface Correspondence {
  id: string
  type: CorrespondenceType
  subject: string | null
  body: string
  fromAddress: string | null
  toAddress: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
  invoice: { id: string; invoiceNumber: string; totalCents: number } | null
}

interface Participant {
  id: string
  ndisNumber: string
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string | null
  phone: string | null
  address: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  isActive: boolean
  onboardingStatus: string | null
  ingestSource: string | null
  assignedTo: { id: string; name: string; email: string } | null
  plans: { id: string; startDate: string; endDate: string; status: string }[]
  invoices: { id: string; invoiceNumber: string; totalCents: number; status: string; receivedAt: string }[]
}

// ── Correspondence icon/label helpers ─────────────────────────────────────────

function typeIcon(type: CorrespondenceType): React.JSX.Element {
  switch (type) {
    case 'EMAIL_INBOUND': return <Mail className="h-4 w-4 text-blue-500" aria-hidden="true" />
    case 'EMAIL_OUTBOUND': return <Mail className="h-4 w-4 text-blue-300" aria-hidden="true" />
    case 'SMS_INBOUND': return <MessageSquare className="h-4 w-4 text-green-500" aria-hidden="true" />
    case 'SMS_OUTBOUND': return <MessageSquare className="h-4 w-4 text-green-300" aria-hidden="true" />
    case 'PHONE_CALL': return <PhoneCall className="h-4 w-4 text-purple-500" aria-hidden="true" />
    case 'NOTE': return <StickyNote className="h-4 w-4 text-amber-500" aria-hidden="true" />
    default: return <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  }
}

function typeLabel(type: CorrespondenceType): string {
  switch (type) {
    case 'EMAIL_INBOUND': return 'Email (inbound)'
    case 'EMAIL_OUTBOUND': return 'Email (outbound)'
    case 'SMS_INBOUND': return 'SMS (inbound)'
    case 'SMS_OUTBOUND': return 'SMS (outbound)'
    case 'PHONE_CALL': return 'Phone call'
    case 'NOTE': return 'Note'
    default: return type
  }
}

const NOTE_TYPE_OPTIONS: { value: CorrespondenceType; label: string }[] = [
  { value: 'NOTE', label: 'Note' },
  { value: 'PHONE_CALL', label: 'Phone call' },
  { value: 'EMAIL_OUTBOUND', label: 'Outbound email' },
  { value: 'SMS_OUTBOUND', label: 'Outbound SMS' },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): React.JSX.Element {
  const { id } = use(params)

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(true)

  const [correspondence, setCorrespondence] = useState<Correspondence[]>([])
  const [corrLoading, setCorrLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | 'all'>('all')

  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteType, setNoteType] = useState<CorrespondenceType>('NOTE')
  const [noteSubject, setNoteSubject] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [activatingOnboarding, setActivatingOnboarding] = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    void fetch(`/api/crm/participants/${id}`)
      .then((r) => r.json())
      .then((j: { data: Participant }) => setParticipant(j.data))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [id])

  function loadCorrespondence(filterType?: CorrespondenceType | 'all'): void {
    setCorrLoading(true)
    const params = new URLSearchParams({ participantId: id, pageSize: '100' })
    if (filterType && filterType !== 'all') params.set('type', filterType)
    void fetch(`/api/crm/correspondence?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { data: Correspondence[] }) => setCorrespondence(j.data))
      .catch(() => null)
      .finally(() => setCorrLoading(false))
  }

  useEffect(() => {
    loadCorrespondence(typeFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, typeFilter])

  // ── Add note ──────────────────────────────────────────────────────────────

  async function handleAddNote(): Promise<void> {
    if (!noteBody.trim()) return
    setNoteSaving(true)
    try {
      await fetch('/api/crm/correspondence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          subject: noteSubject || undefined,
          body: noteBody,
          participantId: id,
        }),
      })
      setShowNoteDialog(false)
      setNoteSubject('')
      setNoteBody('')
      setNoteType('NOTE')
      loadCorrespondence(typeFilter)
    } finally {
      setNoteSaving(false)
    }
  }

  async function handleActivateOnboarding(): Promise<void> {
    setActivatingOnboarding(true)
    try {
      const res = await fetch(`/api/crm/participants/${id}/activate-onboarding`, {
        method: 'POST',
      })
      if (res.ok) {
        const updated = await fetch(`/api/crm/participants/${id}`)
        if (updated.ok) {
          const json = await updated.json() as { data: Participant }
          setParticipant(json.data)
        }
      }
    } finally {
      setActivatingOnboarding(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading participant…
        </div>
      </DashboardShell>
    )
  }

  if (!participant) {
    return (
      <DashboardShell>
        <div className="py-16 text-center text-muted-foreground">Participant not found.</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <PageHeader
        title={`${participant.firstName} ${participant.lastName}`}
        description={`NDIS ${formatNdisNumber(participant.ndisNumber)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/participants">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Participants
              </Link>
            </Button>
            <Badge variant={participant.isActive ? 'default' : 'secondary'}>
              {participant.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        }
      />

      {/* ── WordPress onboarding banner ──────────────────────────────────── */}
      {participant.onboardingStatus === 'DRAFT' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Complete Onboarding</p>
            <p className="text-sm text-amber-700 mt-0.5">
              This participant was created via the WordPress intake form and is pending activation.
              Review their details, then click Activate to make them an active participant.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => void handleActivateOnboarding()}
            disabled={activatingOnboarding}
            className="shrink-0"
          >
            {activatingOnboarding ? 'Activating...' : 'Activate Participant'}
          </Button>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="correspondence">
            Correspondence
            {correspondence.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{correspondence.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices">
            Invoices
            {participant.invoices.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{participant.invoices.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {participant.email ?? '—'}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {participant.phone ?? '—'}
                </div>
                {participant.address && (
                  <div className="text-muted-foreground">
                    {participant.address}, {participant.suburb} {participant.state} {participant.postcode}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Plan Manager</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {participant.assignedTo ? (
                  <div>
                    <div className="font-medium text-foreground">{participant.assignedTo.name}</div>
                    <div>{participant.assignedTo.email}</div>
                  </div>
                ) : (
                  <span>Unassigned</span>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Plans */}
          {participant.plans.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Plans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {participant.plans.map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between text-sm">
                      <span>
                        {formatDateAU(new Date(plan.startDate))} – {formatDateAU(new Date(plan.endDate))}
                      </span>
                      <Badge variant="outline" className="text-xs">{plan.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Correspondence ─────────────────────────────────────────────────── */}
        <TabsContent value="correspondence" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as CorrespondenceType | 'all')}
              >
                <SelectTrigger className="w-[200px]" aria-label="Filter by type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="EMAIL_INBOUND">Email (inbound)</SelectItem>
                  <SelectItem value="EMAIL_OUTBOUND">Email (outbound)</SelectItem>
                  <SelectItem value="SMS_INBOUND">SMS (inbound)</SelectItem>
                  <SelectItem value="SMS_OUTBOUND">SMS (outbound)</SelectItem>
                  <SelectItem value="PHONE_CALL">Phone call</SelectItem>
                  <SelectItem value="NOTE">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => setShowNoteDialog(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add note
            </Button>
          </div>

          {corrLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : correspondence.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No correspondence yet.
            </div>
          ) : (
            <div className="space-y-3">
              {correspondence.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {typeIcon(entry.type)}
                      <span className="text-sm font-medium">{typeLabel(entry.type)}</span>
                      {entry.subject && (
                        <span className="text-sm text-muted-foreground">— {entry.subject}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateTimeAU(new Date(entry.createdAt))}</span>
                      {entry.createdBy && <span>by {entry.createdBy.name}</span>}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {entry.body}
                  </p>
                  {entry.invoice && (
                    <div className="flex items-center gap-2 pt-1">
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <Link
                        href={`/invoices/review/${entry.invoice.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Invoice {entry.invoice.invoiceNumber} — {formatAUD(entry.invoice.totalCents)}
                      </Link>
                    </div>
                  )}
                  {entry.fromAddress && (
                    <div className="text-xs text-muted-foreground">From: {entry.fromAddress}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Invoices ──────────────────────────────────────────────────────── */}
        <TabsContent value="invoices" className="mt-4">
          {participant.invoices.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No invoices.</div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Invoice #</th>
                    <th className="px-4 py-2 text-left font-medium">Total</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {participant.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline text-primary">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono">{formatAUD(inv.totalCents)}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDateAU(new Date(inv.receivedAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add note dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent aria-describedby="note-desc">
          <DialogHeader>
            <DialogTitle>Add correspondence</DialogTitle>
            <p id="note-desc" className="text-sm text-muted-foreground">
              Log a note, phone call, or message for {participant.firstName} {participant.lastName}.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="note-type">Type</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as CorrespondenceType)}>
                <SelectTrigger id="note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="note-subject">Subject (optional)</Label>
              <input
                id="note-subject"
                type="text"
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Brief summary…"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="note-body">
                Content <span aria-hidden="true">*</span>
              </Label>
              <Textarea
                id="note-body"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={4}
                placeholder="Details of the communication…"
                aria-required="true"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Cancel</Button>
            <Button
              onClick={() => void handleAddNote()}
              disabled={!noteBody.trim() || noteSaving}
            >
              {noteSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
