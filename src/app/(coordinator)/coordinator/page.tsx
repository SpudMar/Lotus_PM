'use client'

import { useEffect, useState } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface Assignment {
  id: string
  assignedAt: string
  organisation: string | null
  participant: {
    id: string
    firstName: string
    lastName: string
    ndisNumber: string
  }
}

export default function CoordinatorPortalPage(): React.JSX.Element {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/coordinators/portal')
        if (res.ok) {
          const json = await res.json()
          setAssignments(json)
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
          title="My Participants"
          description="Participants assigned to you as their support coordinator."
        />

        {loading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">Loading your participants…</div>
        ) : assignments.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            No participants are currently assigned to you.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NDIS Number</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.participant.firstName} {a.participant.lastName}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{a.participant.ndisNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{a.organisation ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(a.assignedAt).toLocaleDateString('en-AU')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">Active</Badge>
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
