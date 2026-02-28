'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import Link from 'next/link'
import { UserCheck, Plus, Pencil, UserX, Search } from 'lucide-react'
import { ContextActionMenu, emailAction, navigateAction } from '@/components/shared/ContextActionMenu'
import { useContextEmail } from '@/hooks/useContextEmail'
import { EmailComposeModal } from '@/components/email/EmailComposeModal'

interface CoordinatorRow {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  _count?: { coordinatorAssignments: number }
}

type DialogMode = 'create' | 'edit' | 'deactivate' | null

function canWrite(role: string | undefined): boolean {
  return role === 'GLOBAL_ADMIN' || role === 'PLAN_MANAGER'
}

export default function CoordinatorsPage(): React.JSX.Element {
  const { data: session } = useSession()
  const { emailState, openEmail, closeEmail } = useContextEmail()
  const [coordinators, setCoordinators] = useState<CoordinatorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [selected, setSelected] = useState<CoordinatorRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  // Create form
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createPassword, setCreatePassword] = useState('')

  // Edit form
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')

  async function loadCoordinators(): Promise<void> {
    try {
      const res = await fetch('/api/coordinators')
      if (res.ok) {
        const json = await res.json()
        setCoordinators(json as CoordinatorRow[])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCoordinators()
  }, [])

  function openCreate(): void {
    setCreateName('')
    setCreateEmail('')
    setCreatePhone('')
    setCreatePassword('')
    setDialogError(null)
    setDialogMode('create')
  }

  function openEdit(coordinator: CoordinatorRow): void {
    setSelected(coordinator)
    setEditName(coordinator.name)
    setEditEmail(coordinator.email)
    setEditPhone(coordinator.phone ?? '')
    setDialogError(null)
    setDialogMode('edit')
  }

  function openDeactivate(coordinator: CoordinatorRow): void {
    setSelected(coordinator)
    setDialogError(null)
    setDialogMode('deactivate')
  }

  function closeDialog(): void {
    setDialogMode(null)
    setSelected(null)
    setDialogError(null)
  }

  async function handleCreate(): Promise<void> {
    setSubmitting(true)
    setDialogError(null)
    try {
      const res = await fetch('/api/coordinators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          phone: createPhone || undefined,
          password: createPassword,
        }),
      })
      if (res.status === 201) {
        closeDialog()
        setLoading(true)
        await loadCoordinators()
        return
      }
      const json = await res.json() as { error?: string }
      setDialogError(json.error ?? 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(): Promise<void> {
    if (!selected) return
    setSubmitting(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/coordinators/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName || undefined,
          email: editEmail || undefined,
          phone: editPhone || null,
        }),
      })
      if (res.ok) {
        closeDialog()
        setLoading(true)
        await loadCoordinators()
        return
      }
      const json = await res.json() as { error?: string }
      setDialogError(json.error ?? 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(): Promise<void> {
    if (!selected) return
    setSubmitting(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/coordinators/${selected.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setCoordinators((prev) => prev.filter((c) => c.id !== selected.id))
        closeDialog()
        return
      }
      const json = await res.json() as { error?: string }
      setDialogError(json.error ?? 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const userRole = session?.user?.role as string | undefined
  const hasWriteAccess = canWrite(userRole)

  const q = searchQuery.toLowerCase()
  const filteredCoordinators = searchQuery
    ? coordinators.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q))
      )
    : coordinators

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Support Coordinators"
          description="View and manage support coordinators and their participant assignments."
          actions={
            hasWriteAccess ? (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Coordinator
              </Button>
            ) : undefined
          }
        />

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search coordinators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">Loading coordinators…</div>
        ) : filteredCoordinators.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {searchQuery
              ? 'No coordinators match your search.'
              : (
                <>
                  No support coordinators found.{' '}
                  {hasWriteAccess
                    ? 'Use the "Add Coordinator" button to create one.'
                    : 'Contact your administrator to add coordinators.'}
                </>
              )}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Active Assignments</TableHead>
                  {hasWriteAccess && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCoordinators.map((coordinator) => (
                  <TableRow key={coordinator.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCheck className="text-muted-foreground h-4 w-4" />
                        <Link
                          href={`/coordinators/${coordinator.id}`}
                          className="font-medium hover:underline"
                        >
                          {coordinator.name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{coordinator.email}</TableCell>
                    <TableCell className="text-muted-foreground">{coordinator.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Support Coordinator</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {coordinator._count?.coordinatorAssignments ?? '—'}
                    </TableCell>
                    {hasWriteAccess && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ContextActionMenu
                            groups={[
                              {
                                label: 'Email',
                                items: [
                                  emailAction('Email Coordinator', () => openEmail({
                                    recipientEmail: coordinator.email,
                                    recipientName: coordinator.name,
                                    coordinatorId: coordinator.id,
                                  })),
                                ],
                              },
                              {
                                label: 'Navigate',
                                items: [
                                  navigateAction('View Participants', () => window.location.assign(`/coordinators/${coordinator.id}`)),
                                ],
                              },
                            ]}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(coordinator)}
                            aria-label={`Edit ${coordinator.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDeactivate(coordinator)}
                            aria-label={`Deactivate ${coordinator.name}`}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogMode === 'create'} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Support Coordinator</DialogTitle>
            <DialogDescription>
              Create a new support coordinator account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Full name"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="email@example.com"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-phone">Phone</Label>
              <Input
                id="create-phone"
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-password">Password *</Label>
              <Input
                id="create-password"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Minimum 8 characters"
                disabled={submitting}
              />
            </div>
            {dialogError && (
              <p className="text-destructive text-sm">{dialogError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Coordinator'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={dialogMode === 'edit'} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Support Coordinator</DialogTitle>
            <DialogDescription>
              Update coordinator details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@example.com"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            {dialogError && (
              <p className="text-destructive text-sm">{dialogError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleEdit()} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={dialogMode === 'deactivate'} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Coordinator</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{' '}
              <span className="font-semibold">{selected?.name}</span>? This will remove the
              coordinator and deactivate all their participant assignments. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {dialogError && (
            <p className="text-destructive text-sm">{dialogError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeactivate()}
              disabled={submitting}
            >
              {submitting ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EmailComposeModal
        open={emailState.open}
        onClose={closeEmail}
        onSent={closeEmail}
        recipientEmail={emailState.recipientEmail}
        recipientName={emailState.recipientName}
        subject={emailState.subject}
        body={emailState.body}
        coordinatorId={emailState.coordinatorId}
      />
    </DashboardShell>
  )
}
