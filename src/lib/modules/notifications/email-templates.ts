/**
 * Email Templates module — CRUD and preview logic.
 * REQ-032: Staff-customisable templates with merge fields,
 *          fixed/variable attachments, and form links.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import type {
  EmailTemplateType,
  NotifEmailTemplate,
  Prisma,
} from '@prisma/client'

// ─── Available merge fields ───────────────────────────────────────────────

export interface MergeFieldDefinition {
  key: string
  label: string
  description: string
  example: string
}

/**
 * The canonical set of merge fields supported across all templates.
 * These keys are used as {key} placeholders in subject/bodyHtml/bodyText.
 */
export const AVAILABLE_MERGE_FIELDS: MergeFieldDefinition[] = [
  {
    key: 'participantName',
    label: 'Participant Name',
    description: 'Full name of the participant',
    example: 'Jane Smith',
  },
  {
    key: 'participantFirstName',
    label: 'Participant First Name',
    description: 'First name of the participant',
    example: 'Jane',
  },
  {
    key: 'participantNdisNumber',
    label: 'NDIS Number',
    description: 'NDIS participant number',
    example: '430123456',
  },
  {
    key: 'providerName',
    label: 'Provider Name',
    description: 'Name of the service provider',
    example: 'Sunrise Support Services',
  },
  {
    key: 'planManagerName',
    label: 'Plan Manager Name',
    description: 'Name of the assigned plan manager',
    example: 'Sarah Johnson',
  },
  {
    key: 'agreementRef',
    label: 'Agreement Reference',
    description: 'Service agreement reference number',
    example: 'SA-20260223-0001',
  },
  {
    key: 'invoiceNumber',
    label: 'Invoice Number',
    description: 'Invoice reference number',
    example: 'INV-2026-0042',
  },
  {
    key: 'invoiceAmount',
    label: 'Invoice Amount',
    description: 'Total invoice amount (formatted)',
    example: '$1,250.00',
  },
  {
    key: 'claimReference',
    label: 'Claim Reference',
    description: 'Claim reference number',
    example: 'CLM-2026-0001',
  },
  {
    key: 'claimStatus',
    label: 'Claim Status',
    description: 'Current status of the claim',
    example: 'APPROVED',
  },
  {
    key: 'budgetRemaining',
    label: 'Budget Remaining',
    description: 'Remaining budget amount (formatted)',
    example: '$3,450.00',
  },
  {
    key: 'categoryName',
    label: 'Support Category',
    description: 'NDIS support category name',
    example: 'Daily Activities',
  },
  {
    key: 'formLink',
    label: 'Form Link',
    description: 'URL link to a form (auto-populated when template has includesFormLink)',
    example: 'https://planmanager.lotusassist.com.au/approval/abc123',
  },
  {
    key: 'today',
    label: 'Today\'s Date',
    description: 'Current date (DD/MM/YYYY)',
    example: '23/02/2026',
  },
  {
    key: 'companyName',
    label: 'Company Name',
    description: 'Lotus Assist company name',
    example: 'Lotus Assist',
  },
  {
    key: 'companyPhone',
    label: 'Company Phone',
    description: 'Lotus Assist contact phone',
    example: '1300 XXX XXX',
  },
]

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreateEmailTemplateInput {
  name: string
  type: EmailTemplateType
  subject: string
  bodyHtml: string
  bodyText?: string
  mergeFields?: string[]
  fixedAttachmentIds?: string[]
  supportsVariableAttachment?: boolean
  variableAttachmentDescription?: string
  includesFormLink?: boolean
  formLinkUrl?: string
}

export interface UpdateEmailTemplateInput {
  name?: string
  type?: EmailTemplateType
  subject?: string
  bodyHtml?: string
  bodyText?: string | null
  mergeFields?: string[]
  fixedAttachmentIds?: string[]
  supportsVariableAttachment?: boolean
  variableAttachmentDescription?: string | null
  includesFormLink?: boolean
  formLinkUrl?: string | null
  isActive?: boolean
}

export interface ListEmailTemplatesFilter {
  type?: EmailTemplateType
  isActive?: boolean
}

// ─── Validation helpers ───────────────────────────────────────────────────

/**
 * Validate that merge field names are valid identifiers.
 * Must be camelCase or snake_case identifiers only — no spaces or special chars.
 */
function validateMergeFields(fields: string[]): void {
  const validIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/
  for (const field of fields) {
    if (!validIdentifier.test(field)) {
      throw new Error(
        `Invalid merge field identifier: "${field}". Must be a valid camelCase or snake_case identifier.`
      )
    }
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

/**
 * List email templates with optional filtering.
 */
export async function listEmailTemplates(
  filter: ListEmailTemplatesFilter = {}
): Promise<NotifEmailTemplate[]> {
  const where: Prisma.NotifEmailTemplateWhereInput = {}
  if (filter.type !== undefined) where.type = filter.type
  if (filter.isActive !== undefined) where.isActive = filter.isActive

  return prisma.notifEmailTemplate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get a single email template by ID.
 * Returns null if not found.
 */
export async function getEmailTemplate(id: string): Promise<NotifEmailTemplate | null> {
  return prisma.notifEmailTemplate.findUnique({
    where: { id },
  })
}

/**
 * Create a new email template.
 * Validates merge field names are valid identifiers.
 * Logs to audit trail (REQ-017).
 */
export async function createEmailTemplate(
  data: CreateEmailTemplateInput,
  createdById: string
): Promise<NotifEmailTemplate> {
  const mergeFields = data.mergeFields ?? []
  validateMergeFields(mergeFields)

  const template = await prisma.notifEmailTemplate.create({
    data: {
      name: data.name,
      type: data.type,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText,
      mergeFields,
      fixedAttachmentIds: data.fixedAttachmentIds ?? [],
      supportsVariableAttachment: data.supportsVariableAttachment ?? false,
      variableAttachmentDescription: data.variableAttachmentDescription,
      includesFormLink: data.includesFormLink ?? false,
      formLinkUrl: data.formLinkUrl,
      isActive: true,
      createdById,
    },
  })

  await createAuditLog({
    userId: createdById,
    action: 'email_templates.template.created',
    resource: 'notif_email_template',
    resourceId: template.id,
    after: { name: template.name, type: template.type },
  })

  return template
}

/**
 * Update an existing email template.
 * Validates merge field names if provided.
 * Logs to audit trail (REQ-017).
 */
export async function updateEmailTemplate(
  id: string,
  data: UpdateEmailTemplateInput,
  updatedById: string
): Promise<NotifEmailTemplate> {
  if (data.mergeFields !== undefined) {
    validateMergeFields(data.mergeFields)
  }

  const existing = await prisma.notifEmailTemplate.findUnique({ where: { id } })
  if (!existing) {
    throw new Error(`Email template not found: ${id}`)
  }

  const updateData: Prisma.NotifEmailTemplateUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.type !== undefined) updateData.type = data.type
  if (data.subject !== undefined) updateData.subject = data.subject
  if (data.bodyHtml !== undefined) updateData.bodyHtml = data.bodyHtml
  if ('bodyText' in data) updateData.bodyText = data.bodyText
  if (data.mergeFields !== undefined) updateData.mergeFields = data.mergeFields
  if (data.fixedAttachmentIds !== undefined) updateData.fixedAttachmentIds = data.fixedAttachmentIds
  if (data.supportsVariableAttachment !== undefined) updateData.supportsVariableAttachment = data.supportsVariableAttachment
  if ('variableAttachmentDescription' in data) updateData.variableAttachmentDescription = data.variableAttachmentDescription
  if (data.includesFormLink !== undefined) updateData.includesFormLink = data.includesFormLink
  if ('formLinkUrl' in data) updateData.formLinkUrl = data.formLinkUrl
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const updated = await prisma.notifEmailTemplate.update({
    where: { id },
    data: updateData,
  })

  await createAuditLog({
    userId: updatedById,
    action: 'email_templates.template.updated',
    resource: 'notif_email_template',
    resourceId: id,
    before: { name: existing.name, isActive: existing.isActive },
    after: { name: updated.name, isActive: updated.isActive },
  })

  return updated
}

/**
 * Deactivate a template (soft delete — never hard delete because sent email records reference templates).
 * Sets isActive to false.
 */
export async function deleteEmailTemplate(id: string, deletedById: string): Promise<NotifEmailTemplate> {
  const existing = await prisma.notifEmailTemplate.findUnique({ where: { id } })
  if (!existing) {
    throw new Error(`Email template not found: ${id}`)
  }

  const updated = await prisma.notifEmailTemplate.update({
    where: { id },
    data: { isActive: false },
  })

  await createAuditLog({
    userId: deletedById,
    action: 'email_templates.template.deactivated',
    resource: 'notif_email_template',
    resourceId: id,
    before: { isActive: true },
    after: { isActive: false },
  })

  return updated
}

/**
 * Preview a template by rendering it with the supplied sample merge field values.
 * Returns the rendered subject, htmlBody, and textBody (if present).
 */
export async function previewTemplate(
  id: string,
  sampleData: Record<string, string>
): Promise<{ subject: string; bodyHtml: string; bodyText: string | null }> {
  const template = await prisma.notifEmailTemplate.findUnique({ where: { id } })
  if (!template) {
    throw new Error(`Email template not found: ${id}`)
  }

  return {
    subject: interpolateTemplate(template.subject, sampleData),
    bodyHtml: interpolateTemplate(template.bodyHtml, sampleData),
    bodyText: template.bodyText ? interpolateTemplate(template.bodyText, sampleData) : null,
  }
}

/**
 * Return the list of all available merge fields with their descriptions.
 * Used by the template editor to show a picker of supported fields.
 */
export function getAvailableMergeFields(): MergeFieldDefinition[] {
  return AVAILABLE_MERGE_FIELDS
}

// ─── Interpolation ────────────────────────────────────────────────────────

/**
 * Replace {key} placeholders in a template string with values from the map.
 * - Known keys: replaced with the string value.
 * - Unknown keys: left as-is (not replaced).
 * - Missing values: placeholder preserved.
 */
export function interpolateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? (values[key] ?? match) : match
  })
}
