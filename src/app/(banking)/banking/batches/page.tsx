'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Layers, Plus } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU, formatDateTimeAU } from '@/lib/shared/dates'

interface PaymentBatch {
  id: string
  description: string | null
  scheduledDate: string | null
  generatedAt: string | null
  uploadedAt: string | null
  confirmedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  _count: { payments: number; abaFiles: number }
  payments: { amountCents: number }[]
}

type BatchStatus = 'PENDING' | 'ABA_GENERATED' | 'UPLOADED' | 'CONFIRMED'

function deriveBatchStatus(batch: PaymentBatch): BatchStatus {
  if (batch.confirmedAt) return 'CONFIRMED'
  if (batch.uploadedAt) return 'UPLOADED'
  if (batch.generatedAt) return 'ABA_GENERATED'
  return 'PENDING'
}

function batchStatusLabel(status: BatchStatus): string {
  switch (status) {
    case 'PENDING': return 'Pending'
    case 'ABA_GENERATED': return 'ABA Generated'
    case 'UPLOADED': return 'Uploaded'
    case 'CONFIRMED': return 'Confirmed'
  }
}

function batchStatusVariant(status: BatchStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'CONFIRMED': return 'default'
    case 'UPLOADED': return 'outline'
    case 'ABA_GENERATED': return 'secondary'
    case 'PENDING': return 'secondary'
  }
}

export default function PaymentBatchesPage(): React.JSX.Element {
  const router = useRouter()
  const [batches, setBatches] = useState<PaymentBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [creating, setCreating] = useState(false)

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/banking/batches?page=1&pageSize=50')
      if (res.ok) {
        const json = await res.json()
        setBatches(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const body: { description?: string; scheduledDate?: string } = {}
      if (description) body.description = description
      if (scheduledDate) body.scheduledDate = new Date(scheduledDate).toISOString()

      const res = await fetch('/api/banking/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const json = await res.json()
        setCreateOpen(false)
        setDescription('')
        setScheduledDate('')
        router.push(`/banking/batches/${json.data.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Payment Batches"
          description="Group payments into batches, generate ABA files, and track upload and confirmation status."
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Batch
            </Button>
          }
        />

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Created By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Layers className="h-8 w-8 text-muted-foreground/50" />
                      <p>No payment batches yet. Create one to start grouping payments for a payment run.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => {
                  const status = deriveBatchStatus(batch)
                  const totalCents = batch.payments.reduce((sum, p) => sum + p.amountCents, 0)
                  return (
                    <TableRow
                      key={batch.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/banking/batches/${batch.id}`)}
                    >
                      <TableCell className="font-medium">
                        {batch.description ?? <span className="text-muted-foreground italic">No description</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {batch.scheduledDate ? formatDateAU(new Date(batch.scheduledDate)) : '—'}
                      </TableCell>
                      <TableCell>{batch._count.payments}</TableCell>
                      <TableCell className="font-mono text-sm">{formatAUD(totalCents)}</TableCell>
                      <TableCell>
                        <Badge variant={batchStatusVariant(status)}>
                          {batchStatusLabel(status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTimeAU(new Date(batch.createdAt))}
                      </TableCell>
                      <TableCell className="text-sm">{batch.createdBy.name}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create Batch Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Payment Batch</DialogTitle>
              <DialogDescription>
                Create a batch to group payments for a single payment run. You will add payments after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="batch-description">Description (optional)</Label>
                <Input
                  id="batch-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. February 2026 Week 3 Payment Run"
                  maxLength={255}
                />
              </div>
              <div>
                <Label htmlFor="batch-scheduled-date">Scheduled Payment Date (optional)</Label>
                <Input
                  id="batch-scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Batch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
