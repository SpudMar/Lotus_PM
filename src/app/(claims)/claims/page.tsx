'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CreditCard, Send, CheckCircle, FolderPlus, AlertCircle } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'

interface Claim {
  id: string
  claimReference: string
  claimedCents: number
  approvedCents: number
  status: string
  submittedAt: string | null
  outcomeAt: string | null
  createdAt: string
  participant: { id: string; firstName: string; lastName: string; ndisNumber: string }
  invoice: { id: string; invoiceNumber: string; provider: { id: string; name: string } }
  batch: { id: string; batchNumber: string } | null
  submittedBy: { id: string; name: string } | null
}

interface StatusCounts {
  [key: string]: number
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'APPROVED': case 'PAID': return 'default'
    case 'SUBMITTED': return 'outline'
    case 'REJECTED': return 'destructive'
    case 'PARTIAL': return 'secondary'
    default: return 'secondary'
  }
}

export default function ClaimsPage(): React.JSX.Element {
  const [claims, setClaims] = useState<Claim[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({})
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set())

  // Submit dialog state
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitClaimId, setSubmitClaimId] = useState<string>('')
  const [submitProdaRef, setSubmitProdaRef] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)

  // Outcome dialog state
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false)
  const [outcomeClaimId, setOutcomeClaimId] = useState<string>('')
  const [outcomeType, setOutcomeType] = useState<string>('APPROVED')
  const [outcomeAmount, setOutcomeAmount] = useState<string>('')
  const [outcomeNotes, setOutcomeNotes] = useState<string>('')
  const [outcomeLoading, setOutcomeLoading] = useState(false)

  // Batch dialog state
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchNotes, setBatchNotes] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)

  const loadClaims = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/claims?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setClaims(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadClaims()
  }, [loadClaims])

  // Calculate status counts from loaded data
  useEffect(() => {
    const counts: StatusCounts = {}
    claims.forEach((c) => {
      counts[c.status] = (counts[c.status] ?? 0) + 1
    })
    setStatusCounts(counts)
  }, [claims])

  const toggleClaimSelection = (id: string) => {
    setSelectedClaims((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSubmitClaim = async () => {
    setSubmitLoading(true)
    try {
      const res = await fetch(`/api/claims/${submitClaimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          prodaReference: submitProdaRef || undefined,
        }),
      })
      if (res.ok) {
        setSubmitDialogOpen(false)
        setSubmitProdaRef('')
        void loadClaims()
      }
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleRecordOutcome = async () => {
    setOutcomeLoading(true)
    try {
      const res = await fetch(`/api/claims/${outcomeClaimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'outcome',
          outcome: outcomeType,
          approvedCents: Math.round(parseFloat(outcomeAmount || '0') * 100),
          outcomeNotes: outcomeNotes || undefined,
        }),
      })
      if (res.ok) {
        setOutcomeDialogOpen(false)
        setOutcomeAmount('')
        setOutcomeNotes('')
        void loadClaims()
      }
    } finally {
      setOutcomeLoading(false)
    }
  }

  const handleCreateBatch = async () => {
    setBatchLoading(true)
    try {
      const res = await fetch('/api/claims/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimIds: Array.from(selectedClaims),
          notes: batchNotes || undefined,
        }),
      })
      if (res.ok) {
        setBatchDialogOpen(false)
        setBatchNotes('')
        setSelectedClaims(new Set())
        void loadClaims()
      }
    } finally {
      setBatchLoading(false)
    }
  }

  const pendingCount = statusCounts['PENDING'] ?? 0
  const submittedCount = statusCounts['SUBMITTED'] ?? 0
  const approvedCount = (statusCounts['APPROVED'] ?? 0) + (statusCounts['PARTIAL'] ?? 0)
  const totalClaimedCents = claims.reduce((sum, c) => sum + c.claimedCents, 0)

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Claims"
          description="Create, submit, and track NDIS claims. Submit claims via the PACE portal and record references and outcomes here."
          actions={
            <div className="flex gap-2">
              {selectedClaims.size > 0 && (
                <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FolderPlus className="mr-2 h-4 w-4" />
                      Create Batch ({selectedClaims.size})
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Claim Batch</DialogTitle>
                      <DialogDescription>
                        Group {selectedClaims.size} selected pending claims into a batch for submission.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="batchNotes">Notes (optional)</Label>
                        <Textarea
                          id="batchNotes"
                          value={batchNotes}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBatchNotes(e.target.value)}
                          placeholder="e.g. Weekly batch for 21/02/2026"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateBatch} disabled={batchLoading}>
                        {batchLoading ? 'Creating...' : 'Create Batch'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingCount}</div>
              <p className="text-xs text-muted-foreground">Ready to submit</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Submitted</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{submittedCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting NDIA outcome</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedCount}</div>
              <p className="text-xs text-muted-foreground">Ready for payment</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Claimed</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatAUD(totalClaimedCents)}</div>
              <p className="text-xs text-muted-foreground">All claims this view</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="PENDING">Pending</TabsTrigger>
            <TabsTrigger value="SUBMITTED">Submitted</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
            <TabsTrigger value="PAID">Paid</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {statusFilter === 'PENDING' || statusFilter === 'all' ? (
                  <TableHead className="w-10">
                    <span className="sr-only">Select</span>
                  </TableHead>
                ) : null}
                <TableHead>Claim Ref</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Claimed</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : claims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No claims found. Claims are created from approved invoices.
                  </TableCell>
                </TableRow>
              ) : (
                claims.map((claim) => (
                  <TableRow key={claim.id}>
                    {statusFilter === 'PENDING' || statusFilter === 'all' ? (
                      <TableCell>
                        {claim.status === 'PENDING' && (
                          <input
                            type="checkbox"
                            checked={selectedClaims.has(claim.id)}
                            onChange={() => toggleClaimSelection(claim.id)}
                            className="h-4 w-4"
                            aria-label={`Select claim ${claim.claimReference}`}
                          />
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium">{claim.claimReference}</TableCell>
                    <TableCell className="text-sm">{claim.invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{claim.invoice.provider.name}</TableCell>
                    <TableCell className="text-sm">
                      {claim.participant.firstName} {claim.participant.lastName}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatAUD(claim.claimedCents)}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {claim.approvedCents > 0 ? formatAUD(claim.approvedCents) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(claim.status)}>
                        {claim.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {claim.batch?.batchNumber ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {claim.status === 'PENDING' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSubmitClaimId(claim.id)
                              setSubmitDialogOpen(true)
                            }}
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                        )}
                        {claim.status === 'SUBMITTED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setOutcomeClaimId(claim.id)
                              setOutcomeDialogOpen(true)
                            }}
                          >
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Submit Claim Dialog */}
        <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Claim to NDIA</DialogTitle>
              <DialogDescription>
                Mark this claim as submitted to NDIA via the PACE portal. Enter the PRODA reference from the portal if available.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="prodaRef">PRODA Reference (optional)</Label>
                <Input
                  id="prodaRef"
                  value={submitProdaRef}
                  onChange={(e) => setSubmitProdaRef(e.target.value)}
                  placeholder="e.g. PRODA-12345"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitClaim} disabled={submitLoading}>
                {submitLoading ? 'Submitting...' : 'Mark as Submitted'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Record Outcome Dialog */}
        <Dialog open={outcomeDialogOpen} onOpenChange={setOutcomeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record NDIA Outcome</DialogTitle>
              <DialogDescription>
                Enter the outcome received from NDIA for this claim.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="outcomeType">Outcome</Label>
                <Select value={outcomeType} onValueChange={setOutcomeType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">Approved (Full)</SelectItem>
                    <SelectItem value="PARTIAL">Partially Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="outcomeAmount">Approved Amount ($)</Label>
                <Input
                  id="outcomeAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={outcomeAmount}
                  onChange={(e) => setOutcomeAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="outcomeNotes">Notes (optional)</Label>
                <Textarea
                  id="outcomeNotes"
                  value={outcomeNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setOutcomeNotes(e.target.value)}
                  placeholder="e.g. Line 3 rejected — rate exceeds price guide"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOutcomeDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleRecordOutcome} disabled={outcomeLoading}>
                {outcomeLoading ? 'Saving...' : 'Record Outcome'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
