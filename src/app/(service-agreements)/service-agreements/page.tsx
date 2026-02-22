import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { hasPermission, type Role } from '@/lib/auth/rbac'
import { listServiceAgreements } from '@/lib/modules/service-agreements/service-agreements'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SaStatusValue } from '@/lib/modules/service-agreements/types'

function statusVariant(status: SaStatusValue): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVE': return 'default'
    case 'DRAFT': return 'secondary'
    case 'TERMINATED': return 'destructive'
    case 'EXPIRED': return 'outline'
  }
}

export default async function ServiceAgreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'service-agreements:read')) {
    redirect('/dashboard')
  }

  const canWrite = hasPermission(role, 'service-agreements:write')
  const { status } = await searchParams

  const agreements = await listServiceAgreements(
    status ? { status: status as SaStatusValue } : {}
  )

  const statuses: SaStatusValue[] = ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED']

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Agreements</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage provider-participant service agreements
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/service-agreements/new">New Agreement</Link>
          </Button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Link href="/service-agreements">
          <Badge variant={!status ? 'default' : 'outline'} className="cursor-pointer">All</Badge>
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/service-agreements?status=${s}`}>
            <Badge variant={status === s ? 'default' : 'outline'} className="cursor-pointer">{s}</Badge>
          </Link>
        ))}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agreements.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No service agreements found.
                </TableCell>
              </TableRow>
            )}
            {agreements.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-sm font-medium">{a.agreementRef}</TableCell>
                <TableCell>
                  {a.participant?.firstName} {a.participant?.lastName}
                </TableCell>
                <TableCell>{a.provider?.name}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                </TableCell>
                <TableCell>{new Date(a.startDate).toLocaleDateString('en-AU')}</TableCell>
                <TableCell>{new Date(a.endDate).toLocaleDateString('en-AU')}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/service-agreements/${a.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
