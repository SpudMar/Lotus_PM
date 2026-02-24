'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateAU } from '@/lib/shared/dates'

interface DraftParticipant {
  id: string
  firstName: string
  lastName: string
  email: string | null
  ndisNumber: string
  createdAt: string
  onboardingStatus: string | null
  serviceAgreements: { id: string; status: string }[]
}

export default function OnboardingQueuePage(): React.JSX.Element {
  const [participants, setParticipants] = useState<DraftParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [activatingId, setActivatingId] = useState<string | null>(null)

  function loadDraftParticipants(): void {
    setLoading(true)
    void fetch('/api/crm/participants?page=1&pageSize=100&onboardingStatus=DRAFT')
      .then((r) => r.json())
      .then((j: { data: DraftParticipant[] }) => setParticipants(j.data))
      .catch(() => null)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDraftParticipants()
  }, [])

  async function handleActivate(id: string): Promise<void> {
    setActivatingId(id)
    try {
      const res = await fetch(`/api/crm/participants/${id}/activate-onboarding`, {
        method: 'POST',
      })
      if (res.ok) {
        // Remove from list
        setParticipants((prev) => prev.filter((p) => p.id !== id))
      }
    } finally {
      setActivatingId(null)
    }
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Onboarding Queue"
        description="Participants created via the WordPress intake form that are pending activation."
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading draft participants...
        </div>
      ) : participants.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No participants pending onboarding.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>NDIS Number</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Linked SA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.firstName} {p.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.email ?? '\u2014'}
                  </TableCell>
                  <TableCell>{p.ndisNumber}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateAU(new Date(p.createdAt))}
                  </TableCell>
                  <TableCell>
                    {p.serviceAgreements && p.serviceAgreements.length > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {p.serviceAgreements.length} SA{p.serviceAgreements.length !== 1 ? 's' : ''}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link href={`/participants/${p.id}`}>
                          View Details
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleActivate(p.id)}
                        disabled={activatingId === p.id}
                      >
                        {activatingId === p.id ? 'Activating...' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DashboardShell>
  )
}
