'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Users,
  FileText,
  CreditCard,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  DollarSign,
} from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'

type ActiveTab = 'overview' | 'compliance' | 'budget' | 'financial'

interface DashboardSummary {
  participants: { active: number; total: number }
  plans: { active: number; expiringSoon: number; expired: number }
  invoices: { received: number; pendingReview: number; approved: number; rejected: number; total: number }
  claims: { pending: number; submitted: number; approved: number; rejected: number; total: number }
  payments: { pending: number; inAbaFile: number; submittedToBank: number; cleared: number; total: number }
}

interface ComplianceMetrics {
  processingCompliance: {
    withinTarget: number
    overTarget: number
    total: number
    complianceRate: number
  }
  atRisk: Array<{
    id: string
    invoiceNumber: string
    providerName: string
    participantName: string
    receivedAt: string
    businessDaysElapsed: number
  }>
}

interface BudgetRow {
  participantId: string
  participantName: string
  ndisNumber: string
  planId: string
  planStart: string
  planEnd: string
  totalAllocatedCents: number
  totalSpentCents: number
  totalReservedCents: number
  utilisationPercent: number
}

interface FinancialData {
  financial: {
    totalInvoicedCents: number
    totalClaimedCents: number
    totalApprovedCents: number
    totalPaidCents: number
    totalOutstandingCents: number
    periodStart: string
    periodEnd: string
  }
  providers: Array<{
    providerId: string
    providerName: string
    invoiceCount: number
    totalInvoicedCents: number
    totalClaimedCents: number
    totalPaidCents: number
  }>
}

export default function ReportsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [compliance, setCompliance] = useState<ComplianceMetrics | null>(null)
  const [budget, setBudget] = useState<BudgetRow[]>([])
  const [financial, setFinancial] = useState<FinancialData | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'overview') {
        const res = await fetch('/api/reports/dashboard')
        if (res.ok) {
          const json = await res.json()
          setDashboard(json.data)
        }
      } else if (activeTab === 'compliance') {
        const res = await fetch('/api/reports/compliance')
        if (res.ok) {
          const json = await res.json()
          setCompliance(json.data)
        }
      } else if (activeTab === 'budget') {
        const res = await fetch('/api/reports/budget')
        if (res.ok) {
          const json = await res.json()
          setBudget(json.data)
        }
      } else if (activeTab === 'financial') {
        const res = await fetch('/api/reports/financial')
        if (res.ok) {
          const json = await res.json()
          setFinancial(json.data)
        } else if (res.status === 403) {
          setFinancial(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Reports"
          description="Dashboards, financial summaries, NDIS compliance, and budget utilisation."
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading && (
          <div className="py-12 text-center text-muted-foreground">Loading report data...</div>
        )}

        {/* ─── Overview Tab ─── */}
        {!loading && activeTab === 'overview' && dashboard && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Participants</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboard.participants.active}</div>
                  <p className="text-xs text-muted-foreground">
                    {dashboard.participants.total} total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Plans</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboard.plans.active}</div>
                  <p className="text-xs text-muted-foreground">
                    {dashboard.plans.expiringSoon > 0
                      ? `${dashboard.plans.expiringSoon} expiring soon`
                      : 'None expiring soon'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Invoices Pending</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {dashboard.invoices.received + dashboard.invoices.pendingReview}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dashboard.invoices.total} total invoices
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Payments Cleared</CardTitle>
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboard.payments.cleared}</div>
                  <p className="text-xs text-muted-foreground">
                    {dashboard.payments.pending} pending
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Claims pipeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" /> Claims Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-5">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.claims.pending}</div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.claims.submitted}</div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.claims.approved}</div>
                    <p className="text-xs text-muted-foreground">Approved</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.claims.rejected}</div>
                    <p className="text-xs text-muted-foreground">Rejected</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.claims.total}</div>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment pipeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="h-4 w-4" /> Payment Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-5">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.payments.pending}</div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.payments.inAbaFile}</div>
                    <p className="text-xs text-muted-foreground">In ABA File</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.payments.submittedToBank}</div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.payments.cleared}</div>
                    <p className="text-xs text-muted-foreground">Cleared</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dashboard.payments.total}</div>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Compliance Tab ─── */}
        {!loading && activeTab === 'compliance' && compliance && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">5-Day Compliance Rate</CardTitle>
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{compliance.processingCompliance.complianceRate}%</div>
                  <Progress
                    value={compliance.processingCompliance.complianceRate}
                    className="mt-2"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    REQ-015: Process invoices within 5 business days
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Within Target</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{compliance.processingCompliance.withinTarget}</div>
                  <p className="text-xs text-muted-foreground">
                    of {compliance.processingCompliance.total} processed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Over Target</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {compliance.processingCompliance.overTarget}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Exceeded 5 business days
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* At-risk invoices */}
            {compliance.atRisk.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Invoices At Risk (3+ business days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Participant</TableHead>
                          <TableHead>Received</TableHead>
                          <TableHead>Days Elapsed</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {compliance.atRisk.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                            <TableCell className="text-sm">{inv.providerName}</TableCell>
                            <TableCell className="text-sm">{inv.participantName}</TableCell>
                            <TableCell className="text-sm">
                              {formatDateAU(new Date(inv.receivedAt))}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono font-bold">{inv.businessDaysElapsed}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={inv.businessDaysElapsed > 5 ? 'destructive' : 'secondary'}>
                                {inv.businessDaysElapsed > 5 ? 'OVERDUE' : 'AT RISK'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {compliance.atRisk.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No invoices currently at risk. All invoices are being processed within target.
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── Budget Tab ─── */}
        {!loading && activeTab === 'budget' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Budget Utilisation — Active Plans</CardTitle>
            </CardHeader>
            <CardContent>
              {budget.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No active plans found.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participant</TableHead>
                        <TableHead>NDIS Number</TableHead>
                        <TableHead>Plan Period</TableHead>
                        <TableHead>Allocated</TableHead>
                        <TableHead>Spent</TableHead>
                        <TableHead>Reserved</TableHead>
                        <TableHead>Utilisation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budget.map((row) => (
                        <TableRow key={row.planId}>
                          <TableCell className="font-medium">{row.participantName}</TableCell>
                          <TableCell className="font-mono text-sm">{row.ndisNumber}</TableCell>
                          <TableCell className="text-sm">
                            {formatDateAU(new Date(row.planStart))} — {formatDateAU(new Date(row.planEnd))}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatAUD(row.totalAllocatedCents)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatAUD(row.totalSpentCents)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatAUD(row.totalReservedCents)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(row.utilisationPercent, 100)} className="w-16" />
                              <span className="text-sm font-medium">
                                {row.utilisationPercent}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Financial Tab ─── */}
        {!loading && activeTab === 'financial' && financial && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatAUD(financial.financial.totalInvoicedCents)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Claimed</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatAUD(financial.financial.totalClaimedCents)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatAUD(financial.financial.totalPaidCents)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatAUD(financial.financial.totalOutstandingCents)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Approved but not yet paid
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Provider breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Provider Payment Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {financial.providers.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    No provider activity in this period.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead>
                          <TableHead>Invoices</TableHead>
                          <TableHead>Invoiced</TableHead>
                          <TableHead>Claimed</TableHead>
                          <TableHead>Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {financial.providers.map((p) => (
                          <TableRow key={p.providerId}>
                            <TableCell className="font-medium">{p.providerName}</TableCell>
                            <TableCell>{p.invoiceCount}</TableCell>
                            <TableCell className="font-mono text-sm">{formatAUD(p.totalInvoicedCents)}</TableCell>
                            <TableCell className="font-mono text-sm">{formatAUD(p.totalClaimedCents)}</TableCell>
                            <TableCell className="font-mono text-sm">{formatAUD(p.totalPaidCents)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && activeTab === 'financial' && !financial && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Financial reports are restricted to Directors.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}
