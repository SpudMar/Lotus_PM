'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Search } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'

interface BudgetLine {
  allocatedCents: number
  spentCents: number
  reservedCents: number
}

interface Plan {
  id: string
  startDate: string
  endDate: string
  status: string
  participant: { id: string; firstName: string; lastName: string; ndisNumber: string }
  budgetLines: BudgetLine[]
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVE': return 'default'
    case 'EXPIRING_SOON': return 'outline'
    case 'EXPIRED': return 'secondary'
    case 'UNDER_REVIEW': return 'outline'
    default: return 'secondary'
  }
}

export default function PlansPage(): React.JSX.Element {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/plans?page=1&pageSize=50')
        if (res.ok) {
          const json = await res.json()
          setPlans(json.data)
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const q = searchQuery.toLowerCase()
  const filteredPlans = plans.filter((plan) => {
    const matchesSearch = !searchQuery || 
      `${plan.participant.firstName} ${plan.participant.lastName}`.toLowerCase().includes(q) ||
      plan.participant.ndisNumber.includes(q)
    const matchesStatus = statusFilter === 'all' || plan.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Plans"
          description="NDIS plan management and budget tracking."
          actions={
            <Button asChild>
              <Link href="/plans/new"><Plus className="mr-2 h-4 w-4" />New Plan</Link>
            </Button>
          }
        />

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by participant or NDIS number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="ACTIVE">Active</TabsTrigger>
            <TabsTrigger value="EXPIRED">Expired</TabsTrigger>
            <TabsTrigger value="DRAFT">Draft</TabsTrigger>
            <TabsTrigger value="UNDER_REVIEW">Under Review</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Total Budget</TableHead>
                <TableHead>Spent</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filteredPlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {searchQuery || statusFilter !== 'all' ? 'No plans match your filters.' : 'No plans found.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPlans.map((plan) => {
                  const totalBudget = plan.budgetLines.reduce((sum, l) => sum + l.allocatedCents, 0)
                  const totalSpent = plan.budgetLines.reduce((sum, l) => sum + l.spentCents + l.reservedCents, 0)
                  return (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <Link href={`/plans/${plan.id}`} className="font-medium hover:underline">
                          {plan.participant.firstName} {plan.participant.lastName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateAU(new Date(plan.startDate))} — {formatDateAU(new Date(plan.endDate))}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatAUD(totalBudget)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatAUD(totalSpent)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(plan.status)}>
                          {plan.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardShell>
  )
}
