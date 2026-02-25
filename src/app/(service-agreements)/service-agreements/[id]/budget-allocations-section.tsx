'use client'

/**
 * Budget Allocations Section -- WS-F6
 *
 * Rendered on the SA detail page. Shows all allocations for this SA,
 * and lets PLAN_MANAGER+ users add/remove allocations.
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatAUD, parseCurrencyToCents, dollarsToCents } from '@/lib/shared/currency'
import { Plus, Trash2 } from 'lucide-react'

interface BudgetLine {
  id: string
  categoryCode: string
  categoryName: string
  allocatedCents: number
  spentCents: number
  saCommittedCents: number
  remainingCents: number
}

interface Allocation {
  id: string
  serviceAgreementId: string
  budgetLineId: string
  allocatedCents: number
  note: string | null
  remainingCents: number
  budgetLine: {
    id: string
    categoryCode: string
    categoryName: string
    allocatedCents: number
    spentCents: number
  }
  createdBy: { id: string; name: string }
}

interface Props {
  agreementId: string
  participantPlanId: string | null
  canWrite: boolean
}

export function BudgetAllocationsSection({ agreementId, participantPlanId, canWrite }: Props) {
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Remove confirmation dialog state
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [selectedBudgetLineId, setSelectedBudgetLineId] = useState('')
  const [amountDollars, setAmountDollars] = useState('')
  const [note, setNote] = useState('')

  const loadAllocations = useCallback(async () => {
    try {
      const res = await fetch(`/api/service-agreements/${agreementId}/budget-allocations`)
      if (res.ok) {
        const json = await res.json()
        setAllocations(json.data)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [agreementId])

  const loadBudgetLines = useCallback(async () => {
    if (!participantPlanId) return
    try {
      const res = await fetch(`/api/plans/${participantPlanId}/budget-lines`)
      if (res.ok) {
        const json = await res.json()
        setBudgetLines(json.data)
      }
    } catch {
      // silent
    }
  }, [participantPlanId])

  useEffect(() => {
    void loadAllocations()
    void loadBudgetLines()
  }, [loadAllocations, loadBudgetLines])

  function openDialog(): void {
    setSelectedBudgetLineId('')
    setAmountDollars('')
    setNote('')
    setError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(): Promise<void> {
    setError(null)

    if (!selectedBudgetLineId) {
      setError('Please select a budget line.')
      return
    }

    const cents = parseCurrencyToCents(amountDollars)
    if (cents === null || cents <= 0) {
      setError('Please enter a valid amount.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/service-agreements/${agreementId}/budget-allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetLineId: selectedBudgetLineId,
          allocatedCents: cents,
          note: note.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        if (json.code === 'ALLOCATION_EXCEEDS_AVAILABLE') {
          setError('Allocation amount exceeds available budget for this line.')
        } else {
          setError(json.error ?? 'Failed to save allocation.')
        }
        return
      }

      setDialogOpen(false)
      await loadAllocations()
      await loadBudgetLines()
    } catch {
      setError('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  function openRemoveDialog(allocationId: string): void {
    setRemoveTarget(allocationId)
    setShowRemoveDialog(true)
  }

  async function handleRemove(): Promise<void> {
    if (!removeTarget) return
    setShowRemoveDialog(false)
    try {
      const res = await fetch(
        `/api/service-agreements/${agreementId}/budget-allocations/${removeTarget}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        await loadAllocations()
        await loadBudgetLines()
      }
    } catch {
      // silent
    } finally {
      setRemoveTarget(null)
    }
  }
  const selectedLine = budgetLines.find((l) => l.id === selectedBudgetLineId)
  const availableForSelected = selectedLine ? selectedLine.remainingCents : null

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Budget Allocations</h2>
          {canWrite && participantPlanId && (
            <Button size="sm" onClick={openDialog}>
              <Plus className="w-4 h-4 mr-1" />
              Add Allocation
            </Button>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget Line</TableHead>
                <TableHead className="text-right">Allocated to SA</TableHead>
                <TableHead className="text-right">Invoiced (Line)</TableHead>
                <TableHead className="text-right">Uncommitted Remaining</TableHead>
                <TableHead>Note</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 6 : 5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No budget allocations.{canWrite && participantPlanId ? ' Use "Add Allocation" to commit budget from the plan.' : ''}
                  </TableCell>
                </TableRow>
              )}
              {allocations.map((alloc) => (
                <TableRow key={alloc.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{alloc.budgetLine.categoryCode}</span>
                    <br />
                    <span className="text-sm">{alloc.budgetLine.categoryName}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAUD(alloc.allocatedCents)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatAUD(alloc.budgetLine.spentCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={alloc.remainingCents < 0 ? 'text-destructive' : ''}>
                      {formatAUD(alloc.remainingCents)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {alloc.note ?? '--'}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openRemoveDialog(alloc.id)}
                        aria-label="Remove allocation"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {allocations.length > 0 && (
          <div className="flex justify-end text-sm text-muted-foreground">
            Total allocated:{' '}
            <span className="ml-1 font-medium text-foreground">
              {formatAUD(allocations.reduce((s, a) => s + a.allocatedCents, 0))}
            </span>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Budget Allocation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="budget-line">Budget Line</Label>
              <Select
                value={selectedBudgetLineId}
                onValueChange={(val) => {
                  setSelectedBudgetLineId(val)
                  setError(null)
                }}
              >
                <SelectTrigger id="budget-line">
                  <SelectValue placeholder="Select a budget line..." />
                </SelectTrigger>
                <SelectContent>
                  {budgetLines.map((line) => (
                    <SelectItem key={line.id} value={line.id}>
                      {line.categoryCode} -- {line.categoryName} ({formatAUD(line.remainingCents)} available)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLine && availableForSelected !== null && (
                <p className="text-xs text-muted-foreground">
                  Available: {formatAUD(availableForSelected)} of {formatAUD(selectedLine.allocatedCents)} plan budget
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
              />
              {selectedLine && amountDollars && availableForSelected !== null && (
                <p
                  className={`text-xs ${
                    dollarsToCents(parseFloat(amountDollars) || 0) > availableForSelected
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}
                >
                  {dollarsToCents(parseFloat(amountDollars) || 0) > availableForSelected
                    ? 'Exceeds available budget'
                    : `${formatAUD(availableForSelected - dollarsToCents(parseFloat(amountDollars) || 0))} will remain available`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                placeholder="e.g. OT sessions Aug-Dec 2025"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Allocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Budget Allocation</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this budget allocation? The budget will be returned
              to the available pool on the plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleRemove()}>Remove Allocation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
