'use client'

/**
 * Settings Page — Integrations (Xero OAuth2) + NDIS Price Guide
 * REQ-014: NDIS Price Guide 2025-26 compliance.
 * REQ-019/REQ-023: Xero two-way sync.
 * Access: PM+ for most actions; GLOBAL_ADMIN only for price guide import.
 */

import { useEffect, useState, useCallback, Suspense, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, RefreshCw, Link2, Link2Off, Loader2, Upload, Search } from 'lucide-react'
import { format } from 'date-fns'
import type { XeroConnectionStatus, XeroSyncError, XeroSyncResult } from '@/lib/modules/xero/types'
import type { NdisSupportItem } from '@/lib/modules/price-guide/price-guide'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface XeroSyncApiResponse {
  syncedCount: number
  errorCount: number
  synced: XeroSyncResult[]
  errors: XeroSyncError[]
}

interface PriceGuideVersion {
  id: string
  label: string
  effectiveFrom: string
  effectiveTo: string | null
  itemCount: number
  importedAt: string
  importedBy: { name: string }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDollars(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(2)}`
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

// ─────────────────────────────────────────────
// Xero Tab
// ─────────────────────────────────────────────

function XeroTab({ isPMOrAdmin, canSync }: { isPMOrAdmin: boolean; canSync: boolean }): React.JSX.Element {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<XeroConnectionStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncResult, setSyncResult] = useState<XeroSyncApiResponse | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true)
      const res = await fetch('/api/xero/status')
      if (res.ok) {
        const json = await res.json() as { data: XeroConnectionStatus }
        setStatus(json.data)
      }
    } catch {
      // Network error
    } finally {
      setLoadingStatus(false)
    }
  }, [])

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
          setMessage({ type: 'error', text: `Synced ${syncedCount} invoice${syncedCount !== 1 ? 's' : ''}. ${errorCount} failed — see details below.` })
        }
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
    <div className="space-y-6">
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Xero Accounting</CardTitle>
              <CardDescription className="mt-1">
                Sync approved invoices to Xero as bills (Accounts Payable). REQ-019/REQ-023.
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
                <div className="flex gap-2">
                  <span className="font-medium text-muted-foreground w-32">Last sync:</span>
                  {status.lastSyncAt ? (
                    <span>{format(new Date(status.lastSyncAt), 'd MMM yyyy, h:mm a')}</span>
                  ) : (
                    <span className="text-muted-foreground italic">Never synced</span>
                  )}
                </div>
              </div>
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
                {isPMOrAdmin && (
                  <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting} size="sm">
                    {disconnecting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting...</>
                    ) : (
                      <><Link2Off className="mr-2 h-4 w-4" />Disconnect</>
                    )}
                  </Button>
                )}
              </div>
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
              {isPMOrAdmin ? (
                <Button onClick={handleConnect} size="sm">
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect Xero
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Only a Plan Manager or Admin can connect Xero. Contact your system administrator.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// Upload Dialog
// ─────────────────────────────────────────────

function UploadDialog({ onSuccess }: { onSuccess: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(): Promise<void> {
    if (!file || !label.trim() || !effectiveFrom) {
      setError('Please complete all fields.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('label', label.trim())
      fd.append('effectiveFrom', effectiveFrom)
      const res = await fetch('/api/price-guide/import', { method: 'POST', body: fd })
      const body = await res.json() as { data?: { versionId: string; itemCount: number }; error?: string }
      if (res.ok && body.data) {
        setOpen(false)
        setLabel('')
        setEffectiveFrom('')
        setFile(null)
        if (fileRef.current) fileRef.current.value = ''
        onSuccess()
      } else {
        setError(body.error ?? 'Upload failed.')
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Import Price Guide
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import NDIS Price Guide</DialogTitle>
          <DialogDescription>
            Upload the NDIS Support Catalogue XLSX file. This will close the current active version.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pg-label">Version Label</Label>
            <Input
              id="pg-label"
              placeholder="e.g. 2025-26 v1.1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-date">Effective From</Label>
            <Input
              id="pg-date"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-file">XLSX File</Label>
            <Input
              id="pg-file"
              type="file"
              accept=".xlsx"
              ref={fileRef}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing...</> : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// Price Guide Tab
// ─────────────────────────────────────────────

function PriceGuideTab({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const [versions, setVersions] = useState<PriceGuideVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [items, setItems] = useState<NdisSupportItem[]>([])
  const [total, setTotal] = useState(0)
  const [loadingItems, setLoadingItems] = useState(false)
  const [q, setQ] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [offset, setOffset] = useState(0)
  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true)
    try {
      const res = await fetch('/api/price-guide/versions')
      if (res.ok) {
        const json = await res.json() as { data: PriceGuideVersion[] }
        setVersions(json.data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingVersions(false)
    }
  }, [])

  const fetchItems = useCallback(async (search: string, versionId: string, off: number) => {
    setLoadingItems(true)
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) })
      if (search) params.set('q', search)
      if (versionId) params.set('versionId', versionId)
      const res = await fetch(`/api/price-guide/items?${params.toString()}`)
      if (res.ok) {
        const json = await res.json() as { data: { items: NdisSupportItem[]; total: number } }
        setItems(json.data.items)
        setTotal(json.data.total)
      }
    } catch {
      // ignore
    } finally {
      setLoadingItems(false)
    }
  }, [])

  useEffect(() => {
    void fetchVersions()
  }, [fetchVersions])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setOffset(0)
      void fetchItems(q, selectedVersionId, 0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q, selectedVersionId, fetchItems])

  useEffect(() => {
    void fetchItems(q, selectedVersionId, offset)
  }, [offset]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Versions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Price Guide Versions</CardTitle>
              <CardDescription className="mt-1">
                NDIS Support Catalogue versions. REQ-014.
              </CardDescription>
            </div>
            {isAdmin && <UploadDialog onSuccess={() => { void fetchVersions() }} />}
          </div>
        </CardHeader>
        <CardContent>
          {loadingVersions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No price guide versions have been imported yet.
              {isAdmin && ' Use the Import button above to add one.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Imported By</TableHead>
                  <TableHead>Imported At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.label}</TableCell>
                    <TableCell>{format(new Date(v.effectiveFrom), 'd MMM yyyy')}</TableCell>
                    <TableCell>
                      {v.effectiveTo ? format(new Date(v.effectiveTo), 'd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">{v.itemCount.toLocaleString()}</TableCell>
                    <TableCell>
                      {v.effectiveTo === null ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Superseded</Badge>
                      )}
                    </TableCell>
                    <TableCell>{v.importedBy.name}</TableCell>
                    <TableCell>{format(new Date(v.importedAt), 'd MMM yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Browse Items */}
      <Card>
        <CardHeader>
          <CardTitle>Browse Support Items</CardTitle>
          <CardDescription>Search and filter NDIS support catalogue items.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by item number or name..."
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
            >
              <option value="">Active version</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          {loadingItems ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading items...
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No items found.</p>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Standard</TableHead>
                      <TableHead className="text-right">Remote</TableHead>
                      <TableHead className="text-right">Very Remote</TableHead>
                      <TableHead>Quotable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.itemNumber}</TableCell>
                        <TableCell className="max-w-xs truncate">{item.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.categoryName}</TableCell>
                        <TableCell>{item.unitType}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatDollars(item.priceStandardCents)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatDollars(item.priceRemoteCents)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatDollars(item.priceVeryRemoteCents)}
                        </TableCell>
                        <TableCell>
                          {item.quotable ? (
                            <Badge variant="outline">Quotable</Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {offset + 1}&#x2013;{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + LIMIT >= total}
                    onClick={() => setOffset(offset + LIMIT)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

function SettingsContent(): React.JSX.Element {
  const { data: session } = useSession()
  const isPMOrAdmin = session?.user?.role === 'PLAN_MANAGER' || session?.user?.role === 'GLOBAL_ADMIN'
  const canSync = isPMOrAdmin
  const isAdmin = session?.user?.role === 'GLOBAL_ADMIN'

  return (
    <DashboardShell>
      <PageHeader title="Settings" description="System configuration and integrations" />
      <div className="mt-6 max-w-5xl">
        <Tabs defaultValue="xero">
          <TabsList className="mb-6">
            <TabsTrigger value="xero">Xero Accounting</TabsTrigger>
            <TabsTrigger value="price-guide">NDIS Price Guide</TabsTrigger>
          </TabsList>
          <TabsContent value="xero">
            <XeroTab isPMOrAdmin={isPMOrAdmin} canSync={canSync} />
          </TabsContent>
          <TabsContent value="price-guide">
            <PriceGuideTab isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
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
