'use client'

import { useEffect, useState } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Play, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'

interface AutoRule {
  id: string
  name: string
  description: string | null
  isActive: boolean
  triggerType: 'EVENT' | 'SCHEDULE'
  triggerEvent: string | null
  cronExpression: string | null
  conditions: unknown[]
  actions: unknown[]
  lastTriggeredAt: string | null
  executionCount: number
  createdAt: string
}

// Well-known event types for the dropdown
const KNOWN_EVENTS = [
  { value: 'lotus-pm.invoices.received', label: 'Invoice received' },
  { value: 'lotus-pm.invoices.approved', label: 'Invoice approved' },
  { value: 'lotus-pm.invoices.rejected', label: 'Invoice rejected' },
  { value: 'lotus-pm.plans.budget-alert', label: 'Budget alert' },
  { value: 'lotus-pm.plans.review-due', label: 'Plan review due' },
  { value: 'lotus-pm.crm.participant-created', label: 'Participant created' },
]

interface NewRuleForm {
  name: string
  description: string
  triggerType: 'EVENT' | 'SCHEDULE'
  triggerEvent: string
  cronExpression: string
  conditionField: string
  conditionOp: string
  conditionValue: string
  actionMessage: string
}

const emptyForm: NewRuleForm = {
  name: '',
  description: '',
  triggerType: 'EVENT',
  triggerEvent: 'lotus-pm.plans.budget-alert',
  cronExpression: '0 9 * * *',
  conditionField: 'usedPercent',
  conditionOp: 'gte',
  conditionValue: '80',
  actionMessage: 'Budget alert: {categoryCode} is at {usedPercent}%',
}

export default function AutomationPage(): React.JSX.Element {
  const [rules, setRules] = useState<AutoRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<NewRuleForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  useEffect(() => {
    void loadRules()
  }, [])

  async function loadRules(): Promise<void> {
    setLoading(true)
    try {
      const res = await fetch('/api/automation/rules')
      if (res.ok) {
        const json = await res.json()
        setRules(json.data)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(): Promise<void> {
    setSaving(true)
    try {
      const body =
        form.triggerType === 'EVENT'
          ? {
              name: form.name,
              description: form.description || undefined,
              triggerType: 'EVENT' as const,
              triggerEvent: form.triggerEvent,
              conditions: [
                {
                  field: form.conditionField,
                  op: form.conditionOp,
                  value: isNaN(Number(form.conditionValue))
                    ? form.conditionValue
                    : Number(form.conditionValue),
                },
              ],
              actions: [{ type: 'NOTIFY_STAFF', params: { message: form.actionMessage, notifyRole: 'PLAN_MANAGER' } }],
            }
          : {
              name: form.name,
              description: form.description || undefined,
              triggerType: 'SCHEDULE' as const,
              cronExpression: form.cronExpression,
              conditions: [
                {
                  field: form.conditionField,
                  op: form.conditionOp,
                  value: isNaN(Number(form.conditionValue))
                    ? form.conditionValue
                    : Number(form.conditionValue),
                },
              ],
              actions: [{ type: 'NOTIFY_STAFF', params: { message: form.actionMessage, notifyRole: 'PLAN_MANAGER' } }],
            }

      const res = await fetch('/api/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowCreate(false)
        setForm(emptyForm)
        void loadRules()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(rule: AutoRule): Promise<void> {
    await fetch(`/api/automation/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    void loadRules()
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('Delete this rule? This cannot be undone.')) return
    await fetch(`/api/automation/rules/${id}`, { method: 'DELETE' })
    void loadRules()
  }

  async function handleTest(rule: AutoRule): Promise<void> {
    // Build a sample context based on the rule's first condition field
    const conditions = rule.conditions as Array<{ field: string; value: unknown }>
    const sampleContext: Record<string, unknown> = {}
    for (const c of conditions) {
      sampleContext[c.field] = c.value
    }
    // Add common fields that templates might reference
    sampleContext['categoryCode'] = sampleContext['categoryCode'] ?? '01'
    sampleContext['participantId'] = sampleContext['participantId'] ?? 'test'

    const res = await fetch(`/api/automation/rules/${rule.id}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: sampleContext }),
    })
    if (res.ok) {
      const json = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: json.data.result,
      }))
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Automation"
          description="Create rules that fire when NDIS events occur or on a schedule."
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Rule
            </Button>
          }
        />

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Last triggered</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No automation rules yet. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="font-medium">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-muted-foreground">{rule.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {rule.triggerType === 'EVENT' ? (
                          <span className="font-mono text-xs">{rule.triggerEvent}</span>
                        ) : (
                          <span className="font-mono text-xs">{rule.cronExpression}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {rule.triggerType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(rule.conditions as unknown[]).length} condition
                      {(rule.conditions as unknown[]).length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(rule.actions as unknown[]).length} action
                      {(rule.actions as unknown[]).length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.lastTriggeredAt
                        ? formatDateAU(new Date(rule.lastTriggeredAt))
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {rule.executionCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                          {rule.isActive ? 'Active' : 'Paused'}
                        </Badge>
                        {testResults[rule.id] && (
                          <Badge
                            variant={
                              testResults[rule.id] === 'SUCCESS'
                                ? 'default'
                                : testResults[rule.id] === 'SKIPPED'
                                  ? 'outline'
                                  : 'destructive'
                            }
                            className="text-xs"
                          >
                            {testResults[rule.id]}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleTest(rule)}
                          title="Test rule with sample context"
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleToggle(rule)}
                          title={rule.isActive ? 'Pause rule' : 'Activate rule'}
                        >
                          {rule.isActive ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(rule.id)}
                          title="Delete rule"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create Rule Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Automation Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="rule-name">Rule name</Label>
                <Input
                  id="rule-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Alert on budget over 80%"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-desc">Description (optional)</Label>
                <Input
                  id="rule-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What does this rule do?"
                />
              </div>

              <div className="space-y-1">
                <Label>Trigger type</Label>
                <Select
                  value={form.triggerType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, triggerType: v as 'EVENT' | 'SCHEDULE' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EVENT">Event — fires when something happens</SelectItem>
                    <SelectItem value="SCHEDULE">Schedule — fires on a cron schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.triggerType === 'EVENT' ? (
                <div className="space-y-1">
                  <Label>Event</Label>
                  <Select
                    value={form.triggerEvent}
                    onValueChange={(v) => setForm((f) => ({ ...f, triggerEvent: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWN_EVENTS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="cron">Cron expression</Label>
                  <Input
                    id="cron"
                    value={form.cronExpression}
                    onChange={(e) => setForm((f) => ({ ...f, cronExpression: e.target.value }))}
                    placeholder="0 9 * * * (daily at 9am)"
                    className="font-mono"
                  />
                </div>
              )}

              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Condition (1 condition — expand after saving)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Field</Label>
                    <Input
                      value={form.conditionField}
                      onChange={(e) => setForm((f) => ({ ...f, conditionField: e.target.value }))}
                      placeholder="usedPercent"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Operator</Label>
                    <Select
                      value={form.conditionOp}
                      onValueChange={(v) => setForm((f) => ({ ...f, conditionOp: v }))}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eq">= equals</SelectItem>
                        <SelectItem value="ne">≠ not equal</SelectItem>
                        <SelectItem value="gt">&gt; greater than</SelectItem>
                        <SelectItem value="gte">≥ at least</SelectItem>
                        <SelectItem value="lt">&lt; less than</SelectItem>
                        <SelectItem value="lte">≤ at most</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Value</Label>
                    <Input
                      value={form.conditionValue}
                      onChange={(e) => setForm((f) => ({ ...f, conditionValue: e.target.value }))}
                      placeholder="80"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Action — Notify staff
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Message template</Label>
                  <Input
                    value={form.actionMessage}
                    onChange={(e) => setForm((f) => ({ ...f, actionMessage: e.target.value }))}
                    placeholder="Budget alert: {categoryCode} at {usedPercent}%"
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use &#123;fieldName&#125; to insert event context values.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={saving || !form.name}>
                {saving ? 'Creating...' : 'Create rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
