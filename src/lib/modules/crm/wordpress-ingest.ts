/**
 * WordPress webhook ingest module — WS6.
 *
 * Processes "Start your journey" form submissions from WordPress.
 * Creates a DRAFT CrmParticipant + DRAFT SaServiceAgreement.
 * Emits ParticipantCreatedEvent via EventBridge.
 *
 * REQ-WS6: WordPress webhook → DRAFT participant + service agreement.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { processEvent } from '@/lib/modules/automation/engine'

// ── Zod schema ────────────────────────────────────────────────────────────────

/**
 * Payload shape POSTed by the WordPress "Start your journey" form.
 * All fields optional except at least firstName OR email must be present.
 */
export const WordPressPayloadSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    ndisNumber: z.string().optional(),
    dateOfBirth: z.string().optional(), // ISO date string
    providerAbn: z.string().optional(),
    providerName: z.string().optional(),
    startDate: z.string().optional(), // ISO date
    endDate: z.string().optional(), // ISO date
    notes: z.string().optional(),
  })
  .refine((d) => d.firstName !== undefined || d.email !== undefined, {
    message: 'firstName or email required',
  })

export type WordPressPayload = z.infer<typeof WordPressPayloadSchema>

// ── Agreement ref generation ─────────────────────────────────────────────────

function generateAgreementRef(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const random = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `SA-${dateStr}-${random}`
}

async function generateUniqueRef(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = generateAgreementRef()
    const existing = await prisma.saServiceAgreement.findUnique({
      where: { agreementRef: ref },
      select: { id: true },
    })
    if (!existing) return ref
  }
  throw new Error('Failed to generate unique agreement reference — please retry')
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface WordPressIngestResult {
  participantId: string
  serviceAgreementId: string | null
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Process a validated WordPress form submission.
 *
 * 1. Create CrmParticipant (isActive: false, onboardingStatus: DRAFT, ingestSource: WORDPRESS)
 * 2. Find first GLOBAL_ADMIN as default SA manager
 * 3. Create SaServiceAgreement (status: DRAFT) — skipped if no manager found
 * 4. If providerAbn supplied → link SA to matching provider
 * 5. Emit ParticipantCreatedEvent
 */
export async function processWordPressSubmission(
  payload: WordPressPayload
): Promise<WordPressIngestResult> {
  // ── 1. Derive a placeholder ndisNumber if none supplied ───────────────────
  // WordPress forms may not have the NDIS number yet. We generate a temporary
  // placeholder so the unique constraint is satisfied. Staff will fill it in
  // during onboarding completion.
  const ndisNumber =
    payload.ndisNumber ?? `WP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  // ── 2. Build dateOfBirth ───────────────────────────────────────────────────
  // CrmParticipant.dateOfBirth is required. Use a sentinel date if not provided.
  const dateOfBirth = payload.dateOfBirth
    ? new Date(payload.dateOfBirth)
    : new Date('1900-01-01')

  // ── 3. Create participant ─────────────────────────────────────────────────
  const participant = await prisma.crmParticipant.create({
    data: {
      ndisNumber,
      firstName: payload.firstName ?? '(Unknown)',
      lastName: payload.lastName ?? '',
      dateOfBirth,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      isActive: false,
      onboardingStatus: 'DRAFT',
      ingestSource: 'WORDPRESS',
    },
  })

  await createAuditLog({
    userId: 'SYSTEM',
    action: 'participant.created.wordpress',
    resource: 'participant',
    resourceId: participant.id,
    after: {
      ingestSource: 'WORDPRESS',
      onboardingStatus: 'DRAFT',
      // No PII in audit log (REQ-017)
    },
  })

  // ── 4. Emit participant created event ─────────────────────────────────────
  void processEvent('lotus-pm.crm.participant-created', {
    participantId: participant.id,
    ndisNumber: participant.ndisNumber,
    createdAt: participant.createdAt.toISOString(),
  }).catch(() => {
    // Automation failures must not block core operations
  })

  // ── 5. Find first GLOBAL_ADMIN as default SA manager ─────────────────────
  const adminUser = await prisma.coreUser.findFirst({
    where: { role: 'GLOBAL_ADMIN', isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!adminUser) {
    // No admin found — skip SA creation as instructed
    return { participantId: participant.id, serviceAgreementId: null }
  }

  // ── 6. Resolve provider by ABN (optional) ─────────────────────────────────
  let providerId: string | null = null
  if (payload.providerAbn) {
    const provider = await prisma.crmProvider.findUnique({
      where: { abn: payload.providerAbn },
      select: { id: true },
    })
    if (provider) {
      providerId = provider.id
    }
    // ABN not found → continue without linking provider
  }

  // ── 7. Build SA dates ─────────────────────────────────────────────────────
  const saStartDate = payload.startDate ? new Date(payload.startDate) : null
  const saEndDate = payload.endDate ? new Date(payload.endDate) : null

  // SA requires startDate + endDate. If not supplied use sensible defaults.
  const startDate = saStartDate ?? new Date()
  const endDate = saEndDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

  // ── 8. Generate unique agreement ref ─────────────────────────────────────
  const agreementRef = await generateUniqueRef()

  // ── 9. Create SA ─────────────────────────────────────────────────────────
  const agreement = await prisma.saServiceAgreement.create({
    data: {
      agreementRef,
      participantId: participant.id,
      providerId: providerId ?? undefined,
      startDate,
      endDate,
      notes: payload.notes ?? null,
      managedById: adminUser.id,
      status: 'DRAFT',
    },
    select: { id: true },
  })

  await createAuditLog({
    userId: 'SYSTEM',
    action: 'service-agreement.created.wordpress',
    resource: 'service-agreement',
    resourceId: agreement.id,
    after: {
      agreementRef,
      status: 'DRAFT',
      participantId: participant.id,
      ingestSource: 'WORDPRESS',
    },
  })

  return {
    participantId: participant.id,
    serviceAgreementId: agreement.id,
  }
}
