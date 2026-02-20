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
import { formatABN } from '@/lib/shared/ndis'

interface Provider {
  id: string
  name: string
  abn: string
  email: string | null
  phone: string | null
  ndisRegistered: boolean
  isActive: boolean
  _count: { invoices: number }
}

export default function ProvidersPage(): React.JSX.Element {
  const [providers, setProviders] = useState<Provider[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '50' })
        if (search) params.set('search', search)
        const res = await fetch(`/api/crm/providers?${params.toString()}`)
        if (res.ok) {
          const json = await res.json()
          setProviders(json.data)
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
          title="Providers"
          description="Manage NDIS service providers."
          actions={
            <Button asChild>
              <Link href="/providers/new"><Plus className="mr-2 h-4 w-4" />Add Provider</Link>
            </Button>
          }
        />

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or ABN..."
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
                <TableHead>Provider Name</TableHead>
                <TableHead>ABN</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>NDIS Registered</TableHead>
                <TableHead>Invoices</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : providers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No providers found.</TableCell>
                </TableRow>
              ) : (
                providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/providers/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatABN(p.abn)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email ?? p.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={p.ndisRegistered ? 'default' : 'outline'}>
                        {p.ndisRegistered ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{p._count.invoices}</TableCell>
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
