'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  StickyNote,
  FileText,
  Plus,
  Receipt,
  Building2,
  Send,
  Pencil,
  Info,
} from 'lucide-react'
import { formatDateAU, formatDateTimeAU } from '@/lib/shared/dates'
import { formatAUD } from '@/lib/shared/currency'
import { EmailComposeModal } from '@/components/email/EmailComposeModal'

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

interface Provider {
  id: string
  name: string
  abn: string
  email: string | null
  phone: string | null
  address: string | null
  ndisRegistered: boolean
  registrationNo: string | null
  bankBsb: string | null
  bankAccount: string | null
  bankAccountName: string | null
  isActive: boolean
  invoices: {
    id: string
    invoiceNumber: string
    totalCents: number
    status: string
    receivedAt: string
    participant: { firstName: string; lastName: string } | null
  }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Inline edit form types ────────────────────────────────────────────────────

interface BusinessFormData {
  name: string
  abn: string
  email: string
  phone: string
}

interface AddressFormData {
  address: string
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): React.JSX.Element {
  const { id } = use(params)

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)

  const [correspondence, setCorrespondence] = useState<Correspondence[]>([])
  const [corrLoading, setCorrLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | 'all'>('all')

  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [noteType, setNoteType] = useState<CorrespondenceType>('NOTE')
  const [noteSubject, setNoteSubject] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)

  // -- Inline editing state --
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [businessForm, setBusinessForm] = useState<BusinessFormData>({
    name: '', abn: '', email: '', phone: '',
  })
  const [addressForm, setAddressForm] = useState<AddressFormData>({
    address: '',
  })

  // ── Load data ─────────────────────────────────────────────────────────────

  function loadProvider(): void {
    void fetch(`/api/crm/providers/${id}`)
      .then((r) => r.json())
      .then((j: { data: Provider }) => setProvider(j.data))
      .catch(() => null)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadProvider()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function loadCorrespondence(filterType?: CorrespondenceType | 'all'): void {
    setCorrLoading(true)
    const params = new URLSearchParams({ providerId: id, pageSize: '100' })
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
          providerId: id,
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

  // ── Inline editing helpers ──────────────────────────────────────────────────

  function startEdit(section: string): void {
    if (!provider) return
    setEditingSection(section)
    if (section === 'business') {
      setBusinessForm({
        name: provider.name,
        abn: provider.abn,
        email: provider.email ?? '',
        phone: provider.phone ?? '',
      })
    } else if (section === 'address') {
      setAddressForm({
        address: provider.address ?? '',
      })
    }
  }

  function cancelEdit(): void {
    setEditingSection(null)
  }

  async function saveSection(section: string): Promise<void> {
    setEditSaving(true)
    try {
      let payload: Record<string, unknown> = {}
      if (section === 'business') {
        payload = {
          name: businessForm.name,
          abn: businessForm.abn,
          email: businessForm.email || '',
          phone: businessForm.phone || undefined,
        }
      } else if (section === 'address') {
        payload = {
          address: addressForm.address || undefined,
        }
      }

      const res = await fetch(`/api/crm/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setEditingSection(null)
        loadProvider()
      }
    } finally {
      setEditSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading provider…
        </div>
      </DashboardShell>
    )
  }

  if (!provider) {
    return (
      <DashboardShell>
        <div className="py-16 text-center text-muted-foreground">Provider not found.</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <PageHeader
        title={provider.name}
        description={`ABN ${provider.abn}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/providers">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Providers
              </Link>
            </Button>
            <Badge variant={provider.isActive ? 'default' : 'secondary'}>
              {provider.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {provider.ndisRegistered && (
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                NDIS Registered
              </Badge>
            )}
          </div>
        }
      />

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
            {provider.invoices.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{provider.invoices.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* ── Business Details ────────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold">Business Details</CardTitle>
                {editingSection !== 'business' ? (
                  <Button variant="outline" size="sm" onClick={() => startEdit('business')}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                    <Button size="sm" onClick={() => void saveSection('business')} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {editingSection === 'business' ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="edit-name" className="text-xs">Business name</Label>
                      <Input
                        id="edit-name"
                        value={businessForm.name}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, name: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-abn" className="text-xs">ABN</Label>
                      <Input
                        id="edit-abn"
                        value={businessForm.abn}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, abn: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-email" className="text-xs">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={businessForm.email}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, email: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-phone" className="text-xs">Phone</Label>
                      <Input
                        id="edit-phone"
                        value={businessForm.phone}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Business name</span>
                      <span className="font-medium">{provider.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ABN</span>
                      <span className="font-mono">{provider.abn}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      {provider.email ?? '—'}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {provider.phone ?? '—'}
                    </div>
                    {provider.registrationNo && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Registration No</span>
                        <span>{provider.registrationNo}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Address ─────────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold">Address</CardTitle>
                {editingSection !== 'address' ? (
                  <Button variant="outline" size="sm" onClick={() => startEdit('address')}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                    <Button size="sm" onClick={() => void saveSection('address')} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {editingSection === 'address' ? (
                  <div className="space-y-1">
                    <Label htmlFor="edit-address" className="text-xs">Full address</Label>
                    <Input
                      id="edit-address"
                      value={addressForm.address}
                      onChange={(e) => setAddressForm(prev => ({ ...prev, address: e.target.value }))}
                      className="h-8 text-sm"
                      placeholder="123 Example St, Sydney NSW 2000"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    {provider.address ?? '—'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Banking Details (read-only) ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Banking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {provider.bankBsb ? (
                <>
                  <div className="flex justify-between">
                    <span>BSB</span>
                    <span className="font-mono">{provider.bankBsb}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Account</span>
                    <span className="font-mono">{provider.bankAccount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Account name</span>
                    <span>{provider.bankAccountName}</span>
                  </div>
                </>
              ) : (
                <span>No bank details recorded</span>
              )}
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 mt-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-muted-foreground">
                  Sensitive banking details should be updated via the provider portal or by contacting the provider directly.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Correspondence ─────────────────────────────────────────────────── */}
        <TabsContent value="correspondence" className="mt-4">
          <div className="flex items-center justify-between mb-4">
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowNoteDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add note
              </Button>
              {provider.email && (
                <Button size="sm" onClick={() => setShowEmailModal(true)}>
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Send Email
                </Button>
              )}
            </div>
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
          {provider.invoices.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No invoices.</div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Invoice #</th>
                    <th className="px-4 py-2 text-left font-medium">Participant</th>
                    <th className="px-4 py-2 text-left font-medium">Total</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {provider.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline text-primary">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {inv.participant
                          ? `${inv.participant.firstName} ${inv.participant.lastName}`
                          : '—'}
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
              Log a note, phone call, or message for {provider.name}.
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

      {/* ── Email compose modal ──────────────────────────────────────────────── */}
      <EmailComposeModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSent={() => loadCorrespondence(typeFilter)}
        recipientEmail={provider.email ?? ''}
        recipientName={provider.name}
        providerId={id}
      />
    </DashboardShell>
  )
}
