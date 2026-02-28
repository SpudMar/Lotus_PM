'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParticipantCombobox } from '@/components/comboboxes/ParticipantCombobox'
import { ProviderCombobox } from '@/components/comboboxes/ProviderCombobox'
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
  StickyNote,
  FileText,
  Plus,
  Users,
  UserCheck,
  Send,
} from 'lucide-react'
import { formatDateTimeAU } from '@/lib/shared/dates'
import { EmailComposeModal } from '@/components/email/EmailComposeModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type CorrespondenceType =
  | 'EMAIL_INBOUND'
  | 'EMAIL_OUTBOUND'
  | 'SMS_INBOUND'
  | 'SMS_OUTBOUND'
  | 'NOTE'
  | 'PHONE_CALL'

interface Coordinator {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
}

interface Assignment {
  id: string
  isActive: boolean
  organisation: string | null
  assignedAt: string
  participant: {
    id: string
    firstName: string
    lastName: string
    ndisNumber: string
  }
}

interface Correspondence {
  id: string
  type: CorrespondenceType
  subject: string | null
  body: string
  fromAddress: string | null
  toAddress: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
  participant: { id: string; firstName: string; lastName: string } | null
  provider: { id: string; name: string } | null
  invoice: { id: string; invoiceNumber: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type: CorrespondenceType): React.JSX.Element {
  switch (type) {
    case 'EMAIL_INBOUND':
      return <Mail className="h-4 w-4 text-blue-500" aria-hidden="true" />
    case 'EMAIL_OUTBOUND':
      return <Mail className="h-4 w-4 text-blue-300" aria-hidden="true" />
    case 'SMS_INBOUND':
      return <MessageSquare className="h-4 w-4 text-green-500" aria-hidden="true" />
    case 'SMS_OUTBOUND':
      return <MessageSquare className="h-4 w-4 text-green-300" aria-hidden="true" />
    case 'PHONE_CALL':
      return <PhoneCall className="h-4 w-4 text-purple-500" aria-hidden="true" />
    case 'NOTE':
      return <StickyNote className="h-4 w-4 text-amber-500" aria-hidden="true" />
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  }
}

function typeLabel(type: CorrespondenceType): string {
  switch (type) {
    case 'EMAIL_INBOUND':
      return 'Email (inbound)'
    case 'EMAIL_OUTBOUND':
      return 'Email (outbound)'
    case 'SMS_INBOUND':
      return 'SMS (inbound)'
    case 'SMS_OUTBOUND':
      return 'SMS (outbound)'
    case 'PHONE_CALL':
      return 'Phone call'
    case 'NOTE':
      return 'Note'
    default:
      return type
  }
}

const NOTE_TYPE_OPTIONS: { value: CorrespondenceType; label: string }[] = [
  { value: 'NOTE', label: 'Note' },
  { value: 'PHONE_CALL', label: 'Phone call' },
  { value: 'EMAIL_INBOUND', label: 'Inbound email' },
  { value: 'EMAIL_OUTBOUND', label: 'Outbound email' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoordinatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): React.JSX.Element {
  const { id } = use(params)

  const [coordinator, setCoordinator] = useState<Coordinator | null>(null)
  const [loading, setLoading] = useState(true)

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(true)

  const [correspondence, setCorrespondence] = useState<Correspondence[]>([])
  const [corrLoading, setCorrLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | 'all'>('all')

  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteType, setNoteType] = useState<CorrespondenceType>('NOTE')
  const [noteSubject, setNoteSubject] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteFromAddress, setNoteFromAddress] = useState('')
  const [noteToAddress, setNoteToAddress] = useState('')
  const [noteParticipantId, setNoteParticipantId] = useState('')
  const [noteProviderId, setNoteProviderId] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)

  // Link participant state
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkParticipantId, setLinkParticipantId] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  // ── Load coordinator info ─────────────────────────────────────────────────

  useEffect(() => {
    void fetch(`/api/coordinators/${id}`)
      .then((r) => r.json())
      .then((j: Coordinator) => setCoordinator(j))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [id])

  // ── Load assignments ──────────────────────────────────────────────────────

  useEffect(() => {
    setAssignmentsLoading(true)
    void fetch(`/api/coordinators/${id}/assignments`)
      .then((r) => r.json())
      .then((j: Assignment[]) => setAssignments(j))
      .catch(() => null)
      .finally(() => setAssignmentsLoading(false))
  }, [id])

  // ── Load correspondence ───────────────────────────────────────────────────

  function loadCorrespondence(filterType?: CorrespondenceType | 'all'): void {
    setCorrLoading(true)
    const queryParams = new URLSearchParams({ coordinatorId: id, pageSize: '100' })
    if (filterType && filterType !== 'all') queryParams.set('type', filterType)
    void fetch(`/api/crm/correspondence?${queryParams.toString()}`)
      .then((r) => r.json())
      .then((j: { data: Correspondence[] }) => setCorrespondence(j.data ?? []))
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
      const isEmail =
        noteType === 'EMAIL_INBOUND' || noteType === 'EMAIL_OUTBOUND'
      await fetch('/api/crm/correspondence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          subject: noteSubject || undefined,
          body: noteBody,
          coordinatorId: id,
          fromAddress: isEmail && noteFromAddress ? noteFromAddress : undefined,
          toAddress: isEmail && noteToAddress ? noteToAddress : undefined,
          participantId: noteParticipantId || undefined,
          providerId: noteProviderId || undefined,
        }),
      })
      setShowNoteDialog(false)
      setNoteSubject('')
      setNoteBody('')
      setNoteType('NOTE')
      setNoteFromAddress('')
      setNoteToAddress('')
      setNoteParticipantId('')
      setNoteProviderId('')
      loadCorrespondence(typeFilter)
    } finally {
      setNoteSaving(false)
    }
  }

  function openNoteDialog(): void {
    setNoteType('NOTE')
    setNoteSubject('')
    setNoteBody('')
    setNoteFromAddress('')
    setNoteToAddress('')
    setNoteParticipantId('')
    setNoteProviderId('')
    setShowNoteDialog(true)
  }

  const isEmailType =
    noteType === 'EMAIL_INBOUND' || noteType === 'EMAIL_OUTBOUND'

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading coordinator…
        </div>
      </DashboardShell>
    )
  }

  if (!coordinator) {
    return (
      <DashboardShell>
        <div className="py-16 text-center text-muted-foreground">
          Coordinator not found.
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <PageHeader
        title={coordinator.name}
        description="Support Coordinator"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/coordinators">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Coordinators
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setShowLinkDialog(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Link Participant
            </Button>
            <Badge variant="secondary">Support Coordinator</Badge>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            Overview
            {assignments.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {assignments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="correspondence">
            Notes &amp; Correspondence
            {correspondence.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {correspondence.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {coordinator.email}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {coordinator.phone ?? '—'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Active Participant Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assignmentsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active assignments.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {assignments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <UserCheck
                          className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                        <Link
                          href={`/participants/${a.participant.id}`}
                          className="hover:underline text-primary"
                        >
                          {a.participant.firstName} {a.participant.lastName}
                        </Link>
                        {a.organisation && (
                          <span className="text-xs text-muted-foreground">
                            ({a.organisation})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {assignments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  All Assigned Participants ({assignments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2 text-left font-medium">
                          Participant
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          NDIS Number
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Organisation
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <Link
                              href={`/participants/${a.participant.id}`}
                              className="hover:underline text-primary"
                            >
                              {a.participant.firstName} {a.participant.lastName}
                            </Link>
                          </td>
                          <td className="px-4 py-2 font-mono text-muted-foreground">
                            {a.participant.ndisNumber}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {a.organisation ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Correspondence ───────────────────────────────────────────────── */}
        <TabsContent value="correspondence" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <Select
              value={typeFilter}
              onValueChange={(v) =>
                setTypeFilter(v as CorrespondenceType | 'all')
              }
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openNoteDialog}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add note
              </Button>
              <Button size="sm" onClick={() => setShowEmailModal(true)}>
                <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Send Email
              </Button>
            </div>
          </div>

          {corrLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : correspondence.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No correspondence yet.
            </div>
          ) : (
            <div className="space-y-3">
              {correspondence.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border p-4 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {typeIcon(entry.type)}
                      <span className="text-sm font-medium">
                        {typeLabel(entry.type)}
                      </span>
                      {entry.subject && (
                        <span className="text-sm text-muted-foreground">
                          — {entry.subject}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatDateTimeAU(new Date(entry.createdAt))}
                      </span>
                      {entry.createdBy && (
                        <span>by {entry.createdBy.name}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {entry.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {entry.participant && (
                      <Badge variant="outline" className="text-xs">
                        re:{' '}
                        <Link
                          href={`/participants/${entry.participant.id}`}
                          className="ml-1 hover:underline"
                        >
                          {entry.participant.firstName}{' '}
                          {entry.participant.lastName}
                        </Link>
                      </Badge>
                    )}
                    {entry.provider && (
                      <Badge variant="outline" className="text-xs">
                        re:{' '}
                        <Link
                          href={`/providers/${entry.provider.id}`}
                          className="ml-1 hover:underline"
                        >
                          {entry.provider.name}
                        </Link>
                      </Badge>
                    )}
                    {entry.invoice && (
                      <Badge variant="outline" className="text-xs">
                        Invoice {entry.invoice.invoiceNumber}
                      </Badge>
                    )}
                  </div>
                  {entry.fromAddress && (
                    <div className="text-xs text-muted-foreground">
                      From: {entry.fromAddress}
                    </div>
                  )}
                  {entry.toAddress && (
                    <div className="text-xs text-muted-foreground">
                      To: {entry.toAddress}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Email compose modal ──────────────────────────────────────────────── */}
      <EmailComposeModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSent={() => loadCorrespondence(typeFilter)}
        recipientEmail={coordinator.email}
        recipientName={coordinator.name}
        coordinatorId={id}
      />

      {/* ── Add note dialog ────────────────────────────────────────────────── */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent aria-describedby="note-desc">
          <DialogHeader>
            <DialogTitle>Add correspondence</DialogTitle>
            <p
              id="note-desc"
              className="text-sm text-muted-foreground"
            >
              Log a note, call, or message for {coordinator.name}.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="note-type">Type</Label>
              <Select
                value={noteType}
                onValueChange={(v) =>
                  setNoteType(v as CorrespondenceType)
                }
              >
                <SelectTrigger id="note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="note-subject">Subject (optional)</Label>
              <Input
                id="note-subject"
                type="text"
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value)}
                placeholder="Brief summary…"
                disabled={noteSaving}
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
                disabled={noteSaving}
              />
            </div>

            {isEmailType && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="note-from">From address</Label>
                  <Input
                    id="note-from"
                    type="email"
                    value={noteFromAddress}
                    onChange={(e) => setNoteFromAddress(e.target.value)}
                    placeholder="sender@example.com"
                    disabled={noteSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="note-to">To address</Label>
                  <Input
                    id="note-to"
                    type="email"
                    value={noteToAddress}
                    onChange={(e) => setNoteToAddress(e.target.value)}
                    placeholder="recipient@example.com"
                    disabled={noteSaving}
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>Link to participant (optional)</Label>
              <ParticipantCombobox
                value={noteParticipantId}
                onValueChange={setNoteParticipantId}
                disabled={noteSaving}
              />
            </div>

            <div className="space-y-1">
              <Label>Link to provider (optional)</Label>
              <ProviderCombobox
                value={noteProviderId}
                onValueChange={setNoteProviderId}
                disabled={noteSaving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNoteDialog(false)}
              disabled={noteSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddNote()}
              disabled={!noteBody.trim() || noteSaving}
            >
              {noteSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Participant Dialog ─────────────────────────────────────────── */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent aria-describedby="link-desc">
          <DialogHeader>
            <DialogTitle>Link Participant</DialogTitle>
            <p id="link-desc" className="text-sm text-muted-foreground">
              Assign a participant to this support coordinator.
            </p>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Participant</Label>
            <ParticipantCombobox value={linkParticipantId} onValueChange={setLinkParticipantId} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button
              disabled={!linkParticipantId || linkSaving}
              onClick={async () => {
                setLinkSaving(true)
                try {
                  const res = await fetch(`/api/coordinators/${id}/assignments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ participantId: linkParticipantId }),
                  })
                  if (res.ok) {
                    setShowLinkDialog(false)
                    setLinkParticipantId('')
                    // Reload assignments
                    setAssignmentsLoading(true)
                    void fetch(`/api/coordinators/${id}/assignments`)
                      .then((r) => r.json())
                      .then((j: Assignment[]) => setAssignments(j))
                      .catch(() => null)
                      .finally(() => setAssignmentsLoading(false))
                  }
                } finally {
                  setLinkSaving(false)
                }
              }}
            >
              {linkSaving ? 'Linking...' : 'Link Participant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
