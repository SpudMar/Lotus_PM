/**
 * Invoice AI Processing Engine — Wave 1
 *
 * Orchestrates AI-based invoice processing via Bedrock Claude.
 * Determines routing category and executes the appropriate action.
 *
 * Categories:
 *   AUTO_APPROVED        — all validations pass, HIGH confidence, no flags
 *   PARTICIPANT_APPROVAL — passes but participant has invoiceApprovalEnabled=true
 *   NEEDS_CODES          — MEDIUM confidence or any line LOW/NONE confidence
 *   NEEDS_REVIEW         — AI failed, LOW confidence, BLOCKING flags, or INVALID lines
 *   AUTO_REJECTED        — duplicate line item detected, inactive plan/provider/participant
 *
 * Main export: processInvoice(invoiceId)
 *
 * REQ-011: Bedrock calls are region-locked to ap-southeast-2 (in ai-processor.ts).
 * REQ-015: Routing decisions enable < 5 business day processing requirement.
 */

import { prisma } from '@/lib/db'
import { processWithAI, type AIProcessingResult } from './ai-processor'
import { validateInvoiceLines } from './invoice-validation'
import { approveInvoice } from './invoices'
import { requestParticipantApproval } from './participant-approval'
import { SYSTEM_USER_ID } from './email-ingest'

// ── Public Types ───────────────────────────────────────────────────────────────

export type ProcessingCategory =
  | 'AUTO_APPROVED'
  | 'PARTICIPANT_APPROVAL'
  | 'NEEDS_CODES'
  | 'NEEDS_REVIEW'
  | 'AUTO_REJECTED'

export interface ProcessingResult {
  invoiceId: string
  category: ProcessingCategory
  aiResult: AIProcessingResult | null
  validationErrors: string[]
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Process an invoice through the AI engine pipeline.
 *
 * Never throws — all failures are caught and result in NEEDS_REVIEW.
 * Designed to be called fire-and-forget from email-ingest.ts.
 */
export async function processInvoice(invoiceId: string): Promise<ProcessingResult> {
  const validationErrors: string[] = []

  try {
    // ── Step 1: Load invoice with full relations ─────────────────────────────

    const invoice = await prisma.invInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        lines: true,
        provider: {
          select: {
            id: true,
            name: true,
            abn: true,
            providerType: true,
            isActive: true,
          },
        },
        participant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            ndisNumber: true,
            isActive: true,
            invoiceApprovalEnabled: true,
            pricingRegion: true,
          },
        },
        plan: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            budgetLines: {
              select: { categoryCode: true },
            },
          },
        },
      },
    })

    // ── Step 2: Load historical patterns for AI context ──────────────────────

    const patterns = invoice.providerId
      ? await prisma.invItemPattern.findMany({
          where: { providerId: invoice.providerId },
          select: { categoryCode: true, itemNumber: true, occurrences: true },
          orderBy: { occurrences: 'desc' },
          take: 50,
        })
      : []

    // ── Step 3: Call AI processor ────────────────────────────────────────────

    const planCategories =
      invoice.plan?.budgetLines.map((bl) => bl.categoryCode) ?? []

    const aiInput = {
      extractedText: buildExtractedText(invoice),
      invoiceId,
      providerName: invoice.provider?.name ?? null,
      providerAbn: invoice.provider?.abn ?? null,
      providerType: invoice.provider?.providerType ?? null,
      participantName: invoice.participant
        ? `${invoice.participant.firstName} ${invoice.participant.lastName}`
        : null,
      participantNdisNumber: invoice.participant?.ndisNumber ?? null,
      participantPlanCategories: planCategories,
      historicalPatterns: patterns,
    }

    const aiResult = await processWithAI(aiInput)

    // ── Step 4: Determine category — early-exit checks ───────────────────────

    // AUTO_REJECTED: inactive participant
    if (invoice.participant !== null && invoice.participant.isActive === false) {
      validationErrors.push('Participant is not active')
      await persistResult(invoiceId, 'AUTO_REJECTED', aiResult, 'Participant is not active')
      return { invoiceId, category: 'AUTO_REJECTED', aiResult, validationErrors }
    }

    // AUTO_REJECTED: inactive provider
    if (invoice.provider !== null && invoice.provider.isActive === false) {
      validationErrors.push('Provider is not active')
      await persistResult(invoiceId, 'AUTO_REJECTED', aiResult, 'Provider is not active')
      return { invoiceId, category: 'AUTO_REJECTED', aiResult, validationErrors }
    }

    // AUTO_REJECTED: inactive plan
    if (invoice.plan !== null && invoice.plan.status !== 'ACTIVE') {
      validationErrors.push('Plan is not active')
      await persistResult(invoiceId, 'AUTO_REJECTED', aiResult, 'Plan is not active')
      return { invoiceId, category: 'AUTO_REJECTED', aiResult, validationErrors }
    }

    // NEEDS_REVIEW: AI returned null (Bedrock failure or parsing error)
    if (aiResult === null) {
      await updateLineValidationStatus(invoiceId, null)
      await persistResult(invoiceId, 'NEEDS_REVIEW', null, null)
      return { invoiceId, category: 'NEEDS_REVIEW', aiResult: null, validationErrors }
    }

    // ── Step 5: Update lines with AI results + run per-line validation ───────

    const lineValidations = await validateInvoiceLines(invoiceId, aiResult)

    // Store AI suggestions + validation results on each line
    await updateLinesWithAIData(invoice.lines, aiResult, lineValidations)

    // Check for duplicate line items across other non-rejected invoices
    if (invoice.providerId !== null && invoice.participantId !== null) {
      const dupFound = await checkDuplicateLines(
        invoiceId,
        invoice.providerId,
        invoice.participantId,
        aiResult
      )
      if (dupFound) {
        validationErrors.push('Duplicate line item detected (same provider, participant, date, and code)')
        await persistResult(
          invoiceId,
          'AUTO_REJECTED',
          aiResult,
          'Duplicate line item detected'
        )
        return { invoiceId, category: 'AUTO_REJECTED', aiResult, validationErrors }
      }
    }

    // ── Step 6: Check for BLOCKING flags ────────────────────────────────────

    const hasBlockingFlag = await checkBlockingFlags(
      invoice.participantId,
      invoice.providerId
    )
    if (hasBlockingFlag) {
      validationErrors.push('Participant or provider has unresolved BLOCKING flag')
    }

    // ── Step 7: Determine routing category ───────────────────────────────────

    const hasInvalidLines = lineValidations.some((lv) => lv.status === 'INVALID')
    const hasLowOrNoneLineConfidence = aiResult.lineItems.some(
      (li) => li.codeConfidence === 'LOW' || li.codeConfidence === 'NONE'
    )

    let category: ProcessingCategory

    if (hasBlockingFlag || hasInvalidLines) {
      // BLOCKING flags or invalid lines → NEEDS_REVIEW
      category = 'NEEDS_REVIEW'
      if (hasInvalidLines) {
        const invalidNotes = lineValidations
          .filter((lv) => lv.status === 'INVALID')
          .flatMap((lv) => lv.notes)
        validationErrors.push(...invalidNotes)
      }
    } else if (aiResult.overallConfidence === 'LOW') {
      category = 'NEEDS_REVIEW'
    } else if (aiResult.overallConfidence === 'MEDIUM' || hasLowOrNoneLineConfidence) {
      category = 'NEEDS_CODES'
    } else if (
      invoice.participant !== null &&
      invoice.participant.invoiceApprovalEnabled === true
    ) {
      // All pass, HIGH confidence, no flags — but participant wants to approve
      category = 'PARTICIPANT_APPROVAL'
    } else {
      // All pass, HIGH confidence, no flags, no participant approval required
      category = 'AUTO_APPROVED'
    }

    // ── Step 8: Execute action based on category ─────────────────────────────

    await persistResult(invoiceId, category, aiResult, null)
    await executeAction(invoiceId, category, invoice.participantId)

    return { invoiceId, category, aiResult, validationErrors }
  } catch (err) {
    // Catch-all: log and fall back to NEEDS_REVIEW so the invoice is never lost
    console.error('[processing-engine] Unhandled error in processInvoice:', err)
    try {
      await persistResult(invoiceId, 'NEEDS_REVIEW', null, null)
    } catch {
      // Best effort
    }
    return {
      invoiceId,
      category: 'NEEDS_REVIEW',
      aiResult: null,
      validationErrors: ['Internal processing error — manual review required'],
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a plain-text representation of the invoice for the AI prompt.
 * We use the invoice's existing Textract-extracted data (stored as aiRawData)
 * plus line items to give the AI the most information.
 */
function buildExtractedText(invoice: {
  invoiceNumber: string | null
  invoiceDate: Date | null
  totalCents: number
  aiRawData: unknown
  lines: Array<{
    supportItemCode: string
    supportItemName: string
    serviceDate: Date
    quantity: number
    unitPriceCents: number
    totalCents: number
  }>
}): string {
  const parts: string[] = []

  // Use raw extracted data if available (contains original Textract output)
  if (invoice.aiRawData !== null && typeof invoice.aiRawData === 'object') {
    const raw = invoice.aiRawData as Record<string, unknown>
    if (typeof raw['rawText'] === 'string' && raw['rawText'].length > 0) {
      return raw['rawText']
    }
  }

  // Fall back to structured invoice data
  parts.push(`Invoice Number: ${invoice.invoiceNumber ?? 'Unknown'}`)
  if (invoice.invoiceDate) {
    parts.push(`Invoice Date: ${invoice.invoiceDate.toISOString().slice(0, 10)}`)
  }
  parts.push(`Total: $${(invoice.totalCents / 100).toFixed(2)}`)
  parts.push('')
  parts.push('Line Items:')

  for (const line of invoice.lines) {
    parts.push(
      `- ${line.supportItemName} (${line.supportItemCode}) | ` +
        `Date: ${line.serviceDate.toISOString().slice(0, 10)} | ` +
        `Qty: ${line.quantity} | ` +
        `Unit: $${(line.unitPriceCents / 100).toFixed(2)} | ` +
        `Total: $${(line.totalCents / 100).toFixed(2)}`
    )
  }

  return parts.join('\n')
}

/**
 * Check for duplicate line items (same provider+participant+date+code)
 * in other non-rejected invoices.
 */
async function checkDuplicateLines(
  invoiceId: string,
  providerId: string,
  participantId: string,
  aiResult: AIProcessingResult
): Promise<boolean> {
  for (const lineItem of aiResult.lineItems) {
    if (!lineItem.suggestedNdisCode || !lineItem.serviceDate) continue

    const serviceDate = new Date(lineItem.serviceDate)
    if (isNaN(serviceDate.getTime())) continue

    const dup = await prisma.invInvoiceLine.findFirst({
      where: {
        invoice: {
          id: { not: invoiceId },
          providerId,
          participantId,
          status: { not: 'REJECTED' },
          deletedAt: null,
        },
        serviceDate,
        supportItemCode: lineItem.suggestedNdisCode,
      },
      select: { id: true },
    })

    if (dup !== null) return true
  }

  return false
}

/**
 * Check if participant or provider has any unresolved BLOCKING flags.
 * Returns true if a BLOCKING flag is found.
 */
async function checkBlockingFlags(
  participantId: string | null,
  providerId: string | null
): Promise<boolean> {
  try {
    const orConditions: Array<Record<string, unknown>> = []
    if (participantId) orConditions.push({ participantId })
    if (providerId) orConditions.push({ providerId })
    if (orConditions.length === 0) return false

    const blockingFlag = await prisma.crmFlag.findFirst({
      where: {
        OR: orConditions,
        severity: 'BLOCKING',
        resolvedAt: null,
      },
      select: { id: true },
    })

    return blockingFlag !== null
  } catch {
    // Flag check failure must not block processing — be conservative
    return false
  }
}

/**
 * Update invoice lines with AI suggestions and per-line validation results.
 */
async function updateLinesWithAIData(
  lines: Array<{ id: string; supportItemCode: string }>,
  aiResult: AIProcessingResult,
  lineValidations: Awaited<ReturnType<typeof validateInvoiceLines>>
): Promise<void> {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const aiLine = aiResult.lineItems[i]
    const validation = lineValidations.find((lv) => lv.lineIndex === i)

    if (!line) continue

    await prisma.invInvoiceLine.update({
      where: { id: line.id },
      data: {
        ...(aiLine
          ? {
              aiSuggestedCode: aiLine.suggestedNdisCode ?? undefined,
              aiCodeConfidence: aiLine.codeConfidence,
              aiCodeReasoning: aiLine.codeReasoning,
              priceCapCents: await getPriceCap(aiLine.suggestedNdisCode),
            }
          : {}),
        validationStatus: validation?.status ?? 'PENDING',
        validationNotes: validation?.notes ?? [],
      },
    })
  }
}

/**
 * Look up NDIS price cap for a support item code from the active price guide.
 * Returns null if code is not found or no active price guide.
 */
async function getPriceCap(itemNumber: string | null): Promise<number | null> {
  if (!itemNumber) return null

  try {
    const now = new Date()
    const activeVersion = await prisma.ndisPriceGuideVersion.findFirst({
      where: {
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true },
    })

    if (!activeVersion) return null

    const item = await prisma.ndisSupportItem.findFirst({
      where: { versionId: activeVersion.id, itemNumber },
      select: { priceStandardCents: true },
    })

    return item?.priceStandardCents ?? null
  } catch {
    return null
  }
}

/**
 * Update all invoice lines to PENDING when AI result is null (fallback).
 */
async function updateLineValidationStatus(
  invoiceId: string,
  _aiResult: null
): Promise<void> {
  await prisma.invInvoiceLine.updateMany({
    where: { invoiceId },
    data: { validationStatus: 'PENDING' },
  })
}

/**
 * Persist the processing result on the invoice record.
 */
async function persistResult(
  invoiceId: string,
  category: ProcessingCategory,
  aiResult: AIProcessingResult | null,
  rejectionReason: string | null
): Promise<void> {
  await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      processingCategory: category,
      aiProcessingResult: aiResult ?? undefined,
      processedAt: new Date(),
      // Set rejection reason on the invoice for AUTO_REJECTED
      ...(category === 'AUTO_REJECTED' && rejectionReason !== null
        ? { rejectionReason }
        : {}),
    },
  })
}

/**
 * Execute the action appropriate for the routing category.
 */
async function executeAction(
  invoiceId: string,
  category: ProcessingCategory,
  participantId: string | null
): Promise<void> {
  switch (category) {
    case 'AUTO_APPROVED': {
      // Auto-approve using system user — validation already passed above
      try {
        await approveInvoice(invoiceId, SYSTEM_USER_ID, undefined, true)
      } catch (err) {
        // If auto-approval fails, fall back to PENDING_REVIEW status so
        // the invoice is not lost. Log the error for diagnostics.
        console.error('[processing-engine] AUTO_APPROVED approval failed, falling back to PENDING_REVIEW:', err)
        await prisma.invInvoice.update({
          where: { id: invoiceId },
          data: {
            status: 'PENDING_REVIEW',
            processingCategory: 'NEEDS_REVIEW',
          },
        })
      }
      break
    }

    case 'PARTICIPANT_APPROVAL': {
      // Request participant approval — participants must have approval enabled
      try {
        await requestParticipantApproval(invoiceId, SYSTEM_USER_ID)
      } catch (err) {
        // If participant approval request fails, set PENDING_REVIEW
        console.error('[processing-engine] PARTICIPANT_APPROVAL request failed:', err)
        await prisma.invInvoice.update({
          where: { id: invoiceId },
          data: { status: 'PENDING_REVIEW' },
        })
      }
      break
    }

    case 'NEEDS_CODES':
    case 'NEEDS_REVIEW': {
      await prisma.invInvoice.update({
        where: { id: invoiceId },
        data: { status: 'PENDING_REVIEW' },
      })
      break
    }

    case 'AUTO_REJECTED': {
      await prisma.invInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'REJECTED',
          rejectedById: SYSTEM_USER_ID,
          rejectedAt: new Date(),
        },
      })
      break
    }
  }
}
