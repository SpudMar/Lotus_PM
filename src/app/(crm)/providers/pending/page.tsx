'use client'

import { useEffect, useState } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatDateAU } from '@/lib/shared/dates'
import { CheckCircle, XCircle } from 'lucide-react'

interface PendingProvider {
  id: string
  name: string
  abn: string
  email: string | null
  phone: string | null
  abnStatus: string | null
  abnRegisteredName: string | null
  gstRegistered: boolean | null
  bankBsb: string | null
  bankAccount: string | null
  bankAccountName: string | null
  updatedAt: string
}

export default function ProviderPendingPage(): React.JSX.Element {
  const [providers, setProviders] = useState<PendingProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Reject dialog state
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  function loadPending(): void {
    setLoading(true)
    void fetch('/api/crm/providers/pending')
      .then((r) => r.json())
      .then((j: { data: PendingProvider[] }) => setProviders(j.data ?? []))
      .catch(() => null)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadPending()
  }, [])

  async function handleApprove(id: string): Promise<void> {
    setProcessingId(id)
    try {
      const res = await fetch(`/api/crm/providers/${id}/approve`, { method: 'POST' })
      if (res.ok) {
        setProviders((prev) => prev.filter((p) => p.id !== id))
      }
    } finally {
      setProcessingId(null)
    }
  }

  function openRejectDialog(id: string): void {
    setRejectTarget(id)
    setRejectReason('')
    setShowRejectDialog(true)
  }

  async function handleReject(): Promise<void> {
    if (!rejectTarget) return
    setProcessingId(rejectTarget)
    setShowRejectDialog(false)
    try {
      const res = await fetch(`/api/crm/providers/${rejectTarget}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      })
      if (res.ok) {
        setProviders((prev) => prev.filter((p) => p.id !== rejectTarget))
      }
    } finally {
      setProcessingId(null)
      setRejectTarget(null)
    }
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Providers Pending Approval"
        description="Providers who have completed their profile and are awaiting PM approval."
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading pending providers...
        </div>
      ) : providers.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No providers pending approval.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>ABN</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>ABN Status</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Bank Details</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">
                    <div>
                      <p className="font-semibold">{provider.name}</p>
                      {provider.abnRegisteredName &&
                        provider.abnRegisteredName !== provider.name && (
                          <p className="text-xs text-muted-foreground">
                            ABR: {provider.abnRegisteredName}
                          </p>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{provider.abn}</TableCell>
                  <TableCell>
                    {provider.email ? (
                      <a
                        href={`mailto:${provider.email}`}
                        className="text-emerald-600 hover:underline text-sm"
                      >
                        {provider.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.abnStatus ? (
                      <Badge
                        variant={provider.abnStatus === 'Active' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {provider.abnStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.gstRegistered === null ? (
                      <span className="text-muted-foreground text-sm">—</span>
                    ) : provider.gstRegistered ? (
                      <span className="text-emerald-600 text-sm font-medium">Registered</span>
                    ) : (
                      <span className="text-amber-600 text-sm">Not registered</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.bankBsb && provider.bankAccount ? (
                      <div className="text-sm">
                        <p className="font-mono">
                          {provider.bankBsb} / {provider.bankAccount}
                        </p>
                        {provider.bankAccountName && (
                          <p className="text-xs text-muted-foreground">
                            {provider.bankAccountName}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Not provided</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateAU(new Date(provider.updatedAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={processingId === provider.id}
                        onClick={() => void handleApprove(provider.id)}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        disabled={processingId === provider.id}
                        onClick={() => openRejectDialog(provider.id)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this provider? You can optionally provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleReject()}>
              Reject Provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
