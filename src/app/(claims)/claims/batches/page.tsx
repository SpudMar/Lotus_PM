'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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
import { Send } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateTimeAU } from '@/lib/shared/dates'

interface Batch {
  id: string
  batchNumber: string
  claimCount: number
  totalCents: number
  approvedCents: number
  status: string
  submittedAt: string | null
  completedAt: string | null
  notes: string | null
  createdAt: string
  _count: { claims: number }
}

function batchStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'COMPLETED': return 'default'
    case 'SUBMITTED': case 'PROCESSING': return 'outline'
    default: return 'secondary'
  }
}

export default function BatchesPage(): React.JSX.Element {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)

  // Submit dialog
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitBatchId, setSubmitBatchId] = useState('')
  const [submitProdaRef, setSubmitProdaRef] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/claims/batches?page=1&pageSize=50')
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

  const handleSubmitBatch = async () => {
    setSubmitLoading(true)
    try {
      const res = await fetch(`/api/claims/batches/${submitBatchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          prodaBatchId: submitProdaRef || undefined,
        }),
      })
      if (res.ok) {
        setSubmitDialogOpen(false)
        setSubmitProdaRef('')
        void loadBatches()
      }
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Claim Batches"
          description="Group claims into batches for bulk submission to NDIA."
          actions={
            <Button asChild variant="outline">
              <Link href="/claims">Back to Claims</Link>
            </Button>
          }
        />

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch #</TableHead>
                <TableHead>Claims</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No batches found. Create batches by selecting pending claims on the Claims page.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                    <TableCell>{batch._count.claims}</TableCell>
                    <TableCell className="font-mono text-sm">{formatAUD(batch.totalCents)}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {batch.approvedCents > 0 ? formatAUD(batch.approvedCents) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={batchStatusVariant(batch.status)}>
                        {batch.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {batch.submittedAt ? formatDateTimeAU(new Date(batch.submittedAt)) : '—'}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {batch.notes ?? '—'}
                    </TableCell>
                    <TableCell>
                      {batch.status === 'DRAFT' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSubmitBatchId(batch.id)
                            setSubmitDialogOpen(true)
                          }}
                        >
                          <Send className="mr-1 h-3 w-3" />
                          Submit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Submit Batch Dialog */}
        <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Batch to NDIA</DialogTitle>
              <DialogDescription>
                Submit this batch via the PACE portal, then enter the PRODA batch ID here to track it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="batchProdaRef">PRODA Batch ID (optional)</Label>
                <Input
                  id="batchProdaRef"
                  value={submitProdaRef}
                  onChange={(e) => setSubmitProdaRef(e.target.value)}
                  placeholder="e.g. BATCH-PRODA-12345"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitBatch} disabled={submitLoading}>
                {submitLoading ? 'Submitting...' : 'Submit Batch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
