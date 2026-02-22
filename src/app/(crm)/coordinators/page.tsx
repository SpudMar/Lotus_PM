'use client'

import { useEffect, useState } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { UserCheck } from 'lucide-react'

interface CoordinatorWithCount {
  id: string
  name: string
  email: string
  role: string
  _count?: { coordinatorAssignments: number }
}

export default function CoordinatorsPage(): React.JSX.Element {
  const [coordinators, setCoordinators] = useState<CoordinatorWithCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/coordinators')
        if (res.ok) {
          const json = await res.json()
          setCoordinators(json)
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
          title="Support Coordinators"
          description="View and manage support coordinators and their participant assignments."
        />

        {loading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">Loading coordinators…</div>
        ) : coordinators.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            No support coordinators found. Assign the SUPPORT_COORDINATOR role to a user to get started.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Active Assignments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coordinators.map((coordinator) => (
                  <TableRow key={coordinator.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCheck className="text-muted-foreground h-4 w-4" />
                        {coordinator.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{coordinator.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Support Coordinator</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {coordinator._count?.coordinatorAssignments ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
