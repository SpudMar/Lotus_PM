'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Trash2 } from 'lucide-react'
import { ProviderCombobox } from '@/components/comboboxes/ProviderCombobox'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovalRule {
  id: string
  participantId: string
  providerId: string | null
  requireApproval: boolean
  provider: { id: string; name: string; abn: string } | null
}

interface ApprovalRulesTabProps {
  participantId: string
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ApprovalRulesTab({ participantId }: ApprovalRulesTabProps): React.JSX.Element {
  const [rules, setRules] = useState<ApprovalRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newProviderId, setNewProviderId] = useState('')
  const [newRequire, setNewRequire] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadRules() {
    try {
      const res = await fetch(`/api/crm/approval-rules?participantId=${participantId}`)
      if (res.ok) {
        const json = await res.json()
        setRules(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRules()
  }, [participantId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(rule: ApprovalRule) {
    await fetch('/api/crm/approval-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId,
        providerId: rule.providerId,
        requireApproval: !rule.requireApproval,
      }),
    })
    void loadRules()
  }

  async function handleAdd() {
    setSaving(true)
    try {
      await fetch('/api/crm/approval-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          providerId: newProviderId || null,
          requireApproval: newRequire,
        }),
      })
      setShowAddDialog(false)
      setNewProviderId('')
      setNewRequire(true)
      void loadRules()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(ruleId: string) {
    await fetch(`/api/crm/approval-rules?id=${ruleId}`, { method: 'DELETE' })
    void loadRules()
  }

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading approval rules...</div>
  }

  const defaultRule = rules.find((r) => !r.providerId)
  const providerRules = rules.filter((r) => r.providerId)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure whether invoices from specific providers require participant approval before processing.
      </p>

      {/* Default rule */}
      <div className="rounded-md border p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Default Rule (all providers)</p>
          <p className="text-xs text-muted-foreground">Applies to providers without a specific rule below</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={defaultRule?.requireApproval ? 'default' : 'outline'}>
            {defaultRule?.requireApproval ? 'Approval Required' : 'No Approval Required'}
          </Badge>
          {defaultRule ? (
            <Switch
              checked={defaultRule.requireApproval}
              onCheckedChange={() => void handleToggle(defaultRule)}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void fetch('/api/crm/approval-rules', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    participantId,
                    providerId: null,
                    requireApproval: true,
                  }),
                }).then(() => loadRules())
              }}
            >
              Enable
            </Button>
          )}
        </div>
      </div>

      {/* Per-provider rules */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Provider-Specific Rules</h4>
        <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Rule
        </Button>
      </div>

      {providerRules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No provider-specific rules. The default rule applies to all providers.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Require Approval</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providerRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.provider?.name ?? 'Unknown'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.requireApproval}
                      onCheckedChange={() => void handleToggle(rule)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void handleDelete(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add rule dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent aria-describedby="add-rule-desc">
          <DialogHeader>
            <DialogTitle>Add Approval Rule</DialogTitle>
            <p id="add-rule-desc" className="text-sm text-muted-foreground">
              Select a provider and configure whether their invoices require participant approval.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Provider</Label>
              <ProviderCombobox value={newProviderId} onValueChange={setNewProviderId} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={newRequire} onCheckedChange={setNewRequire} id="new-require-approval" />
              <Label htmlFor="new-require-approval">Require Approval</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleAdd()} disabled={saving}>
              {saving ? 'Saving...' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
