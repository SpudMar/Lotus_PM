'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus } from 'lucide-react'
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
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No plans found.</TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => {
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
