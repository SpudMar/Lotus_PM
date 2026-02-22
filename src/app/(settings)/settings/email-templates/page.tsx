'use client'

/**
 * Settings — Email Templates
 * REQ-032: Staff-customisable email templates with merge fields, attachments, form links.
 * Access: PM+ (Plan Manager and Global Admin) via notifications:send permission.
 */

import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Pencil, Eye, Power, Mail } from 'lucide-react'
import type { NotifEmailTemplate, EmailTemplateType } from '@prisma/client'

type MergeFieldDef = { key: string; label: string; description: string; example: string }

const TEMPLATE_TYPES: { value: EmailTemplateType; label: string }[] = [
  { value: 'WELCOME_PACK', label: 'Welcome Pack' },
  { value: 'SERVICE_AGREEMENT', label: 'Service Agreement' },
  { value: 'INVOICE_NOTIFICATION', label: 'Invoice Notification' },
  { value: 'CLAIM_STATUS', label: 'Claim Status' },
  { value: 'BUDGET_REPORT', label: 'Budget Report' },
  { value: 'APPROVAL_REQUEST', label: 'Approval Request' },
  { value: 'CUSTOM', label: 'Custom' },
]

// ─── Template form ─────────────────────────────────────────────────────────

interface TemplateFormData {
  name: string
  type: EmailTemplateType
  subject: string
  bodyHtml: string
  bodyText: string
  includesFormLink: boolean
  formLinkUrl: string
  supportsVariableAttachment: boolean
  variableAttachmentDescription: string
}

const defaultFormData: TemplateFormData = {
  name: '',
  type: 'CUSTOM',
  subject: '',
  bodyHtml: '',
  bodyText: '',
  includesFormLink: false,
  formLinkUrl: '',
  supportsVariableAttachment: false,
  variableAttachmentDescription: '',
}

// ─── Main page component ───────────────────────────────────────────────────

export default function EmailTemplatesPage(): React.JSX.Element {
  const [templates, setTemplates] = useState<NotifEmailTemplate[]>([])
  const [mergeFields, setMergeFields] = useState<MergeFieldDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<NotifEmailTemplate | null>(null)
  const [formData, setFormData] = useState<TemplateFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [previewTemplate, setPreviewTemplate] = useState<NotifEmailTemplate | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/email-templates')
      if (!res.ok) throw new Error('Failed to load templates')
      const json = await res.json() as { data: NotifEmailTemplate[] }
      setTemplates(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMergeFields = useCallback(async () => {
    try {
      const res = await fetch('/api/email-templates/merge-fields')
      if (!res.ok) return
      const json = await res.json() as { data: MergeFieldDef[] }
      setMergeFields(json.data)
    } catch {
      // Non-critical — merge field picker simply won't show
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
    void loadMergeFields()
  }, [loadTemplates, loadMergeFields])

  function openCreate(): void {
    setFormData(defaultFormData)
    setFormError(null)
    setShowCreateDialog(true)
  }

  function openEdit(t: NotifEmailTemplate): void {
    setEditingTemplate(t)
    setFormData({
      name: t.name,
      type: t.type,
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      bodyText: (t.bodyText as string | null) ?? '',
      includesFormLink: t.includesFormLink,
      formLinkUrl: (t.formLinkUrl as string | null) ?? '',
      supportsVariableAttachment: t.supportsVariableAttachment,
      variableAttachmentDescription: (t.variableAttachmentDescription as string | null) ?? '',
    })
    setFormError(null)
  }

  async function handleSave(): Promise<void> {
    if (!formData.name.trim() || !formData.subject.trim() || !formData.bodyHtml.trim()) {
      setFormError('Name, subject, and HTML body are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const isEdit = editingTemplate !== null
      const url = isEdit ? `/api/email-templates/${editingTemplate.id}` : '/api/email-templates'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          subject: formData.subject,
          bodyHtml: formData.bodyHtml,
          bodyText: formData.bodyText || undefined,
          includesFormLink: formData.includesFormLink,
          formLinkUrl: formData.formLinkUrl || undefined,
          supportsVariableAttachment: formData.supportsVariableAttachment,
          variableAttachmentDescription: formData.variableAttachmentDescription || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json() as { error: string }
        throw new Error(json.error)
      }
      setShowCreateDialog(false)
      setEditingTemplate(null)
      void loadTemplates()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(t: NotifEmailTemplate): Promise<void> {
    if (!confirm(`Deactivate template "${t.name}"? It will no longer be available for sending.`)) return
    try {
      await fetch(`/api/email-templates/${t.id}`, { method: 'DELETE' })
      void loadTemplates()
    } catch {
      // ignore
    }
  }

  async function handlePreview(t: NotifEmailTemplate): Promise<void> {
    setPreviewTemplate(t)
    setPreviewHtml(null)
    setPreviewLoading(true)
    try {
      const sampleData: Record<string, string> = {}
      const fields = t.mergeFields as string[]
      for (const f of fields) {
        const def = mergeFields.find((m) => m.key === f)
        sampleData[f] = def ? def.example : `[${f}]`
      }
      const res = await fetch(`/api/email-templates/${t.id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleData }),
      })
      if (!res.ok) throw new Error('Preview failed')
      const json = await res.json() as { data: { subject: string; bodyHtml: string } }
      setPreviewHtml(json.data.bodyHtml)
    } catch {
      setPreviewHtml('<p>Preview failed. Please try again.</p>')
    } finally {
      setPreviewLoading(false)
    }
  }

  function insertMergeField(key: string): void {
    setFormData((prev) => ({ ...prev, bodyHtml: prev.bodyHtml + `{${key}}` }))
  }

  const isDialogOpen = showCreateDialog || editingTemplate !== null

  return (
    <DashboardShell>
      <PageHeader
        title="Email Templates"
        description="Manage customisable email templates with merge fields and attachments."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        }
      />

      <div className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="py-8 text-center text-destructive">{error}</CardContent>
          </Card>
        )}

        {!loading && !error && templates.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Mail className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p>No email templates yet. Create your first template to get started.</p>
            </CardContent>
          </Card>
        )}

        {!loading && templates.map((t) => (
          <Card key={t.id} className={t.isActive ? '' : 'opacity-60'}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <CardDescription className="mt-1">{t.subject}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.isActive ? 'default' : 'secondary'}>
                    {t.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline">{t.type.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(t.mergeFields as string[]).map((f) => (
                    <span
                      key={f}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground"
                    >
                      {`{${f}}`}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void handlePreview(t)}>
                    <Eye className="mr-1 h-4 w-4" />
                    Preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  {t.isActive && (
                    <Button variant="ghost" size="sm" onClick={() => void handleDeactivate(t)}>
                      <Power className="mr-1 h-4 w-4" />
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) { setShowCreateDialog(false); setEditingTemplate(null) }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Email Template'}</DialogTitle>
            <DialogDescription>
              Use {'{fieldName}'} syntax to insert merge fields into your template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {formError && (
              <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Template Name *</Label>
                <Input
                  id="tpl-name"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Welcome Pack"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, type: v as EmailTemplateType }))}
                >
                  <SelectTrigger id="tpl-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Subject Line *</Label>
              <Input
                id="tpl-subject"
                value={formData.subject}
                onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                placeholder="e.g. Your NDIS Plan update — {participantFirstName}"
              />
            </div>

            {/* Merge field picker */}
            {mergeFields.length > 0 && (
              <div className="space-y-1.5">
                <Label>Insert Merge Field</Label>
                <div className="flex flex-wrap gap-1">
                  {mergeFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      title={`${f.label}: ${f.description} (e.g. ${f.example})`}
                      onClick={() => insertMergeField(f.key)}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {`{${f.key}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tpl-html">HTML Body *</Label>
              <Textarea
                id="tpl-html"
                value={formData.bodyHtml}
                onChange={(e) => setFormData((p) => ({ ...p, bodyHtml: e.target.value }))}
                placeholder="<p>Dear {participantFirstName},</p>"
                className="min-h-[160px] font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-text">Plain Text Body (optional)</Label>
              <Textarea
                id="tpl-text"
                value={formData.bodyText}
                onChange={(e) => setFormData((p) => ({ ...p, bodyText: e.target.value }))}
                placeholder="Plain text fallback for email clients that don't support HTML."
                className="min-h-[80px] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingTemplate(null) }}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewTemplate !== null} onOpenChange={(open) => { if (!open) setPreviewTemplate(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
            <DialogDescription>Rendered with sample data</DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            {previewLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!previewLoading && previewHtml && (
              <div
                className="rounded border p-4 text-sm"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
