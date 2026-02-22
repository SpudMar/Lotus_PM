import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { hasPermission, type Role } from '@/lib/auth/rbac'
import { getServiceAgreement } from '@/lib/modules/service-agreements/service-agreements'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export default async function ServiceAgreementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'service-agreements:read')) {
    redirect('/dashboard')
  }

  const canWrite = hasPermission(role, 'service-agreements:write')
  const { id } = await params

  let agreement: Awaited<ReturnType<typeof getServiceAgreement>>
  try {
    agreement = await getServiceAgreement(id)
  } catch {
    notFound()
  }

  const isDraft = agreement.status === 'DRAFT'
  const isActive = agreement.status === 'ACTIVE'

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/service-agreements"
              className="text-sm text-muted-foreground hover:underline"
            >
              Service Agreements
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono text-sm font-medium">{agreement.agreementRef}</span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {agreement.agreementRef}
            <Badge variant={statusVariant(agreement.status)}>{agreement.status}</Badge>
          </h1>
        </div>

        {canWrite && (
          <div className="flex gap-2">
            {isDraft && (
              <form action={`/api/service-agreements/${agreement.id}/activate`} method="POST">
                <Button type="submit" variant="default">Activate</Button>
              </form>
            )}
            {isActive && (
              <form action={`/api/service-agreements/${agreement.id}/terminate`} method="POST">
                <Button type="submit" variant="destructive">Terminate</Button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Participant</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {agreement.participant?.firstName} {agreement.participant?.lastName}
            </p>
            <p className="text-sm text-muted-foreground">NDIS: {agreement.participant?.ndisNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{agreement.provider?.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Agreement Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Start</span>
              <span>{new Date(agreement.startDate).toLocaleDateString('en-AU')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">End</span>
              <span>{new Date(agreement.endDate).toLocaleDateString('en-AU')}</span>
            </div>
            {agreement.reviewDate && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Review</span>
                <span>{new Date(agreement.reviewDate).toLocaleDateString('en-AU')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Managed By</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{agreement.managedBy.name}</p>
            {agreement.notes && (
              <p className="text-sm text-muted-foreground mt-2">{agreement.notes}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rate Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rate Lines</h2>
          {canWrite && isDraft && (
            <Button asChild size="sm">
              <Link href={`/service-agreements/${agreement.id}/rate-lines/new`}>Add Rate Line</Link>
            </Button>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Support Item</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Max Qty</TableHead>
                <TableHead>Unit</TableHead>
                {canWrite && isDraft && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {agreement.rateLines.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canWrite && isDraft ? 6 : 5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No rate lines defined.
                  </TableCell>
                </TableRow>
              )}
              {agreement.rateLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{line.categoryCode}</span>
                    <br />
                    <span className="text-sm">{line.categoryName}</span>
                  </TableCell>
                  <TableCell>
                    {line.supportItemCode ? (
                      <>
                        <span className="font-mono text-xs">{line.supportItemCode}</span>
                        <br />
                        <span className="text-sm">{line.supportItemName}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    ${(line.agreedRateCents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {line.maxQuantity != null ? String(line.maxQuantity) : '—'}
                  </TableCell>
                  <TableCell>{line.unitType ?? '—'}</TableCell>
                  {canWrite && isDraft && (
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/service-agreements/${agreement.id}/rate-lines/${line.id}/edit`}>
                          Edit
                        </Link>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
