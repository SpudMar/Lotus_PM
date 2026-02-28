'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ChevronDown, ChevronRight, Plus, FileText, ExternalLink } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetLine {
  id: string
  categoryCode: string
  categoryName: string
  totalCents: number
  spentCents: number
  reservedCents: number
  remainingCents: number
}

interface Plan {
  id: string
  startDate: string
  endDate: string
  status: string
  totalBudgetCents: number
  budgetLines: BudgetLine[]
}

interface SAProvider {
  id: string
  name: string
}

interface ServiceAgreement {
  id: string
  agreementRef: string
  status: string
  startDate: string
  endDate: string
  provider: SAProvider | null
  totalCents: number
}

interface PlansAgreementsTabProps {
  participantId: string
}

function planStatusVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'ACTIVE': return 'default'
    case 'DRAFT': return 'outline'
    default: return 'secondary'
  }
}

function saStatusVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'ACTIVE': return 'default'
    case 'DRAFT': return 'outline'
    default: return 'secondary'
  }
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  participantId,
  sas,
}: {
  plan: Plan
  participantId: string
  sas: ServiceAgreement[]
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(plan.status === 'ACTIVE')

  const totalBudget = plan.budgetLines.reduce((sum, bl) => sum + bl.totalCents, 0)
  const totalSpent = plan.budgetLines.reduce((sum, bl) => sum + bl.spentCents, 0)
  const utilisation = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </Button>
            <CardTitle className="text-base">
              <Link href={`/plans/${plan.id}`} className="hover:underline">
                Plan: {formatDateAU(new Date(plan.startDate))} – {formatDateAU(new Date(plan.endDate))}
              </Link>
            </CardTitle>
            <Badge variant={planStatusVariant(plan.status)}>{plan.status}</Badge>
          </div>
          <div className="text-right text-sm">
            <span className="font-mono font-medium">{formatAUD(totalSpent)}</span>
            <span className="text-muted-foreground"> / {formatAUD(totalBudget)}</span>
          </div>
        </div>
        <div className="ml-8">
          <div className="flex items-center gap-2">
            <Progress value={utilisation} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground">{utilisation}%</span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Budget breakdown */}
          {plan.budgetLines.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget Categories</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {plan.budgetLines.map((bl) => {
                  const pct = bl.totalCents > 0 ? Math.round((bl.spentCents / bl.totalCents) * 100) : 0
                  return (
                    <div key={bl.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{bl.categoryName}</span>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5 mt-1" />
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatAUD(bl.spentCents)} spent / {formatAUD(bl.totalCents)} allocated
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Service Agreements */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Service Agreements ({sas.length})
              </h4>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/service-agreements/new?participantId=${participantId}&planId=${plan.id}`}>
                  <Plus className="mr-1 h-3 w-3" />
                  New SA
                </Link>
              </Button>
            </div>
            {sas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No service agreements linked to this plan.</p>
            ) : (
              sas.map((sa) => (
                <div key={sa.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <Link href={`/service-agreements/${sa.id}`} className="text-sm font-medium hover:underline">
                        {sa.agreementRef}
                      </Link>
                      {sa.provider && (
                        <p className="text-xs text-muted-foreground">{sa.provider.name}</p>
                      )}
                    </div>
                    <Badge variant={saStatusVariant(sa.status)} className="text-xs">{sa.status}</Badge>
                  </div>
                  <div className="text-sm font-mono text-muted-foreground">
                    {formatAUD(sa.totalCents)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PlansAgreementsTab({ participantId }: PlansAgreementsTabProps): React.JSX.Element {
  const [plans, setPlans] = useState<Plan[]>([])
  const [sasByPlan, setSasByPlan] = useState<Record<string, ServiceAgreement[]>>({})
  const [loading, setLoading] = useState(true)
  const [showOther, setShowOther] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        // Load plans with budget
        const plansRes = await fetch(`/api/plans?participantId=${participantId}&pageSize=50`)
        if (plansRes.ok) {
          const plansJson = await plansRes.json()
          const plansList: Plan[] = plansJson.data ?? []
          setPlans(plansList)

          // Load SAs
          const sasRes = await fetch(`/api/service-agreements?participantId=${participantId}&pageSize=100`)
          if (sasRes.ok) {
            const sasJson = await sasRes.json()
            const sasList: ServiceAgreement[] = sasJson.data ?? []

            // Group SAs by plan — simplified grouping
            const grouped: Record<string, ServiceAgreement[]> = {}
            for (const plan of plansList) {
              grouped[plan.id] = []
            }
            for (const sa of sasList) {
              // Try to match SA to a plan by date overlap
              const saStart = new Date(sa.startDate).getTime()
              const matchedPlan = plansList.find((p) => {
                const pStart = new Date(p.startDate).getTime()
                const pEnd = new Date(p.endDate).getTime()
                return saStart >= pStart && saStart <= pEnd
              })
              const key = matchedPlan?.id ?? 'unlinked'
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(sa)
            }
            setSasByPlan(grouped)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [participantId])

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading plans and agreements...</div>
  }

  if (plans.length === 0) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-muted-foreground text-sm">No plans found for this participant.</p>
        <Button variant="outline" asChild>
          <Link href={`/plans/new?participantId=${participantId}`}>
            <Plus className="mr-2 h-4 w-4" />
            Create Plan
          </Link>
        </Button>
      </div>
    )
  }

  const activePlans = plans.filter((p) => p.status === 'ACTIVE')
  const otherPlans = plans.filter((p) => p.status !== 'ACTIVE')

  return (
    <div className="space-y-4">
      {activePlans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          participantId={participantId}
          sas={sasByPlan[plan.id] ?? []}
        />
      ))}

      {otherPlans.length > 0 && (
        <div>
          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => setShowOther(!showOther)}
          >
            <span className="text-sm">Expired / Draft Plans ({otherPlans.length})</span>
            {showOther
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </Button>
          {showOther && (
            <div className="space-y-4 pt-2 opacity-60">
              {otherPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  participantId={participantId}
                  sas={sasByPlan[plan.id] ?? []}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Button variant="outline" asChild>
        <Link href={`/plans/new?participantId=${participantId}`}>
          <Plus className="mr-2 h-4 w-4" />
          Create Plan
        </Link>
      </Button>
    </div>
  )
}
