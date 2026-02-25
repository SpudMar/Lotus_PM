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
  FileText,
  StickyNote,
  Plus,
  Receipt,
  AlertTriangle,
  Flag,
  CheckCircle2,
  Send,
  Pencil,
} from 'lucide-react'
import { formatDateAU, formatDateTimeAU } from '@/lib/shared/dates'
import { formatNdisNumber } from '@/lib/shared/ndis'
import { formatAUD } from '@/lib/shared/currency'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  invoiceApprovalEnabled?: boolean
  invoiceApprovalMethod?: 'APP' | 'EMAIL' | 'SMS' | null
  gender?: string | null
  disability?: string | null
  disabilityCategory?: string | null
  ndisRegistrationDate?: string | null
  alias?: string | null
}

// ── Flag types ───────────────────────────────────────────────────────────────

type FlagSeverity = 'ADVISORY' | 'BLOCKING'

interface CrmFlag {
  id: string
  severity: FlagSeverity
  reason: string
  createdBy: { firstName: string; lastName: string }
  createdAt: string
  resolvedAt: string | null
  resolvedBy: { firstName: string; lastName: string } | null
  resolveNote: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Other']
const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

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

// ── Inline edit form types ────────────────────────────────────────────────────

interface PersonalFormData {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  disabilityCategory: string
  alias: string
}

interface ContactFormData {
  email: string
  phone: string
  address: string
  suburb: string
  state: string
  postcode: string
}

interface NdisFormData {
  ndisNumber: string
  ndisRegistrationDate: string
}

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
  const [showEmailModal, setShowEmailModal] = useState(false)

  // -- Invoice approval preferences --
  const [approvalEnabled, setApprovalEnabled] = useState(false)
  const [approvalMethod, setApprovalMethod] = useState<'APP' | 'EMAIL' | 'SMS'>('APP')
  const [approvalSaving, setApprovalSaving] = useState(false)
  const [approvalLoaded, setApprovalLoaded] = useState(false)

  // Flag state
  const [flags, setFlags] = useState<CrmFlag[]>([])
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [showRaiseFlagDialog, setShowRaiseFlagDialog] = useState(false)
  const [flagSeverity, setFlagSeverity] = useState<FlagSeverity>('ADVISORY')
  const [flagReason, setFlagReason] = useState('')
  const [flagSaving, setFlagSaving] = useState(false)
  const [showResolveFlagDialog, setShowResolveFlagDialog] = useState(false)
  const [resolvingFlagId, setResolvingFlagId] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveLoading, setResolveLoading] = useState(false)

  // -- Inline editing state --
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [personalForm, setPersonalForm] = useState<PersonalFormData>({
    firstName: '', lastName: '', dateOfBirth: '', gender: '', disabilityCategory: '', alias: '',
  })
  const [contactForm, setContactForm] = useState<ContactFormData>({
    email: '', phone: '', address: '', suburb: '', state: '', postcode: '',
  })
  const [ndisForm, setNdisForm] = useState<NdisFormData>({
    ndisNumber: '', ndisRegistrationDate: '',
  })

  // ── Load data ─────────────────────────────────────────────────────────────

  function loadParticipant(): void {
    void fetch(`/api/crm/participants/${id}`)
      .then((r) => r.json())
      .then((j: { data: Participant }) => setParticipant(j.data))
      .catch(() => null)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadParticipant()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    if (!id) return
    void fetch(`/api/crm/participants/${id}/approval-preferences`)
      .then((r) => r.json())
      .then((j: { data: { invoiceApprovalEnabled: boolean; invoiceApprovalMethod: 'APP' | 'EMAIL' | 'SMS' | null } }) => {
        setApprovalEnabled(j.data.invoiceApprovalEnabled)
        setApprovalMethod(j.data.invoiceApprovalMethod ?? 'APP')
        setApprovalLoaded(true)
      })
      .catch(() => null)
  }, [id])

  // ── Flags ────────────────────────────────────────────────────────────────────────────

  function loadFlags(): void {
    setFlagsLoading(true)
    void fetch(`/api/crm/flags?participantId=${id}&includeResolved=true&limit=50`)
      .then((r) => r.json())
      .then((j: { flags: CrmFlag[] }) => setFlags(j.flags))
      .catch(() => null)
      .finally(() => setFlagsLoading(false))
  }

  useEffect(() => {
    loadFlags()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleRaiseFlag(): Promise<void> {
    if (!flagReason.trim()) return
    setFlagSaving(true)
    try {
      await fetch('/api/crm/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: flagSeverity, reason: flagReason, participantId: id }),
      })
      setShowRaiseFlagDialog(false)
      setFlagReason('')
      setFlagSeverity('ADVISORY')
      loadFlags()
    } finally {
      setFlagSaving(false)
    }
  }

  function handleOpenResolve(flagId: string): void {
    setResolvingFlagId(flagId)
    setResolveNote('')
    setShowResolveFlagDialog(true)
  }

  async function handleResolveFlag(): Promise<void> {
    if (!resolvingFlagId || !resolveNote.trim()) return
    setResolveLoading(true)
    try {
      await fetch(`/api/crm/flags/${resolvingFlagId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: resolveNote }),
      })
      setShowResolveFlagDialog(false)
      setResolvingFlagId(null)
      setResolveNote('')
      loadFlags()
    } finally {
      setResolveLoading(false)
    }
  }

  async function handleSaveApprovalPreferences(): Promise<void> {
    setApprovalSaving(true)
    try {
      await fetch(`/api/crm/participants/${id}/approval-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceApprovalEnabled: approvalEnabled,
          invoiceApprovalMethod: approvalEnabled ? approvalMethod : null,
        }),
      })
    } catch {
      // Silently ignore -- user can retry
    } finally {
      setApprovalSaving(false)
    }
  }

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

  // ── Inline editing helpers ──────────────────────────────────────────────────

  function startEdit(section: string): void {
    if (!participant) return
    setEditingSection(section)
    if (section === 'personal') {
      setPersonalForm({
        firstName: participant.firstName,
        lastName: participant.lastName,
        dateOfBirth: participant.dateOfBirth ? participant.dateOfBirth.slice(0, 10) : '',
        gender: participant.gender ?? '',
        disabilityCategory: participant.disabilityCategory ?? '',
        alias: participant.alias ?? '',
      })
    } else if (section === 'contact') {
      setContactForm({
        email: participant.email ?? '',
        phone: participant.phone ?? '',
        address: participant.address ?? '',
        suburb: participant.suburb ?? '',
        state: participant.state ?? '',
        postcode: participant.postcode ?? '',
      })
    } else if (section === 'ndis') {
      setNdisForm({
        ndisNumber: participant.ndisNumber,
        ndisRegistrationDate: participant.ndisRegistrationDate
          ? participant.ndisRegistrationDate.slice(0, 10)
          : '',
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
      if (section === 'personal') {
        payload = {
          firstName: personalForm.firstName,
          lastName: personalForm.lastName,
          dateOfBirth: personalForm.dateOfBirth,
          gender: personalForm.gender || undefined,
          disabilityCategory: personalForm.disabilityCategory || undefined,
          alias: personalForm.alias || undefined,
        }
      } else if (section === 'contact') {
        payload = {
          email: contactForm.email || '',
          phone: contactForm.phone || undefined,
          address: contactForm.address || undefined,
          suburb: contactForm.suburb || undefined,
          state: contactForm.state || undefined,
          postcode: contactForm.postcode || undefined,
        }
      } else if (section === 'ndis') {
        payload = {
          ndisNumber: ndisForm.ndisNumber,
          ndisRegistrationDate: ndisForm.ndisRegistrationDate || null,
        }
      }

      const res = await fetch(`/api/crm/participants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setEditingSection(null)
        loadParticipant()
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

      {/* ── Active flag banners ───────────────────────────────────────────────────────── */}
      {flags.filter(f => !f.resolvedAt).map(f => (
        <Alert
          key={f.id}
          className={f.severity === 'BLOCKING'
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-yellow-300 bg-yellow-50 text-yellow-900'}
        >
          <AlertTriangle
            className={`h-4 w-4 ${f.severity === 'BLOCKING' ? 'text-red-600' : 'text-yellow-600'}`}
            aria-hidden="true"
          />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              <span className="font-medium">{f.severity === 'BLOCKING' ? 'Blocking flag: ' : 'Advisory flag: '}</span>
              {f.reason}
            </span>
            <button
              className="text-xs underline shrink-0 opacity-70 hover:opacity-100"
              onClick={() => handleOpenResolve(f.id)}
            >
              Resolve
            </button>
          </AlertDescription>
        </Alert>
      ))}

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
          <TabsTrigger value="approval">
            Invoice Approval
          </TabsTrigger>
          <TabsTrigger value="flags">
            Flags
            {flags.filter(f => !f.resolvedAt).length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-xs">
                {flags.filter(f => !f.resolvedAt).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* ── Personal Information ────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold">Personal Information</CardTitle>
                {editingSection !== 'personal' ? (
                  <Button variant="outline" size="sm" onClick={() => startEdit('personal')}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                    <Button size="sm" onClick={() => void saveSection('personal')} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {editingSection === 'personal' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="edit-firstName" className="text-xs">First name</Label>
                        <Input
                          id="edit-firstName"
                          value={personalForm.firstName}
                          onChange={(e) => setPersonalForm(prev => ({ ...prev, firstName: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-lastName" className="text-xs">Last name</Label>
                        <Input
                          id="edit-lastName"
                          value={personalForm.lastName}
                          onChange={(e) => setPersonalForm(prev => ({ ...prev, lastName: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-alias" className="text-xs">Preferred name</Label>
                      <Input
                        id="edit-alias"
                        value={personalForm.alias}
                        onChange={(e) => setPersonalForm(prev => ({ ...prev, alias: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-dob" className="text-xs">Date of birth</Label>
                      <Input
                        id="edit-dob"
                        type="date"
                        value={personalForm.dateOfBirth}
                        onChange={(e) => setPersonalForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-gender" className="text-xs">Gender</Label>
                      <Select
                        value={personalForm.gender}
                        onValueChange={(v) => setPersonalForm(prev => ({ ...prev, gender: v }))}
                      >
                        <SelectTrigger id="edit-gender" className="h-8 text-sm">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDER_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-disabilityCategory" className="text-xs">Disability category</Label>
                      <Input
                        id="edit-disabilityCategory"
                        value={personalForm.disabilityCategory}
                        onChange={(e) => setPersonalForm(prev => ({ ...prev, disabilityCategory: e.target.value }))}
                        className="h-8 text-sm"
                        placeholder="Optional"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span>{participant.firstName} {participant.lastName}</span>
                    </div>
                    {participant.alias && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Preferred name</span>
                        <span>{participant.alias}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date of birth</span>
                      <span>{formatDateAU(new Date(participant.dateOfBirth))}</span>
                    </div>
                    {participant.gender && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gender</span>
                        <span>{participant.gender}</span>
                      </div>
                    )}
                    {participant.disabilityCategory && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Disability category</span>
                        <span>{participant.disabilityCategory}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Contact Details ─────────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold">Contact Details</CardTitle>
                {editingSection !== 'contact' ? (
                  <Button variant="outline" size="sm" onClick={() => startEdit('contact')}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                    <Button size="sm" onClick={() => void saveSection('contact')} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {editingSection === 'contact' ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="edit-email" className="text-xs">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-phone" className="text-xs">Phone</Label>
                      <Input
                        id="edit-phone"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-address" className="text-xs">Street address</Label>
                      <Input
                        id="edit-address"
                        value={contactForm.address}
                        onChange={(e) => setContactForm(prev => ({ ...prev, address: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="edit-suburb" className="text-xs">Suburb</Label>
                        <Input
                          id="edit-suburb"
                          value={contactForm.suburb}
                          onChange={(e) => setContactForm(prev => ({ ...prev, suburb: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-state" className="text-xs">State</Label>
                        <Select
                          value={contactForm.state}
                          onValueChange={(v) => setContactForm(prev => ({ ...prev, state: v }))}
                        >
                          <SelectTrigger id="edit-state" className="h-8 text-sm">
                            <SelectValue placeholder="State" />
                          </SelectTrigger>
                          <SelectContent>
                            {AU_STATES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-postcode" className="text-xs">Postcode</Label>
                        <Input
                          id="edit-postcode"
                          value={contactForm.postcode}
                          onChange={(e) => setContactForm(prev => ({ ...prev, postcode: e.target.value }))}
                          className="h-8 text-sm"
                          maxLength={4}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      {participant.email ?? '—'}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {participant.phone ?? '—'}
                    </div>
                    <div className="text-muted-foreground">
                      {participant.address
                        ? `${participant.address}, ${participant.suburb ?? ''} ${participant.state ?? ''} ${participant.postcode ?? ''}`
                        : '—'}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── NDIS Details ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">NDIS Details</CardTitle>
              {editingSection !== 'ndis' ? (
                <Button variant="outline" size="sm" onClick={() => startEdit('ndis')}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit} disabled={editSaving}>Cancel</Button>
                  <Button size="sm" onClick={() => void saveSection('ndis')} disabled={editSaving}>
                    {editSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {editingSection === 'ndis' ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="edit-ndisNumber" className="text-xs">NDIS number</Label>
                    <Input
                      id="edit-ndisNumber"
                      value={ndisForm.ndisNumber}
                      onChange={(e) => setNdisForm(prev => ({ ...prev, ndisNumber: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-ndisRegDate" className="text-xs">NDIS registration date</Label>
                    <Input
                      id="edit-ndisRegDate"
                      type="date"
                      value={ndisForm.ndisRegistrationDate}
                      onChange={(e) => setNdisForm(prev => ({ ...prev, ndisRegistrationDate: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NDIS number</span>
                    <span className="font-mono">{formatNdisNumber(participant.ndisNumber)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Registration date</span>
                    <span>
                      {participant.ndisRegistrationDate
                        ? formatDateAU(new Date(participant.ndisRegistrationDate))
                        : '—'}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Plan Manager Assignment ───────────────────────────────────── */}
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

          {/* Plans */}
          {participant.plans.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Plans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {participant.plans.map((plan) => (
                    <Link key={plan.id} href={`/plans/${plan.id}`} className="flex items-center justify-between text-sm rounded-md px-2 py-1 -mx-2 hover:bg-muted transition-colors">
                      <span>
                        {formatDateAU(new Date(plan.startDate))} – {formatDateAU(new Date(plan.endDate))}
                      </span>
                      <Badge variant="outline" className="text-xs">{plan.status}</Badge>
                    </Link>
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowNoteDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add note
              </Button>
              {participant.email && (
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

        {/* -- Invoice Approval Preferences -- */}
        <TabsContent value="approval" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Approval Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!approvalLoaded ? (
                <div className="text-sm text-muted-foreground">Loading preferences...</div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      id="approval-enabled"
                      type="checkbox"
                      checked={approvalEnabled}
                      onChange={(e) => setApprovalEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="approval-enabled" className="cursor-pointer">
                      Enable invoice approval for this participant
                    </Label>
                  </div>
                  {approvalEnabled && (
                    <div className="space-y-1">
                      <Label htmlFor="approval-method">Notification method</Label>
                      <Select
                        value={approvalMethod}
                        onValueChange={(v) => setApprovalMethod(v as 'APP' | 'EMAIL' | 'SMS')}
                      >
                        <SelectTrigger id="approval-method" className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="APP">In-App notification</SelectItem>
                          <SelectItem value="EMAIL">Email link</SelectItem>
                          <SelectItem value="SMS">SMS link</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    onClick={() => void handleSaveApprovalPreferences()}
                    disabled={approvalSaving}
                    size="sm"
                  >
                    {approvalSaving ? 'Saving...' : 'Save preferences'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Flags tab ──────────────────────────────────────────────────────────────── */}
        <TabsContent value="flags" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Flags placed on this participant. Blocking flags prevent invoice approval until resolved.
            </p>
            <Button size="sm" onClick={() => setShowRaiseFlagDialog(true)}>
              <Flag className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Raise flag
            </Button>
          </div>
          {flagsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading flags…</div>
          ) : flags.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No flags.</div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Severity</th>
                    <th className="px-4 py-2 text-left font-medium">Reason</th>
                    <th className="px-4 py-2 text-left font-medium">Raised by</th>
                    <th className="px-4 py-2 text-left font-medium">Raised at</th>
                    <th className="px-4 py-2 text-left font-medium">Resolved by</th>
                    <th className="px-4 py-2 text-left font-medium">Resolved at</th>
                    <th className="px-4 py-2 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Badge
                          variant={f.severity === 'BLOCKING' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {f.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 max-w-xs truncate">{f.reason}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {f.createdBy.firstName} {f.createdBy.lastName}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDateAU(new Date(f.createdAt))}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {f.resolvedBy ? `${f.resolvedBy.firstName} ${f.resolvedBy.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {f.resolvedAt ? formatDateAU(new Date(f.resolvedAt)) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {!f.resolvedAt && (
                          <Button size="sm" variant="outline" onClick={() => handleOpenResolve(f.id)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Resolve
                          </Button>
                        )}
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
      {/* ── Raise flag dialog ────────────────────────────────────────────────────── */}
      <Dialog open={showRaiseFlagDialog} onOpenChange={setShowRaiseFlagDialog}>
        <DialogContent aria-describedby="raise-flag-desc">
          <DialogHeader>
            <DialogTitle>Raise a flag</DialogTitle>
            <p id="raise-flag-desc" className="text-sm text-muted-foreground">
              Flags are visible to all staff and shown on invoices linked to this participant.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="flag-severity">Severity</Label>
              <Select value={flagSeverity} onValueChange={(v) => setFlagSeverity(v as FlagSeverity)}>
                <SelectTrigger id="flag-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADVISORY">Advisory (informational, does not block approval)</SelectItem>
                  <SelectItem value="BLOCKING">Blocking (requires PM acknowledgment to approve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="flag-reason">Reason <span aria-hidden="true">*</span></Label>
              <Textarea
                id="flag-reason"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={3}
                placeholder="Describe the reason for this flag…"
                aria-required="true"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRaiseFlagDialog(false)}>Cancel</Button>
            <Button
              onClick={() => void handleRaiseFlag()}
              disabled={!flagReason.trim() || flagSaving}
            >
              {flagSaving ? 'Saving…' : 'Raise flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve flag dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={showResolveFlagDialog} onOpenChange={setShowResolveFlagDialog}>
        <DialogContent aria-describedby="resolve-flag-desc">
          <DialogHeader>
            <DialogTitle>Resolve flag</DialogTitle>
            <p id="resolve-flag-desc" className="text-sm text-muted-foreground">
              Provide a resolution note explaining why this flag has been cleared.
            </p>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="resolve-note">Resolution note <span aria-hidden="true">*</span></Label>
            <Textarea
              id="resolve-note"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={3}
              placeholder="Explain how this flag was resolved…"
              aria-required="true"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveFlagDialog(false)}>Cancel</Button>
            <Button
              onClick={() => void handleResolveFlag()}
              disabled={!resolveNote.trim() || resolveLoading}
            >
              {resolveLoading ? 'Resolving…' : 'Resolve flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Email compose modal ──────────────────────────────────────────────── */}
      <EmailComposeModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSent={() => loadCorrespondence(typeFilter)}
        recipientEmail={participant.email ?? ''}
        recipientName={`${participant.firstName} ${participant.lastName}`}
        participantId={id}
      />
    </DashboardShell>
  )
}
