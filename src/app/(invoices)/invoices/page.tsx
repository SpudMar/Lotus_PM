'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, Search } from 'lucide-react'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  receivedAt: string
  totalCents: number
  status: string
  participant: { id: string; firstName: string; lastName: string; ndisNumber: string }
  provider: { id: string; name: string }
  approvedBy: { id: string; name: string } | null
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'APPROVED': case 'PAID': return 'default'
    case 'PENDING_REVIEW': return 'outline'
    case 'REJECTED': return 'destructive'
    default: return 'secondary'
  }
}

export default function InvoicesPage(): React.JSX.Element {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '50' })
        if (statusFilter !== 'all') params.set('status', statusFilter)
        const res = await fetch(`/api/invoices?${params.toString()}`)
        if (res.ok) {
          const json = await res.json()
          setInvoices(json.data)
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [statusFilter])

  const q = searchQuery.toLowerCase()
  const filteredInvoices = searchQuery
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.provider.name.toLowerCase().includes(q) ||
          `${inv.participant.firstName} ${inv.participant.lastName}`.toLowerCase().includes(q)
      )
    : invoices

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Invoices"
          description="Process, review, and approve NDIS invoices."
          actions={
            <Button asChild>
              <Link href="/invoices/upload"><Upload className="mr-2 h-4 w-4" />Upload Invoice</Link>
            </Button>
          }
        />

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="RECEIVED">Received</TabsTrigger>
            <TabsTrigger value="PENDING_REVIEW">Pending Review</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {searchQuery ? 'No invoices match your search.' : 'No invoices found.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{inv.provider.name}</TableCell>
                    <TableCell className="text-sm">{inv.participant.firstName} {inv.participant.lastName}</TableCell>
                    <TableCell className="text-sm">{formatDateAU(new Date(inv.invoiceDate))}</TableCell>
                    <TableCell className="font-mono text-sm">{formatAUD(inv.totalCents)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)}>
                        {inv.status.replace(/_/g, ' ')}
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
