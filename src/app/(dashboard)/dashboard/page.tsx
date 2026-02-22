'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users,
  Receipt,
  FileText,
  CreditCard,
  AlertTriangle,
  Clock,
  Plus,
  ArrowRight,
  Landmark,
  TrendingUp,
} from 'lucide-react'
import type { DashboardSummary } from '@/lib/modules/reports/reports'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  accent?: 'brand' | 'amber' | 'sky' | 'violet'
}

function StatCard({ title, value, subtitle, icon: Icon, href, accent = 'brand' }: StatCardProps): React.JSX.Element {
  const accentStyles = {
    brand: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
  }

  return (
    <Link href={href} className="group">
      <Card className="transition-shadow duration-200 group-hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className={`rounded-lg p-2.5 ${accentStyles[accent]}`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function DashboardPage(): React.JSX.Element {
  const { data: session } = useSession()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    fetch('/api/reports/dashboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data: DashboardSummary } | null) => {
        if (json) setSummary(json.data)
      })
      .catch(() => undefined)
  }, [])

  const firstName = session?.user?.name?.split(' ')[0]

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title={`Good ${getGreeting()}${firstName ? `, ${firstName}` : ''}`}
          description="Your plan management overview at a glance."
        />

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link href="/participants">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Participant
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/invoices">
              <Receipt className="mr-1.5 h-3.5 w-3.5" />
              Upload Invoice
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/claims">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" />
              Run Claims Batch
            </Link>
          </Button>
        </div>

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Participants"
            value={summary ? String(summary.participants.active) : '—'}
            subtitle={summary ? `${summary.participants.total} total` : undefined}
            icon={Users}
            href="/participants"
            accent="brand"
          />
          <StatCard
            title="Pending Invoices"
            value={summary ? String(summary.invoices.pendingReview) : '—'}
            subtitle={summary ? `${summary.invoices.received} received, ${summary.invoices.approved} approved` : undefined}
            icon={Receipt}
            href="/invoices"
            accent="amber"
          />
          <StatCard
            title="Active Plans"
            value={summary ? String(summary.plans.active) : '—'}
            subtitle={summary?.plans.expiringSoon ? `${summary.plans.expiringSoon} expiring soon` : undefined}
            icon={FileText}
            href="/plans"
            accent="sky"
          />
          <StatCard
            title="Pending Claims"
            value={summary ? String(summary.claims.pending + summary.claims.submitted) : '—'}
            subtitle={summary ? `${summary.claims.approved} approved, ${summary.claims.rejected} rejected` : undefined}
            icon={CreditCard}
            href="/claims"
            accent="violet"
          />
        </div>

        {/* Attention + Pipeline Row */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Needs Attention */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary ? (
                <>
                  <AttentionItem
                    label="Invoices pending review"
                    count={summary.invoices.pendingReview}
                    href="/invoices"
                    urgent={summary.invoices.pendingReview > 10}
                  />
                  <AttentionItem
                    label="Plans expiring soon"
                    count={summary.plans.expiringSoon}
                    href="/plans"
                    urgent={summary.plans.expiringSoon > 0}
                  />
                  <AttentionItem
                    label="Claims pending submission"
                    count={summary.claims.pending}
                    href="/claims"
                  />
                  <AttentionItem
                    label="Payments to process"
                    count={summary.payments.pending}
                    href="/banking"
                  />
                  {summary.invoices.pendingReview === 0 &&
                   summary.plans.expiringSoon === 0 &&
                   summary.claims.pending === 0 &&
                   summary.payments.pending === 0 && (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      All clear — nothing needs attention right now.
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 animate-pulse-gentle rounded bg-muted" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processing Pipeline */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Processing Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <PipelineStat
                    label="Invoices"
                    stages={[
                      { name: 'Received', count: summary.invoices.received },
                      { name: 'Pending', count: summary.invoices.pendingReview },
                      { name: 'Approved', count: summary.invoices.approved },
                    ]}
                    href="/invoices"
                  />
                  <PipelineStat
                    label="Claims"
                    stages={[
                      { name: 'Pending', count: summary.claims.pending },
                      { name: 'Submitted', count: summary.claims.submitted },
                      { name: 'Approved', count: summary.claims.approved },
                    ]}
                    href="/claims"
                  />
                  <PipelineStat
                    label="Payments"
                    stages={[
                      { name: 'Pending', count: summary.payments.pending },
                      { name: 'In ABA', count: summary.payments.inAbaFile },
                      { name: 'Cleared', count: summary.payments.cleared },
                    ]}
                    href="/banking"
                  />
                  <PipelineStat
                    label="Plans"
                    stages={[
                      { name: 'Active', count: summary.plans.active },
                      { name: 'Expiring', count: summary.plans.expiringSoon },
                      { name: 'Expired', count: summary.plans.expired },
                    ]}
                    href="/plans"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 animate-pulse-gentle rounded bg-muted" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Recent Invoices
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/invoices" className="text-xs">
                    View all <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="py-4 text-center text-sm text-muted-foreground">
                Invoice data will appear here as invoices are processed.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Upcoming Plan Reviews
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/plans" className="text-xs">
                    View all <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="py-4 text-center text-sm text-muted-foreground">
                Plans nearing review dates will appear here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}

/** Get time-appropriate greeting */
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/** Single attention item row */
function AttentionItem({
  label,
  count,
  href,
  urgent,
}: {
  label: string
  count: number
  href: string
  urgent?: boolean
}): React.JSX.Element | null {
  if (count === 0) return null
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
    >
      <span className={urgent ? 'font-medium text-amber-700' : 'text-muted-foreground'}>
        {label}
      </span>
      <span className={`text-sm font-semibold ${urgent ? 'text-amber-600' : 'text-foreground'}`}>
        {count}
      </span>
    </Link>
  )
}

/** Pipeline stat mini-card */
function PipelineStat({
  label,
  stages,
  href,
}: {
  label: string
  stages: { name: string; count: number }[]
  href: string
}): React.JSX.Element {
  return (
    <Link href={href} className="group rounded-lg border p-3 transition-colors hover:border-primary/30 hover:bg-accent/50">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-primary">
        {label}
      </p>
      <div className="space-y-1">
        {stages.map((stage) => (
          <div key={stage.name} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{stage.name}</span>
            <span className="font-medium tabular-nums">{stage.count}</span>
          </div>
        ))}
      </div>
    </Link>
  )
}
