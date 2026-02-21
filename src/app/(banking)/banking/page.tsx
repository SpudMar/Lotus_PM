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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Landmark, FileDown, CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateTimeAU } from '@/lib/shared/dates'

interface Payment {
  id: string
  amountCents: number
  bsb: string
  accountNumber: string
  accountName: string
  reference: string | null
  status: string
  processedAt: string | null
  createdAt: string
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
  abaFile: { id: string; filename: string } | null
}

interface AbaFile {
  id: string
  filename: string
  totalCents: number
  paymentCount: number
  bankReference: string | null
  submittedAt: string | null
  clearedAt: string | null
  createdAt: string
  _count: { payments: number }
}

type ActiveTab = 'payments' | 'aba-files'

function paymentStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'CLEARED': return 'default'
    case 'IN_ABA_FILE': case 'SUBMITTED_TO_BANK': return 'outline'
    case 'FAILED': case 'REVERSED': return 'destructive'
    default: return 'secondary'
  }
}

export default function BankingPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ActiveTab>('payments')
  const [payments, setPayments] = useState<Payment[]>([])
  const [abaFiles, setAbaFiles] = useState<AbaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())

  // ABA submit dialog
  const [submitAbaOpen, setSubmitAbaOpen] = useState(false)
  const [submitAbaId, setSubmitAbaId] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [submitAbaLoading, setSubmitAbaLoading] = useState(false)

  // Generate ABA dialog
  const [generateAbaOpen, setGenerateAbaOpen] = useState(false)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generatedAba, setGeneratedAba] = useState<{ filename: string; content: string } | null>(null)

  // Reconcile dialog
  const [reconcileLoading, setReconcileLoading] = useState(false)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/banking/payments?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setPayments(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const loadAbaFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/banking/aba-files?page=1&pageSize=50')
      if (res.ok) {
        const json = await res.json()
        setAbaFiles(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'payments') {
      void loadPayments()
    } else {
      void loadAbaFiles()
    }
  }, [activeTab, loadPayments, loadAbaFiles])

  const togglePaymentSelection = (id: string) => {
    setSelectedPayments((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleGenerateAba = async () => {
    setGenerateLoading(true)
    try {
      const res = await fetch('/api/banking/aba-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIds: Array.from(selectedPayments) }),
      })
      if (res.ok) {
        const json = await res.json()
        setGeneratedAba({ filename: json.data.filename, content: json.data.abaContent })
        setSelectedPayments(new Set())
        void loadPayments()
      }
    } finally {
      setGenerateLoading(false)
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
    setGenerateAbaOpen(false)
    setGeneratedAba(null)
  }

  const handleSubmitAba = async () => {
    setSubmitAbaLoading(true)
    try {
      const res = await fetch(`/api/banking/aba-files/${submitAbaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', bankReference }),
      })
      if (res.ok) {
        setSubmitAbaOpen(false)
        setBankReference('')
        void loadAbaFiles()
      }
    } finally {
      setSubmitAbaLoading(false)
    }
  }

  const handleReconcileSelected = async () => {
    setReconcileLoading(true)
    try {
      const res = await fetch('/api/banking/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIds: Array.from(selectedPayments) }),
      })
      if (res.ok) {
        setSelectedPayments(new Set())
        void loadPayments()
      }
    } finally {
      setReconcileLoading(false)
    }
  }

  const pendingPayments = payments.filter((p) => p.status === 'PENDING')
  const totalPendingCents = pendingPayments.reduce((sum, p) => sum + p.amountCents, 0)

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Banking"
          description="Manage provider payments, generate ABA files for CBA, and reconcile cleared payments."
          actions={
            <div className="flex gap-2">
              {selectedPayments.size > 0 && activeTab === 'payments' && (
                <>
                  {payments.some((p) => selectedPayments.has(p.id) && p.status === 'PENDING') && (
                    <Button
                      onClick={() => {
                        setGenerateAbaOpen(true)
                        void handleGenerateAba()
                      }}
                      disabled={generateLoading}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Generate ABA ({selectedPayments.size})
                    </Button>
                  )}
                  {payments.some((p) => selectedPayments.has(p.id) && p.status === 'SUBMITTED_TO_BANK') && (
                    <Button
                      variant="outline"
                      onClick={handleReconcileSelected}
                      disabled={reconcileLoading}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Reconcile ({selectedPayments.size})
                    </Button>
                  )}
                </>
              )}
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingPayments.length}</div>
              <p className="text-xs text-muted-foreground">{formatAUD(totalPendingCents)} to pay</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ABA Files</CardTitle>
              <FileDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{abaFiles.length}</div>
              <p className="text-xs text-muted-foreground">Generated files</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Workflow</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pending → Generate ABA → Upload to CBA CommBiz → Mark Submitted → Reconcile when cleared
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <TabsList>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="aba-files">ABA Files</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === 'payments' && (
          <>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="PENDING">Pending</TabsTrigger>
                <TabsTrigger value="IN_ABA_FILE">In ABA File</TabsTrigger>
                <TabsTrigger value="SUBMITTED_TO_BANK">Submitted</TabsTrigger>
                <TabsTrigger value="CLEARED">Cleared</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <span className="sr-only">Select</span>
                    </TableHead>
                    <TableHead>Claim Ref</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Participant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>BSB / Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>ABA File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No payments found. Payments are created from approved claims.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {(payment.status === 'PENDING' || payment.status === 'SUBMITTED_TO_BANK') && (
                            <input
                              type="checkbox"
                              checked={selectedPayments.has(payment.id)}
                              onChange={() => togglePaymentSelection(payment.id)}
                              className="h-4 w-4"
                              aria-label={`Select payment for ${payment.claim.claimReference}`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{payment.claim.claimReference}</TableCell>
                        <TableCell className="text-sm">{payment.claim.invoice.provider.name}</TableCell>
                        <TableCell className="text-sm">
                          {payment.claim.invoice.participant.firstName} {payment.claim.invoice.participant.lastName}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{formatAUD(payment.amountCents)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {payment.bsb.slice(0, 3)}-{payment.bsb.slice(3)} / {payment.accountNumber}
                        </TableCell>
                        <TableCell>
                          <Badge variant={paymentStatusVariant(payment.status)}>
                            {payment.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {payment.abaFile?.filename ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {activeTab === 'aba-files' && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Payments</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Bank Ref</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : abaFiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No ABA files generated yet. Select pending payments and generate an ABA file.
                    </TableCell>
                  </TableRow>
                ) : (
                  abaFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium font-mono text-sm">{file.filename}</TableCell>
                      <TableCell>{file._count.payments}</TableCell>
                      <TableCell className="font-mono text-sm">{formatAUD(file.totalCents)}</TableCell>
                      <TableCell className="text-sm">{file.bankReference ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        {file.submittedAt ? formatDateTimeAU(new Date(file.submittedAt)) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTimeAU(new Date(file.createdAt))}
                      </TableCell>
                      <TableCell>
                        {!file.submittedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSubmitAbaId(file.id)
                              setSubmitAbaOpen(true)
                            }}
                          >
                            Mark Submitted
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Generated ABA download dialog */}
        <Dialog open={generateAbaOpen} onOpenChange={setGenerateAbaOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ABA File Generated</DialogTitle>
              <DialogDescription>
                {generatedAba
                  ? `File ${generatedAba.filename} is ready. Download it and upload to CBA CommBiz.`
                  : 'Generating ABA file...'}
              </DialogDescription>
            </DialogHeader>
            {generatedAba && (
              <div className="rounded bg-muted p-3 font-mono text-xs max-h-40 overflow-auto whitespace-pre">
                {generatedAba.content}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setGenerateAbaOpen(false); setGeneratedAba(null) }}>
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

        {/* Submit ABA to bank dialog */}
        <Dialog open={submitAbaOpen} onOpenChange={setSubmitAbaOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark ABA File as Submitted</DialogTitle>
              <DialogDescription>
                Enter the bank reference from CBA CommBiz after uploading the ABA file.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="bankRef">CBA Bank Reference</Label>
                <Input
                  id="bankRef"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  placeholder="e.g. CBA-20260221-001"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitAbaOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitAba} disabled={submitAbaLoading || !bankReference}>
                {submitAbaLoading ? 'Saving...' : 'Mark as Submitted'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
