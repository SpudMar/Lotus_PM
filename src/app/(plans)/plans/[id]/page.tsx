'use client'

/**
 * Plan detail page -- shows budget lines with SA committed column.
 * WS-F6: saCommittedCents column added to budget summary.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'

interface BudgetLineWithCommitment {
  id: string
  categoryCode: string
  categoryName: string
  allocatedCents: number
  spentCents: number
  reservedCents: number
  saCommittedCents: number
  remainingCents: number
}

interface Plan {
  id: string
  startDate: string
  endDate: string
  status: string
  participant: {
    id: string
    firstName: string
    lastName: string
    ndisNumber: string
  }
  budgetLines: { allocatedCents: number; spentCents: number; reservedCents: number }[]
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

export default function PlanDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>()
  const planId = params.id

  const [plan, setPlan] = useState<Plan | null>(null)
  const [budgetLines, setBudgetLines] = useState<BudgetLineWithCommitment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [planRes, linesRes] = await Promise.all([
        fetch(`/api/plans/${planId}`),
        fetch(`/api/plans/${planId}/budget-lines`),
      ])

      if (!planRes.ok) {
        setError('Plan not found.')
        return
      }

      const planJson = await planRes.json()
      setPlan(planJson.data)

      if (linesRes.ok) {
        const linesJson = await linesRes.json()
        setBudgetLines(linesJson.data)
      }
    } catch {
      setError('Failed to load plan.')
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <DashboardShell>
        <p className="text-muted-foreground">Loading...</p>
      </DashboardShell>
    )
  }

  if (error || !plan) {
    return (
      <DashboardShell>
        <p className="text-destructive">{error ?? 'Plan not found.'}</p>
      </DashboardShell>
    )
  }

  const totalAllocated = budgetLines.reduce((s, l) => s + l.allocatedCents, 0)
  const totalSpent = budgetLines.reduce((s, l) => s + l.spentCents, 0)
  const totalCommitted = budgetLines.reduce((s, l) => s + l.saCommittedCents, 0)
  const totalRemaining = budgetLines.reduce((s, l) => s + l.remainingCents, 0)

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/plans" className="hover:underline">Plans</Link>
          <span>/</span>
          <span>
            {plan.participant.firstName} {plan.participant.lastName}
          </span>
        </div>

        <PageHeader
          title={`${plan.participant.firstName} ${plan.participant.lastName}`}
          description={`NDIS: ${plan.participant.ndisNumber}`}
          actions={<Badge variant={statusVariant(plan.status)}>{plan.status.replace(/_/g, ' ')}</Badge>}
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">Start</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-medium">
              {formatDateAU(new Date(plan.startDate))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">End</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-medium">
              {formatDateAU(new Date(plan.endDate))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">Total Budget</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-semibold">{formatAUD(totalAllocated)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">Remaining</CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-semibold">{formatAUD(totalRemaining)}</CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Budget Lines</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Committed (SA)</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No budget lines defined.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {budgetLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <span className="font-mono text-xs">{line.categoryCode}</span>
                          <br />
                          <span className="text-sm">{line.categoryName}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatAUD(line.allocatedCents)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatAUD(line.spentCents)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.saCommittedCents > 0 ? (
                            <span className="text-amber-600">{formatAUD(line.saCommittedCents)}</span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span className={line.remainingCents < 0 ? 'text-destructive font-semibold' : 'font-medium'}>
                            {formatAUD(line.remainingCents)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-semibold bg-muted/50">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatAUD(totalAllocated)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatAUD(totalSpent)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {totalCommitted > 0 ? (
                          <span className="text-amber-600">{formatAUD(totalCommitted)}</span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatAUD(totalRemaining)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Committed (SA) = amounts earmarked to service agreements but not yet invoiced.
            Remaining = Allocated - Spent - Committed (SA).
          </p>
        </div>
      </div>
    </DashboardShell>
  )
}
