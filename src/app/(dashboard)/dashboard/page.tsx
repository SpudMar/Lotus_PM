'use client'

import { useSession } from 'next-auth/react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Receipt, FileText, CreditCard } from 'lucide-react'

const stats = [
  { title: 'Active Participants', value: '—', icon: Users, href: '/participants' },
  { title: 'Pending Invoices', value: '—', icon: Receipt, href: '/invoices' },
  { title: 'Active Plans', value: '—', icon: FileText, href: '/plans' },
  { title: 'Pending Claims', value: '—', icon: CreditCard, href: '/claims' },
]

export default function DashboardPage(): React.JSX.Element {
  const { data: session } = useSession()

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title={`Welcome back${session?.user?.name ? `, ${session.user.name}` : ''}`}
          description="Here's what's happening with your plan management today."
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Plan Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No upcoming reviews.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
