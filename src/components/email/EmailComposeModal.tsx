'use client'

/**
 * EmailComposeModal — PM-initiated outbound email compose UI.
 * Usable from participant, provider, and coordinator detail pages.
 *
 * Features:
 * - To / From (dropdown) / CC (chips) / Category / Template / Subject / Body
 * - Template loading pre-fills Subject + Body; Clear button resets
 * - Sends via POST /api/crm/correspondence/send-email
 * - On success: shows toast, calls onSent(), closes
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CCInput } from './CCInput'

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailCategory =
  | 'CUSTOM'
  | 'WELCOME_PACK'
  | 'SERVICE_AGREEMENT'
  | 'INVOICE_NOTIFICATION'
  | 'CLAIM_STATUS'
  | 'BUDGET_REPORT'
  | 'APPROVAL_REQUEST'

interface EmailTemplate {
  id: string
  name: string
  type: EmailCategory
  subject: string
  bodyHtml: string
  bodyText: string | null
}

const CATEGORY_LABELS: Record<EmailCategory, string> = {
  CUSTOM: 'General / Custom',
  WELCOME_PACK: 'Welcome Pack',
  SERVICE_AGREEMENT: 'Service Agreement',
  INVOICE_NOTIFICATION: 'Invoice Notification',
  CLAIM_STATUS: 'Claim Status',
  BUDGET_REPORT: 'Budget Report',
  APPROVAL_REQUEST: 'Approval Request',
}

export interface EmailComposeModalProps {
  open: boolean
  onClose: () => void
  onSent: () => void
  recipientEmail?: string
  recipientName?: string
  subject?: string
  body?: string
  participantId?: string
  providerId?: string
  coordinatorId?: string
  invoiceId?: string
  documentId?: string
  planId?: string
  serviceAgreementId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailComposeModal({
  open,
  onClose,
  onSent,
  recipientEmail = '',
  recipientName,
  subject: subjectProp,
  body: bodyProp,
  participantId,
  providerId,
  coordinatorId,
  invoiceId,
  documentId,
  planId,
  serviceAgreementId,
}: EmailComposeModalProps): React.JSX.Element {
  // Form state
  const [to, setTo] = useState(recipientEmail)
  const [fromAddresses, setFromAddresses] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [cc, setCc] = useState<string[]>([])
  const [category, setCategory] = useState<EmailCategory>('CUSTOM')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateHtmlPreview, setTemplateHtmlPreview] = useState('')
  const [subject, setSubject] = useState(subjectProp ?? '')
  const [body, setBody] = useState(bodyProp ?? '')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Reset form whenever dialog opens — pre-fill from props
  useEffect(() => {
    if (open) {
      setTo(recipientEmail)
      setCc([])
      setCategory('CUSTOM')
      setSelectedTemplateId('')
      setTemplateHtmlPreview('')
      setSubject(subjectProp ?? '')
      setBody(bodyProp ?? '')
      setErrorMsg('')
      setSuccessMsg('')
    }
  }, [open, recipientEmail, subjectProp, bodyProp])

  // Load allowed from-addresses
  useEffect(() => {
    if (!open) return
    void fetch('/api/crm/correspondence/send-email')
      .then((r) => r.json())
      .then((j: { data: string[] }) => {
        setFromAddresses(j.data ?? [])
        if (j.data && j.data.length > 0) {
          setFrom(j.data[0] ?? '')
        }
      })
      .catch(() => null)
  }, [open])

  // Load templates when category changes
  useEffect(() => {
    if (!open) return
    void fetch(`/api/email-templates?isActive=true`)
      .then((r) => r.json())
      .then((j: { data: EmailTemplate[] }) => {
        setTemplates(j.data ?? [])
      })
      .catch(() => null)
  }, [open])

  const filteredTemplates = templates.filter((t) => t.type === category)

  function handleSelectTemplate(templateId: string): void {
    setSelectedTemplateId(templateId)
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    setSubject(tpl.subject)
    setBody(tpl.bodyText ?? tpl.bodyHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    setTemplateHtmlPreview(tpl.bodyHtml)
  }

  function handleClearTemplate(): void {
    setSelectedTemplateId('')
    setTemplateHtmlPreview('')
    setSubject('')
    setBody('')
  }

  function handleCategoryChange(value: string): void {
    setCategory(value as EmailCategory)
    // Clear template selection when category changes
    setSelectedTemplateId('')
    setTemplateHtmlPreview('')
  }

  async function handleSend(): Promise<void> {
    setErrorMsg('')
    setSuccessMsg('')
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setErrorMsg('To, Subject, and Body are required.')
      return
    }

    // Build htmlBody — if from template use template HTML, otherwise wrap plain text in <p>
    const htmlBody = templateHtmlPreview || `<p>${body.replace(/\n/g, '</p><p>')}</p>`

    setSending(true)
    try {
      const res = await fetch('/api/crm/correspondence/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          from,
          cc: cc.length > 0 ? cc : undefined,
          subject: subject.trim(),
          bodyHtml: htmlBody,
          bodyText: body.trim(),
          emailCategory: category,
          templateId: selectedTemplateId || undefined,
          participantId,
          providerId,
          coordinatorId,
          invoiceId,
          documentId,
          planId,
          serviceAgreementId,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setErrorMsg(data.error ?? 'Failed to send email.')
        return
      }

      setSuccessMsg('Email sent successfully.')
      onSent()
      // Short delay so user sees success, then close
      setTimeout(() => {
        onClose()
      }, 800)
    } catch {
      setErrorMsg('A network error occurred. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const recipientLabel = recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-xl" aria-describedby="email-compose-desc">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
          {recipientLabel && (
            <p id="email-compose-desc" className="text-sm text-muted-foreground">
              Composing email to {recipientLabel}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* To */}
          <div className="space-y-1">
            <Label htmlFor="email-to">To *</Label>
            <Input
              id="email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              disabled={sending}
              aria-required="true"
            />
          </div>

          {/* From */}
          <div className="space-y-1">
            <Label htmlFor="email-from">From *</Label>
            <Select value={from} onValueChange={setFrom} disabled={sending}>
              <SelectTrigger id="email-from">
                <SelectValue placeholder="Select from address…" />
              </SelectTrigger>
              <SelectContent>
                {fromAddresses.map((addr) => (
                  <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CC */}
          <div className="space-y-1">
            <Label>CC (optional)</Label>
            <CCInput value={cc} onChange={setCc} disabled={sending} />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label htmlFor="email-category">Category *</Label>
            <Select value={category} onValueChange={handleCategoryChange} disabled={sending}>
              <SelectTrigger id="email-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as EmailCategory[]).map((k) => (
                  <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template (optional) */}
          <div className="space-y-1">
            <Label htmlFor="email-template">Template (optional)</Label>
            <div className="flex items-center gap-2">
              <Select
                value={selectedTemplateId}
                onValueChange={handleSelectTemplate}
                disabled={sending || filteredTemplates.length === 0}
              >
                <SelectTrigger id="email-template" className="flex-1">
                  <SelectValue
                    placeholder={
                      filteredTemplates.length === 0
                        ? 'No templates for this category'
                        : 'Select template…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplateId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearTemplate}
                  disabled={sending}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Template HTML preview (collapsible) */}
          {templateHtmlPreview && (
            <details className="rounded-md border p-2">
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                Template HTML preview (read-only)
              </summary>
              <div
                className="mt-2 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs"
                /* safe: HTML comes from our own DB, no user input */
                dangerouslySetInnerHTML={{ __html: templateHtmlPreview }}
              />
            </details>
          )}

          {/* Subject */}
          <div className="space-y-1">
            <Label htmlFor="email-subject">Subject *</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject…"
              maxLength={500}
              disabled={sending}
              aria-required="true"
            />
          </div>

          {/* Body */}
          <div className="space-y-1">
            <Label htmlFor="email-body">Body *</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Email content…"
              disabled={sending}
              aria-required="true"
            />
            <p className="text-xs text-muted-foreground">
              Plain text. When no template is selected this will also be used as the HTML body.
            </p>
          </div>

          {/* Error / success messages */}
          {errorMsg && (
            <p className="text-sm text-destructive" role="alert">{errorMsg}</p>
          )}
          {successMsg && (
            <p className="text-sm text-green-600" role="status">{successMsg}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
          >
            {sending ? 'Sending…' : 'Send Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
