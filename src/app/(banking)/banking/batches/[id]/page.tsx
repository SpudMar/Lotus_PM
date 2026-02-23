'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { FileDown, Upload, CheckCircle2, Trash2 } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU, formatDateTimeAU } from '@/lib/shared/dates'

interface BatchPayment {
  id: string
  amountCents: number
  bsb: string
  accountNumber: string
  status: string
  batchId: string | null
  claim: {
    id: string
    claimReference: string
    invoice: {
      id: string
      invoiceNumber: string
      provider: { id: string; name: string }
      participant: { id: string; firstName: string; lastName: string }
    }
  }
}

interface AvailablePayment {
  id: string
  amountCents: number
  status: string
  batchId: string | null
  claim: {
    claimReference: string
    invoice: {
      invoiceNumber: string
      provider: { name: string }
      participant: { firstName: string; lastName: string }
    }
  }
}

interface AbaFileSummary {
  id: string
  filename: string
  totalCents: number
  paymentCount: number
  createdAt: string
}

interface PaymentBatch {
  id: string
  description: string | null
  scheduledDate: string | null
  generatedAt: string | null
  uploadedAt: string | null
  confirmedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  abaFiles: AbaFileSummary[]
  payments: BatchPayment[]
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
    case 'UPLOADED': return 'Uploaded to Bank'
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

export default function BatchDetailPage(): React.JSX.Element {
  const params = useParams()
  const id = params.id as string

  const [batch, setBatch] = useState<PaymentBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // ABA generation
  const [generatingAba, setGeneratingAba] = useState(false)
  const [generatedAba, setGeneratedAba] = useState<{ filename: string; content: string } | null>(null)
  const [abaDialogOpen, setAbaDialogOpen] = useState(false)

  // Mark uploaded/confirmed
  const [markingUploaded, setMarkingUploaded] = useState(false)
  const [markingConfirmed, setMarkingConfirmed] = useState(false)

  // Add payments dialog
  const [addPaymentsOpen, setAddPaymentsOpen] = useState(false)
  const [availablePayments, setAvailablePayments] = useState<AvailablePayment[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set())
  const [addingPayments, setAddingPayments] = useState(false)

  // Remove payment
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadBatch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/banking/batches/${id}`)
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (res.ok) {
        const json = await res.json()
        setBatch(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadBatch()
  }, [loadBatch])

  const loadAvailablePayments = async () => {
    setLoadingAvailable(true)
    try {
      const res = await fetch('/api/banking/payments?page=1&pageSize=200&status=PENDING')
      if (res.ok) {
        const json = await res.json()
        // Only show payments not yet in any batch
        const unbatched = (json.data as AvailablePayment[]).filter((p) => p.batchId === null)
        setAvailablePayments(unbatched)
      }
    } finally {
      setLoadingAvailable(false)
    }
  }

  const handleOpenAddPayments = () => {
    setSelectedPaymentIds(new Set())
    setAddPaymentsOpen(true)
    void loadAvailablePayments()
  }

  const togglePaymentSelect = (paymentId: string) => {
    setSelectedPaymentIds((prev) => {
      const next = new Set(prev)
      if (next.has(paymentId)) {
        next.delete(paymentId)
      } else {
        next.add(paymentId)
      }
      return next
    })
  }

  const handleAddPayments = async () => {
    if (selectedPaymentIds.size === 0) return
    setAddingPayments(true)
    try {
      const res = await fetch(`/api/banking/batches/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIds: Array.from(selectedPaymentIds) }),
      })
      if (res.ok) {
        setAddPaymentsOpen(false)
        setSelectedPaymentIds(new Set())
        void loadBatch()
      }
    } finally {
      setAddingPayments(false)
    }
  }

  const handleRemovePayment = async (paymentId: string) => {
    setRemovingId(paymentId)
    try {
      const res = await fetch(`/api/banking/batches/${id}/payments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (res.ok) {
        void loadBatch()
      }
    } finally {
      setRemovingId(null)
    }
  }

  const handleGenerateAba = async () => {
    setGeneratingAba(true)
    try {
      const res = await fetch(`/api/banking/batches/${id}/generate-aba`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        setGeneratedAba({ filename: json.data.filename, content: json.data.abaContent })
        setAbaDialogOpen(true)
        void loadBatch()
      }
    } finally {
      setGeneratingAba(false)
    }
  }

  const handleDownloadAba = () => {
    if (!generatedAba) return
    const blob = new Blob([generatedAba.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = generatedAba.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleMarkUploaded = async () => {
    setMarkingUploaded(true)
    try {
      const res = await fetch(`/api/banking/batches/${id}/mark-uploaded`, { method: 'POST' })
      if (res.ok) {
        void loadBatch()
      }
    } finally {
      setMarkingUploaded(false)
    }
  }

  const handleMarkConfirmed = async () => {
    setMarkingConfirmed(true)
    try {
      const res = await fetch(`/api/banking/batches/${id}/mark-confirmed`, { method: 'POST' })
      if (res.ok) {
        void loadBatch()
      }
    } finally {
      setMarkingConfirmed(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="text-muted-foreground p-8">Loading batch...</div>
      </DashboardShell>
    )
  }

  if (notFound || !batch) {
    return (
      <DashboardShell>
        <div className="text-muted-foreground p-8">Payment batch not found.</div>
      </DashboardShell>
    )
  }

  const status = deriveBatchStatus(batch)
  const totalCents = batch.payments.reduce((sum, p) => sum + p.amountCents, 0)
  const pendingPayments = batch.payments.filter((p) => p.status === 'PENDING')

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title={batch.description ?? 'Payment Batch'}
          description={`Created by ${batch.createdBy.name} on ${formatDateTimeAU(new Date(batch.createdAt))}`}
          actions={
            <div className="flex gap-2">
              {status === 'PENDING' && (
                <>
                  <Button variant="outline" onClick={handleOpenAddPayments}>
                    Add Payments
                  </Button>
                  {pendingPayments.length > 0 && (
                    <Button onClick={handleGenerateAba} disabled={generatingAba}>
                      <FileDown className="mr-2 h-4 w-4" />
                      {generatingAba ? 'Generating...' : 'Generate ABA'}
                    </Button>
                  )}
                </>
              )}
              {status === 'ABA_GENERATED' && (
                <>
                  {generatedAba && (
                    <Button variant="outline" onClick={handleDownloadAba}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Download ABA
                    </Button>
                  )}
                  <Button onClick={handleMarkUploaded} disabled={markingUploaded}>
                    <Upload className="mr-2 h-4 w-4" />
                    {markingUploaded ? 'Saving...' : 'Mark as Uploaded'}
                  </Button>
                </>
              )}
              {status === 'UPLOADED' && (
                <Button onClick={handleMarkConfirmed} disabled={markingConfirmed}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {markingConfirmed ? 'Saving...' : 'Mark as Confirmed'}
                </Button>
              )}
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={batchStatusVariant(status)}>
                {batchStatusLabel(status)}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{batch.payments.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{formatAUD(totalCents)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Scheduled Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {batch.scheduledDate ? formatDateAU(new Date(batch.scheduledDate)) : 'Not set'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        {(batch.generatedAt ?? batch.uploadedAt ?? batch.confirmedAt) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex gap-3">
                  <span className="text-muted-foreground w-32">Created</span>
                  <span>{formatDateTimeAU(new Date(batch.createdAt))}</span>
                </div>
                {batch.generatedAt && (
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-32">ABA Generated</span>
                    <span>{formatDateTimeAU(new Date(batch.generatedAt))}</span>
                  </div>
                )}
                {batch.uploadedAt && (
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-32">Uploaded</span>
                    <span>{formatDateTimeAU(new Date(batch.uploadedAt))}</span>
                  </div>
                )}
                {batch.confirmedAt && (
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-32">Confirmed</span>
                    <span>{formatDateTimeAU(new Date(batch.confirmedAt))}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ABA Files */}
        {batch.abaFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">ABA Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {batch.abaFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span className="font-mono">{file.filename}</span>
                    <span className="text-muted-foreground">
                      {file.paymentCount} payments — {formatAUD(file.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payments Table */}
        <div>
          <h3 className="text-sm font-medium mb-2">Payments in Batch</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim Ref</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {status === 'PENDING' && <TableHead className="w-20">Remove</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={status === 'PENDING' ? 7 : 6} className="text-center text-muted-foreground py-6">
                      No payments in this batch. Click &ldquo;Add Payments&rdquo; to add some.
                    </TableCell>
                  </TableRow>
                ) : (
                  batch.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium font-mono text-sm">
                        {payment.claim.claimReference}
                      </TableCell>
                      <TableCell className="text-sm">{payment.claim.invoice.provider.name}</TableCell>
                      <TableCell className="text-sm">
                        {payment.claim.invoice.participant.firstName} {payment.claim.invoice.participant.lastName}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{payment.claim.invoice.invoiceNumber}</TableCell>
                      <TableCell className="font-mono text-sm">{formatAUD(payment.amountCents)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{payment.status.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      {status === 'PENDING' && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePayment(payment.id)}
                            disabled={removingId === payment.id}
                            aria-label={`Remove payment ${payment.claim.claimReference}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Add Payments Dialog */}
      <Dialog open={addPaymentsOpen} onOpenChange={setAddPaymentsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add Payments to Batch</DialogTitle>
            <DialogDescription>
              Select pending payments to add to this batch. Only payments not yet assigned to a batch are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Claim Ref</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAvailable ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Loading available payments...
                    </TableCell>
                  </TableRow>
                ) : availablePayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No pending payments available. All pending payments are already in batches.
                    </TableCell>
                  </TableRow>
                ) : (
                  availablePayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPaymentIds.has(payment.id)}
                          onCheckedChange={() => togglePaymentSelect(payment.id)}
                          aria-label={`Select payment ${payment.claim.claimReference}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{payment.claim.claimReference}</TableCell>
                      <TableCell className="text-sm">{payment.claim.invoice.provider.name}</TableCell>
                      <TableCell className="text-sm">
                        {payment.claim.invoice.participant.firstName} {payment.claim.invoice.participant.lastName}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatAUD(payment.amountCents)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPaymentsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPayments}
              disabled={selectedPaymentIds.size === 0 || addingPayments}
            >
              {addingPayments ? 'Adding...' : `Add ${selectedPaymentIds.size > 0 ? selectedPaymentIds.size : ''} Payment${selectedPaymentIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ABA Generated Dialog */}
      <Dialog open={abaDialogOpen} onOpenChange={setAbaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ABA File Generated</DialogTitle>
            <DialogDescription>
              {generatedAba
                ? `File ${generatedAba.filename} is ready. Download it and upload to CBA CommBiz, then click Mark as Uploaded.`
                : 'ABA file has been generated.'}
            </DialogDescription>
          </DialogHeader>
          {generatedAba && (
            <div className="rounded bg-muted p-3 font-mono text-xs max-h-40 overflow-auto whitespace-pre">
              {generatedAba.content}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbaDialogOpen(false)}>
              Close
            </Button>
            {generatedAba && (
              <Button onClick={handleDownloadAba}>
                <FileDown className="mr-2 h-4 w-4" />
                Download {generatedAba.filename}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
