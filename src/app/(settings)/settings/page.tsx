'use client'

/**
 * Settings Page — Integrations (Xero OAuth2)
 * REQ-019/REQ-023: Xero two-way sync.
 * Access: Director only (xero:write) for connect/disconnect; PM can view status.
 */

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, RefreshCw, Link2, Link2Off, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import type { XeroConnectionStatus, XeroSyncError, XeroSyncResult } from '@/lib/modules/xero/types'

// API response shape for /api/xero/sync (augments XeroBulkSyncResult with counts)
interface XeroSyncApiResponse {
  syncedCount: number
  errorCount: number
  synced: XeroSyncResult[]
  errors: XeroSyncError[]
}

function StatusBadge({ connected }: { connected: boolean }): React.JSX.Element {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
        <CheckCircle className="h-4 w-4" />
        Connected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
      <XCircle className="h-4 w-4" />
      Not connected
    </span>
  )
}

function SettingsContent(): React.JSX.Element {
  const { data: session } = useSession()
  const searchParams = useSearchParams()

  const [status, setStatus] = useState<XeroConnectionStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncResult, setSyncResult] = useState<XeroSyncApiResponse | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isDirector = session?.user?.role === 'DIRECTOR'
  const canSync = session?.user?.role === 'DIRECTOR' || session?.user?.role === 'PLAN_MANAGER'

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true)
      const res = await fetch('/api/xero/status')
      if (res.ok) {
        const json = await res.json() as { data: XeroConnectionStatus }
        setStatus(json.data)
      }
    } catch {
      // Network error — status stays null
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  // Handle OAuth redirect messages from query params
  useEffect(() => {
    const xero = searchParams.get('xero')
    if (xero === 'connected') {
      setMessage({ type: 'success', text: 'Xero connected successfully.' })
    } else if (xero === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown'
      setMessage({ type: 'error', text: `Xero connection failed: ${reason.replace(/_/g, ' ')}.` })
    }
  }, [searchParams])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  async function handleConnect(): Promise<void> {
    // Full-page redirect to OAuth flow
    window.location.href = '/api/xero/auth'
  }

  async function handleDisconnect(): Promise<void> {
    if (!confirm('Are you sure you want to disconnect Xero? Existing synced records in Xero will not be deleted.')) return

    try {
      setDisconnecting(true)
      const res = await fetch('/api/xero/disconnect', { method: 'DELETE' })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Xero disconnected.' })
        setStatus({ connected: false })
        setSyncResult(null)
      } else {
        const body = await res.json() as { error: string }
        setMessage({ type: 'error', text: `Disconnect failed: ${body.error}` })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error — please try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleSync(): Promise<void> {
    try {
      setSyncing(true)
      setSyncResult(null)
      const res = await fetch('/api/xero/sync', { method: 'POST' })
      const body = await res.json() as { data?: XeroSyncApiResponse; error?: string }

      if (res.ok && body.data) {
        setSyncResult(body.data)
        const { syncedCount, errorCount } = body.data
        if (errorCount === 0) {
          setMessage({ type: 'success', text: `Synced ${syncedCount} invoice${syncedCount !== 1 ? 's' : ''} to Xero.` })
        } else {
          setMessage({
            type: 'error',
            text: `Synced ${syncedCount} invoice${syncedCount !== 1 ? 's' : ''}. ${errorCount} failed — see details below.`,
          })
        }
        // Refresh status to update lastSyncAt
        await fetchStatus()
      } else {
        setMessage({ type: 'error', text: body.error ?? 'Sync failed.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error — please try again.' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <DashboardShell>
      <PageHeader title="Settings" description="System configuration and integrations" />

      <div className="mt-6 max-w-2xl space-y-6">
        {/* Flash message */}
        {message && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Xero Integration Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Xero Accounting</CardTitle>
                <CardDescription className="mt-1">
                  Sync approved invoices to Xero as bills (Accounts Payable).
                  REQ-019/REQ-023.
                </CardDescription>
              </div>
              {loadingStatus ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <StatusBadge connected={status?.connected ?? false} />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {status?.connected ? (
              <>
                {/* Connection details */}
                <div className="rounded-md bg-muted/40 p-4 text-sm space-y-1">
                  <div className="flex gap-2">
                    <span className="font-medium text-muted-foreground w-32">Organisation:</span>
                    <span>{status.tenantName ?? status.tenantId}</span>
                  </div>
                  {status.connectedAt && (
                    <div className="flex gap-2">
                      <span className="font-medium text-muted-foreground w-32">Connected:</span>
                      <span>{format(new Date(status.connectedAt), 'd MMM yyyy, h:mm a')}</span>
                    </div>
                  )}
                  {status.lastSyncAt && (
                    <div className="flex gap-2">
                      <span className="font-medium text-muted-foreground w-32">Last sync:</span>
                      <span>{format(new Date(status.lastSyncAt), 'd MMM yyyy, h:mm a')}</span>
                    </div>
                  )}
                  {!status.lastSyncAt && (
                    <div className="flex gap-2">
                      <span className="font-medium text-muted-foreground w-32">Last sync:</span>
                      <span className="text-muted-foreground italic">Never synced</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  {canSync && (
                    <Button onClick={handleSync} disabled={syncing} size="sm">
                      {syncing ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Syncing...</>
                      ) : (
                        <><RefreshCw className="mr-2 h-4 w-4" />Sync Approved Invoices</>
                      )}
                    </Button>
                  )}
                  {isDirector && (
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      size="sm"
                    >
                      {disconnecting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting...</>
                      ) : (
                        <><Link2Off className="mr-2 h-4 w-4" />Disconnect</>
                      )}
                    </Button>
                  )}
                </div>

                {/* Sync results */}
                {syncResult && (
                  <div className="rounded-md border p-4 text-sm space-y-2">
                    <p className="font-medium">Sync results</p>
                    <p className="text-muted-foreground">
                      {syncResult.syncedCount} synced &bull; {syncResult.errorCount} failed
                    </p>
                    {syncResult.errors.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {syncResult.errors.map((e) => (
                          <li key={e.invoiceId} className="text-red-600">
                            Invoice {e.invoiceId}: {e.error}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your Xero organisation to automatically sync approved invoices as bills.
                  You will be redirected to Xero to authorise access.
                </p>
                {isDirector ? (
                  <Button onClick={handleConnect} size="sm">
                    <Link2 className="mr-2 h-4 w-4" />
                    Connect Xero
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Only a Director can connect Xero. Contact your system administrator.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}

export default function SettingsPage(): React.JSX.Element {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
