'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search } from 'lucide-react'
import { formatNdisNumber } from '@/lib/shared/ndis'

interface Participant {
  id: string
  ndisNumber: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  isActive: boolean
  assignedTo: { id: string; name: string } | null
  _count: { plans: number; invoices: number }
}

export default function ParticipantsPage(): React.JSX.Element {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '50' })
        if (search) params.set('search', search)
        const res = await fetch(`/api/crm/participants?${params.toString()}`)
        if (res.ok) {
          const json = await res.json()
          setParticipants(json.data)
        }
      } finally {
        setLoading(false)
      }
    }
    const timer = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Participants"
          description="Manage NDIS participants and their plans."
          actions={
            <Button asChild>
              <Link href="/participants/new"><Plus className="mr-2 h-4 w-4" />Add Participant</Link>
            </Button>
          }
        />

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or NDIS number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>NDIS Number</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Plan Manager</TableHead>
                <TableHead>Plans</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : participants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No participants found.</TableCell>
                </TableRow>
              ) : (
                participants.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/participants/${p.id}`} className="font-medium hover:underline">
                        {p.firstName} {p.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatNdisNumber(p.ndisNumber)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email ?? p.phone ?? '—'}</TableCell>
                    <TableCell className="text-sm">{p.assignedTo?.name ?? '—'}</TableCell>
                    <TableCell className="text-sm">{p._count.plans}</TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'default' : 'secondary'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardShell>
  )
}
