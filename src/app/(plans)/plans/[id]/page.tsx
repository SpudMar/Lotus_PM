'use client'

/**
 * Plan detail page -- shows plan metadata and budget lines with inline editing.
 * - Edit plan dates and status
 * - Inline add/edit/delete budget lines
 * - SA committed column (WS-F6)
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatAUD } from '@/lib/shared/currency'
import { formatDateAU } from '@/lib/shared/dates'
import { Pencil, Plus, Trash2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetLineWithCommitment {
  id: string
  categoryCode: string
  categoryName: string
  allocatedCents: number
  spentCents: number
  reservedCents: number
  saCommittedCents: number
  remainingCents: number
}

interface Plan {
  id: string
  startDate: string
  endDate: string
  status: string
  participant: {
    id: string
    firstName: string
    lastName: string
    ndisNumber: string
  }
  budgetLines: { allocatedCents: number; spentCents: number; reservedCents: number }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'EXPIRING_SOON', label: 'Expiring Soon' },
  { value: 'INACTIVE', label: 'Inactive' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVE': return 'default'
    case 'EXPIRING_SOON': return 'outline'
    case 'EXPIRED': return 'secondary'
    case 'UNDER_REVIEW': return 'outline'
    default: return 'secondary'
  }
}

// ── Form data types ───────────────────────────────────────────────────────────

interface PlanMetaFormData {
  startDate: string
  endDate: string
  status: string
}

interface BudgetLineFormData {
  categoryCode: string
  categoryName: string
  allocatedStr: string
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlanDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>()
  const planId = params.id

  const [plan, setPlan] = useState<Plan | null>(null)
  const [budgetLines, setBudgetLines] = useState<BudgetLineWithCommitment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Plan metadata editing
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaSaving, setMetaSaving] = useState(false)
  const [metaForm, setMetaForm] = useState<PlanMetaFormData>({
    startDate: '', endDate: '', status: '',
  })

  // Budget line editing
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineForm, setLineForm] = useState<BudgetLineFormData>({
    categoryCode: '', categoryName: '', allocatedStr: '',
  })
  const [lineSaving, setLineSaving] = useState(false)

  // Add new budget line
  const [showAddLine, setShowAddLine] = useState(false)
  const [addLineForm, setAddLineForm] = useState<BudgetLineFormData>({
    categoryCode: '', categoryName: '', allocatedStr: '',
  })
  const [addLineSaving, setAddLineSaving] = useState(false)

  // Delete confirmation
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null)
  const [deleteLineName, setDeleteLineName] = useState('')
  const [deleting, setDeleting] = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [planRes, linesRes] = await Promise.all([
        fetch(`/api/plans/${planId}`),
        fetch(`/api/plans/${planId}/budget-lines`),
      ])

      if (!planRes.ok) {
        setError('Plan not found.')
        return
      }

      const planJson = await planRes.json()
      setPlan(planJson.data)

      if (linesRes.ok) {
        const linesJson = await linesRes.json()
        setBudgetLines(linesJson.data)
      }
    } catch {
      setError('Failed to load plan.')
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void load()
  }, [load])

  // ── Plan metadata editing ─────────────────────────────────────────────────

  function startEditMeta(): void {
    if (!plan) return
    setMetaForm({
      startDate: plan.startDate.slice(0, 10),
      endDate: plan.endDate.slice(0, 10),
      status: plan.status,
    })
    setEditingMeta(true)
  }

  function cancelEditMeta(): void {
    setEditingMeta(false)
  }

  async function saveMeta(): Promise<void> {
    setMetaSaving(true)
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: metaForm.startDate,
          endDate: metaForm.endDate,
          status: metaForm.status,
        }),
      })
      if (res.ok) {
        setEditingMeta(false)
        await load()
      }
    } finally {
      setMetaSaving(false)
    }
  }

  // ── Budget line inline editing ────────────────────────────────────────────

  function startEditLine(line: BudgetLineWithCommitment): void {
    setEditingLineId(line.id)
    setLineForm({
      categoryCode: line.categoryCode,
      categoryName: line.categoryName,
      allocatedStr: (line.allocatedCents / 100).toFixed(2),
    })
  }

  function cancelEditLine(): void {
    setEditingLineId(null)
  }

  async function saveLine(): Promise<void> {
    if (!editingLineId) return
    setLineSaving(true)
    try {
      const allocatedCents = Math.round(parseFloat(lineForm.allocatedStr) * 100)
      const res = await fetch(`/api/plans/${planId}/budget-lines/${editingLineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocatedCents,
          categoryName: lineForm.categoryName,
        }),
      })
      if (res.ok) {
        setEditingLineId(null)
        await load()
      }
    } finally {
      setLineSaving(false)
    }
  }

  // ── Add new budget line ───────────────────────────────────────────────────

  function openAddLine(): void {
    setAddLineForm({ categoryCode: '', categoryName: '', allocatedStr: '' })
    setShowAddLine(true)
  }

  async function handleAddLine(): Promise<void> {
    if (!addLineForm.categoryCode || !addLineForm.categoryName || !addLineForm.allocatedStr) return
    setAddLineSaving(true)
    try {
      const allocatedCents = Math.round(parseFloat(addLineForm.allocatedStr) * 100)
      const res = await fetch(`/api/plans/${planId}/budget-lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryCode: addLineForm.categoryCode,
          categoryName: addLineForm.categoryName,
          allocatedCents,
        }),
      })
      if (res.ok) {
        setShowAddLine(false)
        await load()
      }
    } finally {
      setAddLineSaving(false)
    }
  }

  // ── Delete budget line ────────────────────────────────────────────────────

  function openDeleteDialog(line: BudgetLineWithCommitment): void {
    setDeleteLineId(line.id)
    setDeleteLineName(`${line.categoryCode} — ${line.categoryName}`)
  }

  async function handleDeleteLine(): Promise<void> {
    if (!deleteLineId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/plans/${planId}/budget-lines/${deleteLineId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDeleteLineId(null)
        await load()
      }
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardShell>
        <p className="text-muted-foreground">Loading...</p>
      </DashboardShell>
    )
  }

  if (error || !plan) {
    return (
      <DashboardShell>
        <p className="text-destructive">{error ?? 'Plan not found.'}</p>
      </DashboardShell>
    )
  }

  const totalAllocated = budgetLines.reduce((s, l) => s + l.allocatedCents, 0)
  const totalSpent = budgetLines.reduce((s, l) => s + l.spentCents, 0)
  const totalCommitted = budgetLines.reduce((s, l) => s + l.saCommittedCents, 0)
  const totalRemaining = budgetLines.reduce((s, l) => s + l.remainingCents, 0)

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/plans" className="hover:underline">Plans</Link>
          <span>/</span>
          <span>
            {plan.participant.firstName} {plan.participant.lastName}
          </span>
        </div>

        <PageHeader
          title={`${plan.participant.firstName} ${plan.participant.lastName}`}
          description={`NDIS: ${plan.participant.ndisNumber}`}
          actions={<Badge variant={statusVariant(plan.status)}>{plan.status.replace(/_/g, ' ')}</Badge>}
        />

        {/* ── Plan metadata ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Plan Details</CardTitle>
            {!editingMeta ? (
              <Button variant="outline" size="sm" onClick={startEditMeta}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelEditMeta} disabled={metaSaving}>Cancel</Button>
                <Button size="sm" onClick={() => void saveMeta()} disabled={metaSaving}>
                  {metaSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editingMeta ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-startDate" className="text-xs">Start date</Label>
                  <Input
                    id="edit-startDate"
                    type="date"
                    value={metaForm.startDate}
                    onChange={(e) => setMetaForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-endDate" className="text-xs">End date</Label>
                  <Input
                    id="edit-endDate"
                    type="date"
                    value={metaForm.endDate}
                    onChange={(e) => setMetaForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-status" className="text-xs">Status</Label>
                  <Select
                    value={metaForm.status}
                    onValueChange={(v) => setMetaForm(prev => ({ ...prev, status: v }))}
                  >
                    <SelectTrigger id="edit-status" className="h-8 text-sm">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Start</p>
                  <p className="text-sm font-medium">{formatDateAU(new Date(plan.startDate))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">End</p>
                  <p className="text-sm font-medium">{formatDateAU(new Date(plan.endDate))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Total Budget</p>
                  <p className="text-sm font-semibold">{formatAUD(totalAllocated)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Remaining</p>
                  <p className="text-sm font-semibold">{formatAUD(totalRemaining)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Budget Lines ────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Budget Lines</h2>
            <Button size="sm" onClick={openAddLine}>
              <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Add line
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Committed (SA)</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetLines.length === 0 && !showAddLine ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No budget lines defined.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {budgetLines.map((line) => (
                      <TableRow key={line.id}>
                        {editingLineId === line.id ? (
                          <>
                            <TableCell>
                              <div className="space-y-1">
                                <Input
                                  value={lineForm.categoryCode}
                                  onChange={(e) => setLineForm(prev => ({ ...prev, categoryCode: e.target.value }))}
                                  className="h-7 text-xs w-20 font-mono"
                                  disabled
                                  title="Category code cannot be changed"
                                />
                                <Input
                                  value={lineForm.categoryName}
                                  onChange={(e) => setLineForm(prev => ({ ...prev, categoryName: e.target.value }))}
                                  className="h-7 text-xs"
                                  placeholder="Category name"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                value={lineForm.allocatedStr}
                                onChange={(e) => setLineForm(prev => ({ ...prev, allocatedStr: e.target.value }))}
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-7 text-xs w-28 ml-auto text-right font-mono"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {formatAUD(line.spentCents)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {line.saCommittedCents > 0 ? (
                                <span className="text-amber-600">{formatAUD(line.saCommittedCents)}</span>
                              ) : (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatAUD(line.remainingCents)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="outline" onClick={cancelEditLine} disabled={lineSaving} className="h-7 text-xs px-2">
                                  Cancel
                                </Button>
                                <Button size="sm" onClick={() => void saveLine()} disabled={lineSaving} className="h-7 text-xs px-2">
                                  {lineSaving ? 'Saving...' : 'Save'}
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              <span className="font-mono text-xs">{line.categoryCode}</span>
                              <br />
                              <span className="text-sm">{line.categoryName}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatAUD(line.allocatedCents)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {formatAUD(line.spentCents)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {line.saCommittedCents > 0 ? (
                                <span className="text-amber-600">{formatAUD(line.saCommittedCents)}</span>
                              ) : (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              <span className={line.remainingCents < 0 ? 'text-destructive font-semibold' : 'font-medium'}>
                                {formatAUD(line.remainingCents)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditLine(line)}
                                  className="h-7 w-7 p-0"
                                  title="Edit budget line"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openDeleteDialog(line)}
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  title="Delete budget line"
                                  disabled={line.spentCents > 0 || line.reservedCents > 0}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}

                    {/* Inline add row */}
                    {showAddLine && (
                      <TableRow className="bg-muted/30">
                        <TableCell>
                          <div className="space-y-1">
                            <Input
                              value={addLineForm.categoryCode}
                              onChange={(e) => setAddLineForm(prev => ({ ...prev, categoryCode: e.target.value }))}
                              className="h-7 text-xs w-20 font-mono"
                              placeholder="Code"
                              maxLength={10}
                            />
                            <Input
                              value={addLineForm.categoryName}
                              onChange={(e) => setAddLineForm(prev => ({ ...prev, categoryName: e.target.value }))}
                              className="h-7 text-xs"
                              placeholder="Category name"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={addLineForm.allocatedStr}
                            onChange={(e) => setAddLineForm(prev => ({ ...prev, allocatedStr: e.target.value }))}
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-7 text-xs w-28 ml-auto text-right font-mono"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">--</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">--</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">--</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowAddLine(false)}
                              disabled={addLineSaving}
                              className="h-7 text-xs px-2"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void handleAddLine()}
                              disabled={!addLineForm.categoryCode || !addLineForm.categoryName || !addLineForm.allocatedStr || addLineSaving}
                              className="h-7 text-xs px-2"
                            >
                              {addLineSaving ? 'Adding...' : 'Add'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {/* Totals row */}
                    {budgetLines.length > 0 && (
                      <TableRow className="border-t-2 font-semibold bg-muted/50">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatAUD(totalAllocated)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatAUD(totalSpent)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {totalCommitted > 0 ? (
                            <span className="text-amber-600">{formatAUD(totalCommitted)}</span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatAUD(totalRemaining)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Committed (SA) = amounts earmarked to service agreements but not yet invoiced.
            Remaining = Allocated - Spent - Committed (SA).
          </p>
        </div>
      </div>

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}
      <Dialog open={!!deleteLineId} onOpenChange={(open) => { if (!open) setDeleteLineId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete budget line</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteLineName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLineId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteLine()} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
