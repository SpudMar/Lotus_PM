# PM Session Feedback — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 12 feature gaps identified in PM user session + Holly's approved supports feature, covering invoice approval overhaul, provider/line item controls, claims/PRODA pipeline, and cross-app contextual actions.

**Architecture:** Four themes broken into 7 PRs (waves). Schema changes land first (Wave 0), then backend modules (Waves 1–3), then UI (Waves 4–6). Each wave is independently deployable. All financial amounts in cents. TDD with Jest mocks matching existing `claim-generation.test.ts` patterns.

**Tech Stack:** Next.js 16 (App Router), Prisma ORM, PostgreSQL, Jest, shadcn/ui, Tailwind CSS, AWS SES

**Design Document:** `/Users/Spud/.claude/plans/zazzy-wondering-dawn.md`

---

## Wave 0 — Schema Migration (PR #1)

All Prisma schema changes in one migration. No application code yet — just the database.

### Task 0.1: Add RejectionSource enum

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the enum after existing enums (~line 1380)**

```prisma
enum RejectionSource {
  PM_REJECTED
  PARTICIPANT_DECLINED
  NDIA_REJECTED
}
```

**Step 2: Add field to InvInvoice model (~line 600)**

Add after `rejectionReason`:
```prisma
  rejectionSource    RejectionSource?
```

**Step 3: Verify schema is valid**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`
Expected: "Your schema is valid"

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add RejectionSource enum and field on InvInvoice"
```

---

### Task 0.2: Add invoice versioning fields

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add SUPERSEDED to InvStatus enum (~line 611)**

Add `SUPERSEDED` after `PAID`:
```prisma
enum InvStatus {
  RECEIVED
  PROCESSING
  PENDING_REVIEW
  PENDING_PARTICIPANT_APPROVAL
  APPROVED
  REJECTED
  CLAIMED
  PAID
  SUPERSEDED
}
```

**Step 2: Add versioning fields to InvInvoice model (~line 600)**

Add after `rejectionSource`:
```prisma
  version            Int              @default(1)
  supersededById     String?
  supersededBy       InvInvoice?      @relation("InvoiceVersion", fields: [supersededById], references: [id])
  supersedes         InvInvoice?      @relation("InvoiceVersion")
  supersededAt       DateTime?
```

**Step 3: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add SUPERSEDED status and invoice versioning fields"
```

---

### Task 0.3: Add approval re-request fields

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add fields to InvInvoice model**

Add after `approvalSkippedAt`:
```prisma
  approvalClarificationNote  String?
  approvalRequestCount       Int              @default(0)
```

**Step 2: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add approval clarification and request count fields"
```

---

### Task 0.4: Add ClmClaimType enum and manual enquiry fields

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add enum after ClmStatus (~line 863)**

```prisma
enum ClmClaimType {
  STANDARD
  MANUAL_ENQUIRY
}
```

**Step 2: Add fields to ClmClaim model (~line 745)**

Add after `outcomeNotes`:
```prisma
  claimType          ClmClaimType     @default(STANDARD)
  manualEnquiryNote  String?
```

**Step 3: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add ClmClaimType enum and manual enquiry fields"
```

---

### Task 0.5: Add ParticipantApprovalRule model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new model after CrmParticipant**

```prisma
model ParticipantApprovalRule {
  id              String          @id @default(cuid())
  participantId   String
  participant     CrmParticipant  @relation(fields: [participantId], references: [id])
  providerId      String?
  provider        CrmProvider?    @relation(fields: [providerId], references: [id])
  requireApproval Boolean
  createdById     String
  createdBy       CoreUser        @relation(fields: [createdById], references: [id])
  createdAt       DateTime        @default(now())

  @@unique([participantId, providerId])
  @@map("participant_approval_rules")
}
```

**Step 2: Add reverse relations**

On `CrmParticipant` add:
```prisma
  approvalRules    ParticipantApprovalRule[]
```

On `CrmProvider` add:
```prisma
  approvalRules    ParticipantApprovalRule[]
```

On `CoreUser` add (find existing relations block):
```prisma
  approvalRulesCreated  ParticipantApprovalRule[]
```

**Step 3: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add ParticipantApprovalRule model"
```

---

### Task 0.6: Add ProviderParticipantBlock model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new model**

```prisma
model ProviderParticipantBlock {
  id               String          @id @default(cuid())
  participantId    String
  participant      CrmParticipant  @relation(fields: [participantId], references: [id])
  providerId       String
  provider         CrmProvider     @relation(fields: [providerId], references: [id])
  blockAllLines    Boolean         @default(true)
  blockedLineItems String[]
  reason           String
  createdById      String
  createdBy        CoreUser        @relation("BlockCreatedBy", fields: [createdById], references: [id])
  createdAt        DateTime        @default(now())
  resolvedAt       DateTime?
  resolvedById     String?
  resolvedBy       CoreUser?       @relation("BlockResolvedBy", fields: [resolvedById], references: [id])
  resolveNote      String?

  @@map("provider_participant_blocks")
}
```

**Step 2: Add reverse relations**

On `CrmParticipant`:
```prisma
  providerBlocks    ProviderParticipantBlock[]
```

On `CrmProvider`:
```prisma
  participantBlocks ProviderParticipantBlock[]
```

On `CoreUser`:
```prisma
  blocksCreated     ProviderParticipantBlock[] @relation("BlockCreatedBy")
  blocksResolved    ProviderParticipantBlock[] @relation("BlockResolvedBy")
```

**Step 3: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add ProviderParticipantBlock model"
```

---

### Task 0.7: Add ParticipantApprovedSupport model (Holly's feature)

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new model**

```prisma
model ParticipantApprovedSupport {
  id               String          @id @default(cuid())
  participantId    String
  participant      CrmParticipant  @relation(fields: [participantId], references: [id])
  categoryCode     String
  restrictedMode   Boolean         @default(false)
  allowedItemCodes String[]
  createdById      String
  createdBy        CoreUser        @relation(fields: [createdById], references: [id])
  updatedAt        DateTime        @updatedAt

  @@unique([participantId, categoryCode])
  @@map("participant_approved_supports")
}
```

**Step 2: Add reverse relations**

On `CrmParticipant`:
```prisma
  approvedSupports  ParticipantApprovedSupport[]
```

On `CoreUser`:
```prisma
  approvedSupportsCreated  ParticipantApprovedSupport[]
```

**Step 3: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add ParticipantApprovedSupport model"
```

---

### Task 0.8: Add correspondence entity linking FKs

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Check CrmCorrespondence model**

The model already has `invoiceId` and `documentId` (found in `CreateCorrespondenceInput`). Add the missing FKs.

Add to `CrmCorrespondence` model:
```prisma
  planId             String?
  plan               PlanPlan?           @relation(fields: [planId], references: [id])
  saId               String?
  serviceAgreement   SaServiceAgreement? @relation(fields: [saId], references: [id])
```

**Step 2: Add planId FK to DocDocument model**

Add to `DocDocument`:
```prisma
  planId             String?
  plan               PlanPlan?           @relation(fields: [planId], references: [id])
```

**Step 3: Add reverse relations**

On `PlanPlan`:
```prisma
  correspondence     CrmCorrespondence[]
  documents          DocDocument[]
```

On `SaServiceAgreement`:
```prisma
  correspondence     CrmCorrespondence[]
```

**Step 4: Validate**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma validate`

**Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add entity linking FKs on correspondence and planId on documents"
```

---

### Task 0.9: Generate migration and Prisma client

**Step 1: Generate Prisma client (no DB needed)**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate`
Expected: "✔ Generated Prisma Client"

**Step 2: Create migration SQL (dry run — will apply on staging)**

Run: `cd /Users/Spud/Lotus_PM && DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma migrate dev --name pm-session-feedback --create-only`
Expected: Creates migration file in `prisma/migrations/`

Note: If the DB is not available locally, the `--create-only` flag generates the SQL without applying it. The migration will apply automatically on staging deploy.

**Step 3: Commit migration**

```bash
git add prisma/
git commit -m "schema: generate migration for PM session feedback features"
```

---

## Wave 1 — Theme A Backend: Approval & Rejection (PR #2)

Depends on: Wave 0 (schema)

### Task 1.1: Per-provider approval rule checking

**Files:**
- Test: `src/lib/modules/invoices/participant-approval.test.ts` (create new)
- Modify: `src/lib/modules/invoices/participant-approval.ts`

**Step 1: Write the failing test**

Create `src/lib/modules/invoices/participant-approval.test.ts`:

```typescript
/**
 * Tests for per-provider approval rule checking.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    participantApprovalRule: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    invInvoice: { findUnique: jest.fn(), update: jest.fn() },
    crmParticipant: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/automation/engine', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/notifications/notifications', () => ({
  createNotificationRecord: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/modules/notifications/email-send', () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({ messageId: 'test-123' }),
}))

jest.mock('./status-history', () => ({
  recordStatusTransition: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { shouldRequireApproval } from './participant-approval'

const mockRuleFindFirst = prisma.participantApprovalRule.findFirst as jest.MockedFunction<
  typeof prisma.participantApprovalRule.findFirst
>

describe('shouldRequireApproval', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns false when no rules exist (backward compatible)', async () => {
    mockRuleFindFirst.mockResolvedValueOnce(null) // specific provider
    mockRuleFindFirst.mockResolvedValueOnce(null) // default rule
    const result = await shouldRequireApproval('part-001', 'prov-001')
    expect(result).toBe(false)
  })

  it('returns true when specific provider rule requires approval', async () => {
    mockRuleFindFirst.mockResolvedValueOnce({ requireApproval: true } as any)
    const result = await shouldRequireApproval('part-001', 'prov-001')
    expect(result).toBe(true)
  })

  it('returns false when specific provider rule skips approval', async () => {
    mockRuleFindFirst.mockResolvedValueOnce({ requireApproval: false } as any)
    const result = await shouldRequireApproval('part-001', 'prov-001')
    expect(result).toBe(false)
  })

  it('falls back to default rule when no specific provider rule', async () => {
    mockRuleFindFirst.mockResolvedValueOnce(null) // no specific
    mockRuleFindFirst.mockResolvedValueOnce({ requireApproval: true } as any) // default
    const result = await shouldRequireApproval('part-001', 'prov-001')
    expect(result).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/participant-approval.test.ts --no-coverage`
Expected: FAIL — `shouldRequireApproval` not exported

**Step 3: Implement shouldRequireApproval**

Add to `src/lib/modules/invoices/participant-approval.ts` (after imports, ~line 18):

```typescript
/**
 * Check per-provider approval rules.
 * Priority: specific provider rule > default rule (providerId=null) > false (no rules = no approval)
 */
export async function shouldRequireApproval(
  participantId: string,
  providerId: string
): Promise<boolean> {
  // Check specific provider rule first
  const specificRule = await prisma.participantApprovalRule.findFirst({
    where: { participantId, providerId },
  })
  if (specificRule) return specificRule.requireApproval

  // Fall back to default rule (providerId = null)
  const defaultRule = await prisma.participantApprovalRule.findFirst({
    where: { participantId, providerId: null },
  })
  if (defaultRule) return defaultRule.requireApproval

  // No rules = no approval required (backward compatible)
  return false
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/participant-approval.test.ts --no-coverage`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lib/modules/invoices/participant-approval.ts src/lib/modules/invoices/participant-approval.test.ts
git commit -m "feat: add per-provider approval rule checking"
```

---

### Task 1.2: Update requestParticipantApproval to use rules

**Files:**
- Modify: `src/lib/modules/invoices/participant-approval.ts` (~line 75)
- Modify: `src/lib/modules/invoices/participant-approval.test.ts`

**Step 1: Write failing test for rule-based approval request**

Add to test file:

```typescript
import { requestParticipantApproval } from './participant-approval'

const mockInvoiceFindUnique = prisma.invInvoice.findUnique as jest.MockedFunction<
  typeof prisma.invInvoice.findUnique
>
const mockInvoiceUpdate = prisma.invInvoice.update as jest.MockedFunction<
  typeof prisma.invInvoice.update
>

describe('requestParticipantApproval', () => {
  const mockInvoice = {
    id: 'inv-001',
    participantId: 'part-001',
    providerId: 'prov-001',
    status: 'PENDING_REVIEW',
    participant: {
      id: 'part-001',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      invoiceApprovalMethod: 'EMAIL',
    },
  }

  beforeEach(() => jest.clearAllMocks())

  it('checks per-provider rules instead of boolean flag', async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce(mockInvoice as any)
    mockRuleFindFirst.mockResolvedValueOnce({ requireApproval: true } as any)
    mockInvoiceUpdate.mockResolvedValueOnce({ ...mockInvoice, status: 'PENDING_PARTICIPANT_APPROVAL' } as any)

    const result = await requestParticipantApproval('inv-001', 'user-001')
    expect(result.invoice.status).toBe('PENDING_PARTICIPANT_APPROVAL')
    expect(mockRuleFindFirst).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/participant-approval.test.ts --no-coverage -t "checks per-provider"`
Expected: FAIL

**Step 3: Update requestParticipantApproval**

In `participant-approval.ts`, find the `requestParticipantApproval` function (~line 75). Replace the check on `participant.invoiceApprovalEnabled` with:

```typescript
  // Check per-provider approval rules (replaces old invoiceApprovalEnabled boolean)
  const requiresApproval = await shouldRequireApproval(
    invoice.participantId,
    invoice.providerId!
  )
  if (!requiresApproval) {
    throw new Error('Participant approval is not required for this provider')
  }
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/participant-approval.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/invoices/participant-approval.ts src/lib/modules/invoices/participant-approval.test.ts
git commit -m "feat: use per-provider approval rules in requestParticipantApproval"
```

---

### Task 1.3: Re-request approval with clarification

**Files:**
- Modify: `src/lib/modules/invoices/participant-approval.ts`
- Modify: `src/lib/modules/invoices/participant-approval.test.ts`

**Step 1: Write failing test**

Add to test file:

```typescript
import { reRequestApproval } from './participant-approval'

describe('reRequestApproval', () => {
  beforeEach(() => jest.clearAllMocks())

  it('generates new token and stores clarification note', async () => {
    mockInvoiceFindUnique.mockResolvedValueOnce({
      id: 'inv-001',
      participantId: 'part-001',
      providerId: 'prov-001',
      status: 'PENDING_REVIEW',
      approvalRequestCount: 1,
      participant: {
        id: 'part-001',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        invoiceApprovalMethod: 'EMAIL',
      },
    } as any)
    mockRuleFindFirst.mockResolvedValueOnce({ requireApproval: true } as any)
    mockInvoiceUpdate.mockResolvedValueOnce({ status: 'PENDING_PARTICIPANT_APPROVAL' } as any)

    const result = await reRequestApproval('inv-001', 'user-001', 'Provider corrected line 3')
    expect(mockInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalClarificationNote: 'Provider corrected line 3',
          approvalRequestCount: 2,
        }),
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/participant-approval.test.ts --no-coverage -t "generates new token"`
Expected: FAIL — `reRequestApproval` not exported

**Step 3: Implement reRequestApproval**

Add to `participant-approval.ts`:

```typescript
/**
 * Re-request participant approval with a clarification note.
 * Generates a fresh 72h token and increments the request count.
 */
export async function reRequestApproval(
  invoiceId: string,
  requestedById: string,
  clarificationNote: string
): Promise<{ token: string; invoice: any }> {
  const invoice = await prisma.invInvoice.findUnique({
    where: { id: invoiceId },
    include: { participant: true },
  })
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'PENDING_REVIEW') {
    throw new Error('Invoice must be in PENDING_REVIEW status to re-request approval')
  }

  const requiresApproval = await shouldRequireApproval(
    invoice.participantId,
    invoice.providerId!
  )
  if (!requiresApproval) {
    throw new Error('Participant approval is not required for this provider')
  }

  const jti = randomBytes(16).toString('hex')
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 72 * 60 * 60

  const payload: ApprovalTokenPayload = {
    invoiceId,
    participantId: invoice.participantId,
    jti,
    exp,
    iat: now,
  }

  const token = signToken(payload)
  const tokenHash = hashToken(token)

  const updated = await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'PENDING_PARTICIPANT_APPROVAL',
      participantApprovalStatus: 'PENDING',
      approvalTokenHash: tokenHash,
      approvalTokenExpiresAt: new Date(exp * 1000),
      approvalSentAt: new Date(),
      approvalClarificationNote: clarificationNote,
      approvalRequestCount: (invoice.approvalRequestCount ?? 0) + 1,
    },
  })

  await recordStatusTransition(invoiceId, 'PENDING_REVIEW', 'PENDING_PARTICIPANT_APPROVAL', requestedById)
  await createAuditLog({
    action: 'INVOICE_APPROVAL_RE_REQUESTED',
    resourceType: 'InvInvoice',
    resourceId: invoiceId,
    userId: requestedById,
    details: { clarificationNote, requestCount: updated.approvalRequestCount },
  })

  // Send notification via participant's preferred channel
  if (invoice.participant.invoiceApprovalMethod === 'EMAIL' && invoice.participant.email) {
    await sendTemplatedEmail({
      to: invoice.participant.email,
      templateType: 'APPROVAL_REQUEST',
      mergeFields: {
        participantName: `${invoice.participant.firstName} ${invoice.participant.lastName}`,
        invoiceId,
        clarificationNote,
      },
    })
  }

  return { token, invoice: updated }
}
```

Note: `signToken` is a private helper already in the file. If it's not exported, reference it directly.

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/participant-approval.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/invoices/participant-approval.ts src/lib/modules/invoices/participant-approval.test.ts
git commit -m "feat: add reRequestApproval with clarification note"
```

---

### Task 1.4: Set rejection source on rejection actions

**Files:**
- Modify: `src/lib/modules/invoices/invoices.ts`
- Modify: `src/lib/modules/invoices/participant-approval.ts`

**Step 1: Find the PM rejection function in invoices.ts**

Read `src/lib/modules/invoices/invoices.ts` and locate the reject/approval functions. The PM rejection path sets `status: 'REJECTED'`. Add `rejectionSource: 'PM_REJECTED'` to that update.

**Step 2: Update PM rejection path**

In `invoices.ts`, find where `status: 'REJECTED'` is set by PM action. Add:
```typescript
rejectionSource: 'PM_REJECTED',
```

**Step 3: Update participant rejection path**

In `participant-approval.ts`, find `processApprovalResponse` (~line 149). In the REJECTED branch, add:
```typescript
rejectionSource: 'PARTICIPANT_DECLINED',
```

**Step 4: Run all invoice tests**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/ --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/invoices/invoices.ts src/lib/modules/invoices/participant-approval.ts
git commit -m "feat: set rejectionSource on PM and participant rejection paths"
```

---

### Task 1.5: Invoice versioning — createNewVersion

**Files:**
- Test: Add to existing invoice tests or create `src/lib/modules/invoices/invoice-versioning.test.ts`
- Create: `src/lib/modules/invoices/invoice-versioning.ts`

**Step 1: Write the failing test**

Create `src/lib/modules/invoices/invoice-versioning.test.ts`:

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    invInvoice: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    invInvoiceLine: { findMany: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('./status-history', () => ({
  recordStatusTransition: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { createNewVersion } from './invoice-versioning'

const mockFindUnique = prisma.invInvoice.findUnique as jest.MockedFunction<typeof prisma.invInvoice.findUnique>
const mockUpdate = prisma.invInvoice.update as jest.MockedFunction<typeof prisma.invInvoice.update>
const mockCreate = prisma.invInvoice.create as jest.MockedFunction<typeof prisma.invInvoice.create>

describe('createNewVersion', () => {
  beforeEach(() => jest.clearAllMocks())

  it('supersedes old invoice and creates new version', async () => {
    const oldInvoice = {
      id: 'inv-001',
      invoiceNumber: 'INV-100',
      participantId: 'part-001',
      providerId: 'prov-001',
      planId: 'plan-001',
      version: 1,
      status: 'PENDING_REVIEW',
      lines: [{ supportItemCode: '01_001', quantity: 1, unitPriceCents: 5000, totalCents: 5000 }],
    }

    mockFindUnique.mockResolvedValueOnce(oldInvoice as any)
    mockUpdate.mockResolvedValueOnce({ ...oldInvoice, status: 'SUPERSEDED' } as any)
    mockCreate.mockResolvedValueOnce({ id: 'inv-002', version: 2, status: 'RECEIVED' } as any)

    const result = await createNewVersion('inv-001', 'user-001')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-001' },
        data: expect.objectContaining({ status: 'SUPERSEDED', supersededAt: expect.any(Date) }),
      })
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2, status: 'RECEIVED' }),
      })
    )
    expect(result.id).toBe('inv-002')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/invoice-versioning.test.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Implement createNewVersion**

Create `src/lib/modules/invoices/invoice-versioning.ts`:

```typescript
/**
 * Invoice Versioning — creates a new version of an invoice when
 * providers reissue with the same number.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'
import { recordStatusTransition } from './status-history'

export async function createNewVersion(invoiceId: string, userId: string) {
  const invoice = await prisma.invInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  })
  if (!invoice) throw new Error('Invoice not found')

  // Supersede old invoice
  await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'SUPERSEDED',
      supersededAt: new Date(),
    },
  })

  await recordStatusTransition(invoiceId, invoice.status, 'SUPERSEDED', userId)

  // Create new version at RECEIVED
  const newInvoice = await prisma.invInvoice.create({
    data: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      participantId: invoice.participantId,
      providerId: invoice.providerId,
      planId: invoice.planId,
      subtotalCents: invoice.subtotalCents,
      gstCents: invoice.gstCents,
      totalCents: invoice.totalCents,
      s3Key: invoice.s3Key,
      s3Bucket: invoice.s3Bucket,
      status: 'RECEIVED',
      version: invoice.version + 1,
      supersededById: null, // This version is NOT superseded
      ingestSource: 'MANUAL',
    },
  })

  // Link old invoice to new version
  await prisma.invInvoice.update({
    where: { id: invoiceId },
    data: { supersededById: newInvoice.id },
  })

  await createAuditLog({
    action: 'INVOICE_VERSION_CREATED',
    resourceType: 'InvInvoice',
    resourceId: newInvoice.id,
    userId,
    details: { previousVersionId: invoiceId, version: newInvoice.version },
  })

  return newInvoice
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/invoice-versioning.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/invoices/invoice-versioning.ts src/lib/modules/invoices/invoice-versioning.test.ts
git commit -m "feat: add invoice versioning — createNewVersion"
```

---

### Task 1.6: Skip SUPERSEDED in duplicate check

**Files:**
- Modify: `src/lib/modules/invoices/invoice-validation.ts` (~line 202)

**Step 1: Update duplicate check**

Find Check 7 (~line 202). Change the `status: { not: 'REJECTED' }` filter to:
```typescript
status: { notIn: ['REJECTED', 'SUPERSEDED'] },
```

**Step 2: Run validation tests**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/ --no-coverage`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/modules/invoices/invoice-validation.ts
git commit -m "fix: skip SUPERSEDED invoices in duplicate check"
```

---

## Wave 2 — Theme B Backend: Provider & Line Item Controls (PR #3)

Depends on: Wave 0 (schema)

### Task 2.1: Provider-participant block module

**Files:**
- Test: `src/lib/modules/crm/provider-participant-blocks.test.ts` (create)
- Create: `src/lib/modules/crm/provider-participant-blocks.ts`

**Step 1: Write the failing test**

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    providerParticipantBlock: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    crmFlag: { create: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { createBlock, getActiveBlock, resolveBlock } from './provider-participant-blocks'

const mockCreate = prisma.providerParticipantBlock.create as jest.MockedFunction<
  typeof prisma.providerParticipantBlock.create
>
const mockFindFirst = prisma.providerParticipantBlock.findFirst as jest.MockedFunction<
  typeof prisma.providerParticipantBlock.findFirst
>

describe('provider-participant-blocks', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('createBlock', () => {
    it('creates block and auto-creates BLOCKING flag', async () => {
      mockCreate.mockResolvedValueOnce({ id: 'block-001' } as any)
      ;(prisma.crmFlag.create as jest.Mock).mockResolvedValueOnce({ id: 'flag-001' } as any)

      const result = await createBlock({
        participantId: 'part-001',
        providerId: 'prov-001',
        blockAllLines: true,
        blockedLineItems: [],
        reason: 'Billing irregularities',
      }, 'user-001')

      expect(mockCreate).toHaveBeenCalled()
      expect(prisma.crmFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: 'BLOCKING' }),
        })
      )
    })
  })

  describe('getActiveBlock', () => {
    it('returns null when no active block exists', async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      const result = await getActiveBlock('part-001', 'prov-001')
      expect(result).toBeNull()
    })

    it('returns active block when one exists', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 'block-001', blockAllLines: true } as any)
      const result = await getActiveBlock('part-001', 'prov-001')
      expect(result).not.toBeNull()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/crm/provider-participant-blocks.test.ts --no-coverage`
Expected: FAIL

**Step 3: Implement the module**

Create `src/lib/modules/crm/provider-participant-blocks.ts`:

```typescript
/**
 * Provider-Participant Block module.
 * Blocks a specific provider from billing a specific participant.
 * Auto-creates a BLOCKING CrmFlag when a block is created.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

export interface CreateBlockInput {
  participantId: string
  providerId: string
  blockAllLines: boolean
  blockedLineItems: string[]
  reason: string
}

export async function createBlock(input: CreateBlockInput, userId: string) {
  const block = await prisma.providerParticipantBlock.create({
    data: {
      participantId: input.participantId,
      providerId: input.providerId,
      blockAllLines: input.blockAllLines,
      blockedLineItems: input.blockedLineItems,
      reason: input.reason,
      createdById: userId,
    },
  })

  // Auto-create BLOCKING flag
  await prisma.crmFlag.create({
    data: {
      severity: 'BLOCKING',
      reason: `Provider blocked: ${input.reason}`,
      participantId: input.participantId,
      createdById: userId,
    },
  })

  await createAuditLog({
    action: 'PROVIDER_PARTICIPANT_BLOCKED',
    resourceType: 'ProviderParticipantBlock',
    resourceId: block.id,
    userId,
    details: { participantId: input.participantId, providerId: input.providerId },
  })

  return block
}

export async function getActiveBlock(participantId: string, providerId: string) {
  return prisma.providerParticipantBlock.findFirst({
    where: {
      participantId,
      providerId,
      resolvedAt: null,
    },
  })
}

export async function resolveBlock(blockId: string, userId: string, note: string) {
  return prisma.providerParticipantBlock.update({
    where: { id: blockId },
    data: {
      resolvedAt: new Date(),
      resolvedById: userId,
      resolveNote: note,
    },
  })
}

/**
 * Check if an invoice should be blocked based on provider-participant blocks.
 * Used by validation check #12.
 */
export async function checkProviderBlocked(
  participantId: string,
  providerId: string,
  lineItemCodes: string[]
): Promise<{ blocked: boolean; reason?: string }> {
  const block = await getActiveBlock(participantId, providerId)
  if (!block) return { blocked: false }

  if (block.blockAllLines) {
    return { blocked: true, reason: block.reason }
  }

  // Check if any invoice line items are in the blocked list
  const blockedItems = lineItemCodes.filter((code) => block.blockedLineItems.includes(code))
  if (blockedItems.length > 0) {
    return {
      blocked: true,
      reason: `${block.reason} (blocked items: ${blockedItems.join(', ')})`,
    }
  }

  return { blocked: false }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/crm/provider-participant-blocks.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/crm/provider-participant-blocks.ts src/lib/modules/crm/provider-participant-blocks.test.ts
git commit -m "feat: add provider-participant block module"
```

---

### Task 2.2: Approved supports module (Holly's feature)

**Files:**
- Test: `src/lib/modules/crm/approved-supports.test.ts` (create)
- Create: `src/lib/modules/crm/approved-supports.ts`

**Step 1: Write the failing test**

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    participantApprovedSupport: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { checkSupportApproved, updateApprovedSupports } from './approved-supports'

const mockFindUnique = prisma.participantApprovedSupport.findUnique as jest.MockedFunction<
  typeof prisma.participantApprovedSupport.findUnique
>

describe('checkSupportApproved', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns approved when no rule exists for category (default = all allowed)', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({ approved: true })
  })

  it('returns approved when category is not in restricted mode', async () => {
    mockFindUnique.mockResolvedValueOnce({ restrictedMode: false } as any)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({ approved: true })
  })

  it('returns approved when item is in allowed list', async () => {
    mockFindUnique.mockResolvedValueOnce({
      restrictedMode: true,
      allowedItemCodes: ['01_001_0101_1_1', '01_002_0102_1_1'],
    } as any)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({ approved: true })
  })

  it('returns not approved when item is NOT in allowed list', async () => {
    mockFindUnique.mockResolvedValueOnce({
      restrictedMode: true,
      allowedItemCodes: ['01_002_0102_1_1'],
    } as any)
    const result = await checkSupportApproved('part-001', '01', '01_001_0101_1_1')
    expect(result).toEqual({
      approved: false,
      reason: 'Support item 01_001_0101_1_1 is not in the approved list for category 01',
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/crm/approved-supports.test.ts --no-coverage`
Expected: FAIL

**Step 3: Implement the module**

Create `src/lib/modules/crm/approved-supports.ts`:

```typescript
/**
 * Approved Supports module (Holly's feature).
 * Per-participant, per-category controls for which support items are allowed.
 * Default mode = everything allowed. Restricted mode = only ticked items pass.
 */

import { prisma } from '@/lib/db'

export async function checkSupportApproved(
  participantId: string,
  categoryCode: string,
  supportItemCode: string
): Promise<{ approved: boolean; reason?: string }> {
  const rule = await prisma.participantApprovedSupport.findUnique({
    where: { participantId_categoryCode: { participantId, categoryCode } },
  })

  // No rule = default = all allowed
  if (!rule) return { approved: true }

  // Not restricted = all allowed
  if (!rule.restrictedMode) return { approved: true }

  // Restricted: check allowed list
  if (rule.allowedItemCodes.includes(supportItemCode)) {
    return { approved: true }
  }

  return {
    approved: false,
    reason: `Support item ${supportItemCode} is not in the approved list for category ${categoryCode}`,
  }
}

export async function updateApprovedSupports(
  participantId: string,
  categoryCode: string,
  restrictedMode: boolean,
  allowedItemCodes: string[],
  userId: string
) {
  return prisma.participantApprovedSupport.upsert({
    where: { participantId_categoryCode: { participantId, categoryCode } },
    create: {
      participantId,
      categoryCode,
      restrictedMode,
      allowedItemCodes,
      createdById: userId,
    },
    update: {
      restrictedMode,
      allowedItemCodes,
    },
  })
}

export async function getApprovedSupports(participantId: string) {
  return prisma.participantApprovedSupport.findMany({
    where: { participantId },
    orderBy: { categoryCode: 'asc' },
  })
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/crm/approved-supports.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/crm/approved-supports.ts src/lib/modules/crm/approved-supports.test.ts
git commit -m "feat: add approved supports module (Holly's feature)"
```

---

### Task 2.3: Add validation checks #12 and #13

**Files:**
- Modify: `src/lib/modules/invoices/invoice-validation.ts`

**Step 1: Add imports at top of file**

```typescript
import { checkProviderBlocked } from '@/lib/modules/crm/provider-participant-blocks'
import { checkSupportApproved } from '@/lib/modules/crm/approved-supports'
```

**Step 2: Add Check #12 after Check 7 (~line 218)**

```typescript
  // -- Check 12: Provider-Participant Block -----------------------------------
  if (invoice.participantId && invoice.providerId) {
    const lineItemCodes = invoice.lines.map((l: any) => l.supportItemCode).filter(Boolean)
    const blockResult = await checkProviderBlocked(
      invoice.participantId,
      invoice.providerId,
      lineItemCodes
    )
    if (blockResult.blocked) {
      errors.push({
        code: 'PROVIDER_PARTICIPANT_BLOCKED',
        message: `Provider is blocked for this participant: ${blockResult.reason}`,
      })
    }
  }
```

**Step 3: Add Check #13 after Check 12**

```typescript
  // -- Check 13: Approved Supports (Holly's feature) --------------------------
  for (const line of invoice.lines) {
    if (!line.categoryCode || !line.supportItemCode) continue
    const supportResult = await checkSupportApproved(
      invoice.participantId,
      line.categoryCode,
      line.supportItemCode
    )
    if (!supportResult.approved) {
      errors.push({
        code: 'SUPPORT_NOT_APPROVED',
        message: supportResult.reason ?? `Support item ${line.supportItemCode} not approved`,
        lineId: line.id,
      })
    }
  }
```

**Step 4: Update the file header comment to list 13 checks**

Change the comment header to include:
```
 *  12. PROVIDER_PARTICIPANT_BLOCKED -- provider blocked for this participant (error)
 *  13. SUPPORT_NOT_APPROVED         -- support item not in participant's approved list (error)
```

**Step 5: Run tests**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/invoices/ --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/modules/invoices/invoice-validation.ts
git commit -m "feat: add validation checks #12 (provider blocked) and #13 (support not approved)"
```

---

## Wave 3 — Theme C Backend: Claims & PRODA (PR #4)

Depends on: Wave 0 (schema), Wave 1 (rejection sources)

### Task 3.1: Bulk claim CSV export

**Files:**
- Test: `src/lib/modules/claims/bulk-csv-export.test.ts` (create)
- Create: `src/lib/modules/claims/bulk-csv-export.ts`

**Step 1: Write the failing test**

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    clmBatch: { findUnique: jest.fn() },
    orgSettings: { findFirst: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { generateBulkClaimCSV } from './bulk-csv-export'

const mockBatchFind = prisma.clmBatch.findUnique as jest.MockedFunction<typeof prisma.clmBatch.findUnique>
const mockSettingsFind = (prisma as any).orgSettings?.findFirst ?? jest.fn()

describe('generateBulkClaimCSV', () => {
  beforeEach(() => jest.clearAllMocks())

  it('generates 16-column NDIS format CSV', async () => {
    mockBatchFind.mockResolvedValueOnce({
      id: 'batch-001',
      claims: [{
        id: 'clm-001',
        claimReference: 'CLM-20260228-0001',
        claimType: 'STANDARD',
        invoice: {
          participantApprovalStatus: 'APPROVED',
          participant: { ndisNumber: '430000001' },
          provider: { abn: '12345678901' },
        },
        lines: [{
          supportItemCode: '01_001_0101_1_1',
          serviceDate: new Date('2026-02-15'),
          quantity: 2,
          unitPriceCents: 5000,
          gstCents: 0,
        }],
      }],
    } as any)

    const csv = await generateBulkClaimCSV('batch-001', '4050000001')
    const lines = csv.split('\n')

    // Header row
    expect(lines[0]).toContain('RegistrationNumber')
    expect(lines[0].split(',').length).toBe(16)

    // Data row
    expect(lines[1]).toContain('4050000001') // Registration number
    expect(lines[1]).toContain('430000001')  // NDIS number
    expect(lines[1]).toContain('2026/02/15') // Date format YYYY/MM/DD
  })

  it('excludes MANUAL_ENQUIRY claims', async () => {
    mockBatchFind.mockResolvedValueOnce({
      id: 'batch-001',
      claims: [
        { claimType: 'STANDARD', claimReference: 'CLM-001', invoice: { participant: { ndisNumber: '43' }, provider: { abn: '12' }, participantApprovalStatus: 'APPROVED' }, lines: [{ supportItemCode: 'x', serviceDate: new Date(), quantity: 1, unitPriceCents: 100, gstCents: 0 }] },
        { claimType: 'MANUAL_ENQUIRY', claimReference: 'CLM-002', invoice: { participant: { ndisNumber: '44' }, provider: { abn: '13' }, participantApprovalStatus: 'APPROVED' }, lines: [{ supportItemCode: 'y', serviceDate: new Date(), quantity: 1, unitPriceCents: 200, gstCents: 0 }] },
      ],
    } as any)

    const csv = await generateBulkClaimCSV('batch-001', '4050000001')
    const lines = csv.split('\n').filter((l) => l.trim())
    expect(lines.length).toBe(2) // header + 1 data row (manual enquiry excluded)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/claims/bulk-csv-export.test.ts --no-coverage`
Expected: FAIL

**Step 3: Implement bulk CSV export**

Create `src/lib/modules/claims/bulk-csv-export.ts`:

```typescript
/**
 * Bulk Claim CSV Export — NDIS 16-column format for PRODA upload.
 *
 * Constraints:
 *   - Filename ≤ 20 chars
 *   - Max 5000 rows
 *   - Date format: YYYY/MM/DD
 *   - Quantity format: NNN.NN
 *   - Hours format: HHH:MM (if unit=hour)
 */

import { prisma } from '@/lib/db'

const CSV_HEADERS = [
  'RegistrationNumber',
  'NDISNumber',
  'SupportsDeliveredFrom',
  'SupportsDeliveredTo',
  'SupportNumber',
  'ClaimReference',
  'Quantity',
  'Hours',
  'UnitPrice',
  'GSTCode',
  'AuthorisedBy',
  'ParticipantApproved',
  'InKindFundingProgram',
  'ClaimType',
  'CancellationReason',
  'ABN of Support Provider',
] as const

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

function formatQuantity(qty: number): string {
  return qty.toFixed(2)
}

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2)
}

function gstCode(gstCents: number): string {
  if (gstCents === 0) return 'P1' // GST-free
  return 'P2' // GST inclusive
}

export async function generateBulkClaimCSV(
  batchId: string,
  registrationNumber: string
): Promise<string> {
  const batch = await prisma.clmBatch.findUnique({
    where: { id: batchId },
    include: {
      claims: {
        include: {
          invoice: {
            include: {
              participant: { select: { ndisNumber: true } },
              provider: { select: { abn: true } },
            },
          },
          lines: true,
        },
      },
    },
  })

  if (!batch) throw new Error('Batch not found')

  const rows: string[] = [CSV_HEADERS.join(',')]

  for (const claim of batch.claims) {
    // Skip manual enquiry claims
    if (claim.claimType === 'MANUAL_ENQUIRY') continue

    const ndisNumber = claim.invoice?.participant?.ndisNumber ?? ''
    const providerAbn = claim.invoice?.provider?.abn ?? ''
    const participantApproved = claim.invoice?.participantApprovalStatus === 'APPROVED' ? 'Y' : 'N'

    for (const line of claim.lines) {
      const row = [
        registrationNumber,
        ndisNumber,
        formatDate(new Date(line.serviceDate)),
        formatDate(new Date(line.serviceDate)),
        line.supportItemCode,
        claim.claimReference,
        formatQuantity(Number(line.quantity)),
        '', // Hours — derived if unit=hour (TODO: lookup unit type)
        centsToPrice(line.unitPriceCents),
        gstCode(line.gstCents),
        '', // AuthorisedBy (empty for plan managed)
        participantApproved,
        '', // InKindFundingProgram
        '1', // ClaimType (1 = standard)
        '', // CancellationReason
        providerAbn,
      ]
      rows.push(row.join(','))
    }
  }

  if (rows.length > 5001) {
    throw new Error('CSV exceeds maximum 5000 data rows')
  }

  return rows.join('\n')
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/claims/bulk-csv-export.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/claims/bulk-csv-export.ts src/lib/modules/claims/bulk-csv-export.test.ts
git commit -m "feat: add NDIS bulk claim CSV export (16-column format)"
```

---

### Task 3.2: PRODA remittance CSV import

**Files:**
- Test: `src/lib/modules/claims/proda-remittance-import.test.ts` (create)
- Create: `src/lib/modules/claims/proda-remittance-import.ts`

**Step 1: Write the failing test**

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    clmClaim: { findUnique: jest.fn(), update: jest.fn() },
    clmClaimLine: { updateMany: jest.fn() },
    invInvoice: { update: jest.fn() },
  },
}))

jest.mock('@/lib/modules/core/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db'
import { importProdaRemittance } from './proda-remittance-import'

const mockClaimFind = prisma.clmClaim.findUnique as jest.MockedFunction<typeof prisma.clmClaim.findUnique>
const mockClaimUpdate = prisma.clmClaim.update as jest.MockedFunction<typeof prisma.clmClaim.update>

describe('importProdaRemittance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('parses CSV and updates claim statuses', async () => {
    const csv = `ClaimReference,Status,ApprovedAmount,RejectionReason
CLM-20260228-0001,Paid,100.00,
CLM-20260228-0002,Rejected,0.00,Duplicate claim`

    mockClaimFind
      .mockResolvedValueOnce({ id: 'clm-001', invoiceId: 'inv-001', status: 'SUBMITTED' } as any)
      .mockResolvedValueOnce({ id: 'clm-002', invoiceId: 'inv-002', status: 'SUBMITTED' } as any)
    mockClaimUpdate.mockResolvedValue({} as any)

    const result = await importProdaRemittance(csv, 'user-001')

    expect(result.approved).toBe(1)
    expect(result.rejected).toBe(1)
    expect(result.unmatched).toBe(0)
  })

  it('sets NDIA_REJECTED on invoice when claim rejected', async () => {
    const csv = `ClaimReference,Status,ApprovedAmount,RejectionReason
CLM-20260228-0001,Rejected,0.00,Insufficient funding`

    mockClaimFind.mockResolvedValueOnce({ id: 'clm-001', invoiceId: 'inv-001', status: 'SUBMITTED' } as any)
    mockClaimUpdate.mockResolvedValue({} as any)
    ;(prisma.invInvoice.update as jest.Mock).mockResolvedValue({} as any)

    await importProdaRemittance(csv, 'user-001')

    expect(prisma.invInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rejectionSource: 'NDIA_REJECTED' }),
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/claims/proda-remittance-import.test.ts --no-coverage`
Expected: FAIL

**Step 3: Implement PRODA remittance import**

Create `src/lib/modules/claims/proda-remittance-import.ts`:

```typescript
/**
 * PRODA Remittance CSV Import.
 * Parses NDIA remittance results and updates claim + invoice statuses.
 */

import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/modules/core/audit'

interface RemittanceRow {
  claimReference: string
  status: string
  approvedAmount: string
  rejectionReason: string
}

interface ImportResult {
  approved: number
  rejected: number
  partial: number
  unmatched: number
  details: Array<{ claimReference: string; status: string; matched: boolean }>
}

function parseCSV(csv: string): RemittanceRow[] {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim())
  const refIdx = headers.indexOf('ClaimReference')
  const statusIdx = headers.indexOf('Status')
  const amountIdx = headers.indexOf('ApprovedAmount')
  const reasonIdx = headers.indexOf('RejectionReason')

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    return {
      claimReference: cols[refIdx] ?? '',
      status: cols[statusIdx] ?? '',
      approvedAmount: cols[amountIdx] ?? '0',
      rejectionReason: cols[reasonIdx] ?? '',
    }
  })
}

export async function importProdaRemittance(
  csvContent: string,
  userId: string
): Promise<ImportResult> {
  const rows = parseCSV(csvContent)
  const result: ImportResult = { approved: 0, rejected: 0, partial: 0, unmatched: 0, details: [] }

  for (const row of rows) {
    if (!row.claimReference) continue

    const claim = await prisma.clmClaim.findUnique({
      where: { claimReference: row.claimReference },
    })

    if (!claim) {
      result.unmatched++
      result.details.push({ claimReference: row.claimReference, status: row.status, matched: false })
      continue
    }

    const normalizedStatus = row.status.toLowerCase()
    let claimStatus: string

    if (normalizedStatus === 'paid' || normalizedStatus === 'approved') {
      claimStatus = 'APPROVED'
      result.approved++
    } else if (normalizedStatus === 'rejected') {
      claimStatus = 'REJECTED'
      result.rejected++
    } else {
      claimStatus = 'PARTIAL'
      result.partial++
    }

    const approvedCents = Math.round(parseFloat(row.approvedAmount) * 100)

    await prisma.clmClaim.update({
      where: { id: claim.id },
      data: {
        status: claimStatus as any,
        approvedCents,
        outcomeAt: new Date(),
        outcomeNotes: row.rejectionReason || null,
      },
    })

    // If NDIA rejected → set rejectionSource on invoice
    if (claimStatus === 'REJECTED' && claim.invoiceId) {
      await prisma.invInvoice.update({
        where: { id: claim.invoiceId },
        data: { rejectionSource: 'NDIA_REJECTED' },
      })
    }

    await createAuditLog({
      action: 'PRODA_REMITTANCE_IMPORTED',
      resourceType: 'ClmClaim',
      resourceId: claim.id,
      userId,
      details: { status: claimStatus, approvedCents },
    })

    result.details.push({ claimReference: row.claimReference, status: claimStatus, matched: true })
  }

  return result
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/claims/proda-remittance-import.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/modules/claims/proda-remittance-import.ts src/lib/modules/claims/proda-remittance-import.test.ts
git commit -m "feat: add PRODA remittance CSV import with NDIA rejection tracking"
```

---

### Task 3.3: Manual enquiry claim creation

**Files:**
- Modify: `src/lib/modules/claims/claims.ts`

**Step 1: Add manual enquiry creation function**

Add to `claims.ts` after the existing `createClaimFromInvoice` function:

```typescript
/**
 * Create a manual enquiry claim for PRODA.
 * Used when INSUFFICIENT_BUDGET blocks automatic claims.
 * NOT included in bulk CSV exports.
 */
export async function createManualEnquiryClaim(
  invoiceId: string,
  userId: string,
  note: string
) {
  const invoice = await prisma.invInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true, participant: true },
  })
  if (!invoice) throw new Error('Invoice not found')

  const reference = await nextClaimReference()

  const claim = await prisma.clmClaim.create({
    data: {
      claimReference: reference,
      invoiceId,
      participantId: invoice.participantId,
      claimedCents: invoice.totalCents,
      status: 'PENDING',
      claimType: 'MANUAL_ENQUIRY',
      manualEnquiryNote: note,
      lines: {
        create: invoice.lines.map((line: any) => ({
          invoiceLineId: line.id,
          sourceInvoiceId: invoiceId,
          supportItemCode: line.supportItemCode,
          categoryCode: line.categoryCode,
          serviceDate: line.serviceDate,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
          gstCents: line.gstCents,
        })),
      },
    },
  })

  await createAuditLog({
    action: 'MANUAL_ENQUIRY_CLAIM_CREATED',
    resourceType: 'ClmClaim',
    resourceId: claim.id,
    userId,
    details: { invoiceId, note },
  })

  return claim
}
```

**Step 2: Run claims tests**

Run: `cd /Users/Spud/Lotus_PM && npx jest src/lib/modules/claims/ --no-coverage`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/modules/claims/claims.ts
git commit -m "feat: add manual enquiry claim creation for no-budget PRODA scenarios"
```

---

## Wave 4 — Theme D Backend: Email & Correspondence (PR #5)

Depends on: Wave 0 (schema)

### Task 4.1: Update send-email API to accept entity linking IDs

**Files:**
- Modify: `src/app/api/crm/correspondence/send-email/route.ts`

**Step 1: Update Zod schema to include new optional fields**

Add to `sendEmailSchema` (after `coordinatorId`):
```typescript
  invoiceId: z.string().optional(),
  documentId: z.string().optional(),
  planId: z.string().optional(),
  serviceAgreementId: z.string().optional(),
```

**Step 2: Update the POST handler**

In the correspondence creation block, add the new fields to the `create` data:
```typescript
  invoiceId: input.invoiceId,
  documentId: input.documentId,
  planId: input.planId,
  saId: input.serviceAgreementId,
```

**Step 3: Verify build**

Run: `cd /Users/Spud/Lotus_PM && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds (or check for type errors)

**Step 4: Commit**

```bash
git add src/app/api/crm/correspondence/send-email/route.ts
git commit -m "feat: accept entity linking IDs in send-email API"
```

---

### Task 4.2: Update EmailComposeModal with new props

**Files:**
- Modify: `src/components/email/EmailComposeModal.tsx`

**Step 1: Extend props interface**

Replace the existing `EmailComposeModalProps` with:
```typescript
interface EmailComposeModalProps {
  open: boolean
  onClose: () => void
  onSent: () => void
  recipientEmail?: string
  recipientName?: string
  participantId?: string
  providerId?: string
  coordinatorId?: string
  // New pre-fill props
  subject?: string
  body?: string
  bodyHtml?: string
  // New entity linking props
  invoiceId?: string
  documentId?: string
  planId?: string
  serviceAgreementId?: string
}
```

**Step 2: Pre-fill subject and body from props**

In the component's state initialization, use props as defaults:
```typescript
const [subjectValue, setSubjectValue] = useState(subject ?? '')
const [bodyValue, setBodyValue] = useState(body ?? '')
```

And add a `useEffect` to update when props change:
```typescript
useEffect(() => {
  if (subject) setSubjectValue(subject)
  if (body) setBodyValue(body)
}, [subject, body])
```

**Step 3: Pass entity IDs in send handler**

In the `handleSend` function, add to the POST body:
```typescript
invoiceId,
documentId,
planId,
serviceAgreementId,
```

**Step 4: Verify the component renders**

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 5: Commit**

```bash
git add src/components/email/EmailComposeModal.tsx
git commit -m "feat: add subject/body pre-fill and entity linking to EmailComposeModal"
```

---

### Task 4.3: Create useContextEmail hook

**Files:**
- Create: `src/hooks/useContextEmail.ts`

**Step 1: Create the hook**

```typescript
/**
 * Hook for opening pre-filled email compose from any component.
 * Used by ContextActionMenu to trigger emails with entity context.
 */

'use client'

import { useState, useCallback } from 'react'

export interface ContextEmailState {
  open: boolean
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

const initialState: ContextEmailState = { open: false }

export function useContextEmail() {
  const [emailState, setEmailState] = useState<ContextEmailState>(initialState)

  const openEmail = useCallback((params: Omit<ContextEmailState, 'open'>) => {
    setEmailState({ ...params, open: true })
  }, [])

  const closeEmail = useCallback(() => {
    setEmailState(initialState)
  }, [])

  return { emailState, openEmail, closeEmail }
}

// ── Email template helpers ──────────────────────────────────────────────────

export function invoiceToProviderEmail(invoice: {
  invoiceNumber: string
  totalCents: number
  status: string
  participant?: { firstName: string; lastName: string }
  provider?: { name: string; email?: string }
}) {
  return {
    recipientEmail: invoice.provider?.email,
    recipientName: invoice.provider?.name,
    subject: `Re: Invoice ${invoice.invoiceNumber}`,
    body: `Hi ${invoice.provider?.name ?? 'Provider'},\n\nRegarding Invoice ${invoice.invoiceNumber} for ${invoice.participant?.firstName ?? ''} ${invoice.participant?.lastName ?? ''} ($${(invoice.totalCents / 100).toFixed(2)}).\n\nCurrent status: ${invoice.status}\n\n`,
  }
}

export function invoiceToParticipantEmail(invoice: {
  invoiceNumber: string
  totalCents: number
  status: string
  provider?: { name: string }
  participant?: { firstName: string; lastName: string; email?: string }
}) {
  return {
    recipientEmail: invoice.participant?.email,
    recipientName: invoice.participant ? `${invoice.participant.firstName} ${invoice.participant.lastName}` : undefined,
    subject: `Invoice Update — ${invoice.provider?.name ?? 'Provider'}`,
    body: `Hi ${invoice.participant?.firstName ?? ''},\n\nThis is regarding Invoice ${invoice.invoiceNumber} from ${invoice.provider?.name ?? 'your provider'} ($${(invoice.totalCents / 100).toFixed(2)}).\n\nCurrent status: ${invoice.status}\n\n`,
  }
}

export function planToParticipantEmail(plan: {
  startDate: string
  endDate: string
  status: string
  participant?: { firstName: string; lastName: string; email?: string }
}) {
  return {
    recipientEmail: plan.participant?.email,
    recipientName: plan.participant ? `${plan.participant.firstName} ${plan.participant.lastName}` : undefined,
    subject: `Plan Update — ${plan.startDate} to ${plan.endDate}`,
    body: `Hi ${plan.participant?.firstName ?? ''},\n\nThis is regarding your NDIS plan for the period ${plan.startDate} to ${plan.endDate}.\n\nCurrent status: ${plan.status}\n\n`,
  }
}

export function saToProviderEmail(sa: {
  agreementRef: string
  provider?: { name: string; email?: string }
  participant?: { firstName: string; lastName: string }
}) {
  return {
    recipientEmail: sa.provider?.email,
    recipientName: sa.provider?.name,
    subject: `Service Agreement — ${sa.participant?.firstName ?? ''} ${sa.participant?.lastName ?? ''}`,
    body: `Hi ${sa.provider?.name ?? 'Provider'},\n\nRegarding Service Agreement ${sa.agreementRef} for ${sa.participant?.firstName ?? ''} ${sa.participant?.lastName ?? ''}.\n\n`,
  }
}

export function claimToProviderEmail(claim: {
  claimReference: string
  status: string
  claimedCents: number
  provider?: { name: string; email?: string }
}) {
  return {
    recipientEmail: claim.provider?.email,
    recipientName: claim.provider?.name,
    subject: `Claim Status — ${claim.claimReference}`,
    body: `Hi ${claim.provider?.name ?? 'Provider'},\n\nRegarding claim ${claim.claimReference} ($${(claim.claimedCents / 100).toFixed(2)}).\n\nCurrent NDIA status: ${claim.status}\n\n`,
  }
}
```

**Step 2: Verify types compile**

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit --pretty 2>&1 | head -10`

**Step 3: Commit**

```bash
git add src/hooks/useContextEmail.ts
git commit -m "feat: create useContextEmail hook with email template helpers"
```

---

## Wave 5 — Theme D UI: Contextual Action Menus (PR #6)

Depends on: Wave 4 (email hook)

### Task 5.1: Create ContextActionMenu component

**Files:**
- Create: `src/components/shared/ContextActionMenu.tsx`

**Step 1: Create the component**

```typescript
/**
 * Reusable contextual action menu.
 * 3-dot dropdown trigger + optional right-click context menu.
 * Used across all list and detail pages.
 */

'use client'

import { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Mail, ExternalLink, Plus, Flag } from 'lucide-react'

export interface ActionItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive'
}

export interface ActionGroup {
  label: string
  items: ActionItem[]
}

interface ContextActionMenuProps {
  groups: ActionGroup[]
  /** Wrap children in right-click context menu */
  children?: ReactNode
  /** Show 3-dot dropdown button (default: true) */
  showDropdown?: boolean
}

function renderMenuItems(groups: ActionGroup[], ItemComponent: typeof DropdownMenuItem | typeof ContextMenuItem, SepComponent: typeof DropdownMenuSeparator | typeof ContextMenuSeparator, LabelComponent: typeof DropdownMenuLabel | typeof ContextMenuLabel) {
  return groups.map((group, gi) => (
    <div key={gi}>
      {gi > 0 && <SepComponent />}
      <LabelComponent className="text-xs text-muted-foreground">{group.label}</LabelComponent>
      {group.items.map((item, ii) => (
        <ItemComponent
          key={ii}
          onClick={item.onClick}
          className={item.variant === 'destructive' ? 'text-destructive' : ''}
        >
          {item.icon && <span className="mr-2">{item.icon}</span>}
          {item.label}
        </ItemComponent>
      ))}
    </div>
  ))
}

export function ContextActionMenu({ groups, children, showDropdown = true }: ContextActionMenuProps) {
  const dropdownMenu = showDropdown ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {renderMenuItems(groups, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel)}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  if (!children) return dropdownMenu

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {renderMenuItems(groups, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel)}
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ── Convenience builders ────────────────────────────────────────────────────

export function emailAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <Mail className="h-4 w-4" />, onClick }
}

export function navigateAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <ExternalLink className="h-4 w-4" />, onClick }
}

export function createAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <Plus className="h-4 w-4" />, onClick }
}

export function flagAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <Flag className="h-4 w-4" />, onClick }
}
```

**Step 2: Verify types compile**

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit --pretty 2>&1 | head -10`

**Step 3: Commit**

```bash
git add src/components/shared/ContextActionMenu.tsx
git commit -m "feat: create ContextActionMenu shared component"
```

---

### Task 5.2: Add ContextActionMenu to invoice list page

**Files:**
- Modify: `src/app/(invoices)/invoices/page.tsx`

This is the first page integration. The pattern established here will be replicated on all other list pages.

**Step 1: Read the current invoice list page**

Read `src/app/(invoices)/invoices/page.tsx` to understand the table row structure.

**Step 2: Import ContextActionMenu and useContextEmail**

Add at top:
```typescript
import { ContextActionMenu, emailAction, navigateAction, flagAction } from '@/components/shared/ContextActionMenu'
import { useContextEmail, invoiceToProviderEmail, invoiceToParticipantEmail } from '@/hooks/useContextEmail'
import EmailComposeModal from '@/components/email/EmailComposeModal'
```

**Step 3: Add email state and modal**

In the component body:
```typescript
const { emailState, openEmail, closeEmail } = useContextEmail()
```

At the end of the JSX, before the closing wrapper:
```typescript
<EmailComposeModal
  open={emailState.open}
  onClose={closeEmail}
  onSent={() => { closeEmail(); /* optionally refresh */ }}
  recipientEmail={emailState.recipientEmail}
  recipientName={emailState.recipientName}
  subject={emailState.subject}
  body={emailState.body}
  participantId={emailState.participantId}
  providerId={emailState.providerId}
  invoiceId={emailState.invoiceId}
/>
```

**Step 4: Add actions column to table**

In the table columns definition, add a new column at the end:
```typescript
{
  id: 'actions',
  header: '',
  cell: ({ row }) => {
    const inv = row.original
    return (
      <ContextActionMenu
        groups={[
          {
            label: 'Email',
            items: [
              emailAction('Email Provider', () => openEmail({
                ...invoiceToProviderEmail(inv),
                invoiceId: inv.id,
                participantId: inv.participantId,
                providerId: inv.providerId,
              })),
              emailAction('Email Participant', () => openEmail({
                ...invoiceToParticipantEmail(inv),
                invoiceId: inv.id,
                participantId: inv.participantId,
              })),
            ],
          },
          {
            label: 'Navigate',
            items: [
              navigateAction('View Participant', () => router.push(`/participants/${inv.participantId}`)),
              navigateAction('View Provider', () => router.push(`/providers/${inv.providerId}`)),
            ],
          },
        ]}
      />
    )
  },
}
```

**Step 5: Verify it compiles**

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 6: Commit**

```bash
git add src/app/(invoices)/invoices/page.tsx
git commit -m "feat: add contextual action menu to invoice list page"
```

---

### Task 5.3–5.12: Add ContextActionMenu to remaining list pages

Repeat the pattern from Task 5.2 for each page. Each is a separate commit:

| Task | Page | File | Actions |
|------|------|------|---------|
| 5.3 | Participant List | `src/app/(crm)/participants/page.tsx` | Email Participant, View Plans/Invoices, Create Plan/SA/Flag |
| 5.4 | Provider List | `src/app/(crm)/providers/page.tsx` | Email Provider, View Invoices/SAs, Create Flag |
| 5.5 | Plan List | `src/app/(plans)/plans/page.tsx` | Email Participant about plan, View Participant/Budget, Create SA |
| 5.6 | SA List | `src/app/(service-agreements)/service-agreements/page.tsx` | Email Participant/Provider, View Participant/Provider, Create Flag |
| 5.7 | Document List | `src/app/(documents)/documents/page.tsx` | Email Document to Participant/Provider, View linked entities |
| 5.8 | Claims List | `src/app/(claims)/claims/page.tsx` | Email Provider about status, View Invoice, Create Flag |
| 5.9 | Claims Batches | `src/app/(claims)/claims/batches/page.tsx` | Email Provider payment advice, View Invoices |
| 5.10 | Coordinator List | `src/app/(crm)/coordinators/page.tsx` | Email Coordinator, View Participants, Link Participant |
| 5.11 | Invoice Review | `src/app/(invoices)/invoices/review/[id]/page.tsx` | "Email About This" dropdown, Create Flag/New Version |
| 5.12 | Provider Detail | `src/app/(crm)/providers/[id]/page.tsx` | Email Provider about invoice, View Invoice/Participant |

For each page:
1. Import `ContextActionMenu`, `useContextEmail`, relevant email helpers, `EmailComposeModal`
2. Add `useContextEmail()` hook
3. Add actions column or action button
4. Add `EmailComposeModal` at end of JSX
5. Verify compilation: `npx tsc --noEmit`
6. Commit: `git commit -m "feat: add contextual actions to [page name]"`

---

## Wave 6 — Theme D UI: Plans & Agreements Tab + Participant Detail (PR #7)

Depends on: Wave 0 (schema), Wave 4 (email), Wave 5 (context menus)

### Task 6.1: Create Plans & Agreements tab component

**Files:**
- Create: `src/app/(crm)/participants/[id]/plans-agreements-tab.tsx`

**Step 1: Create the component**

This is a large component — create it with the tree structure from the design:
- Active Plan Card with budget summary
- Nested SA cards under each plan
- Inline documents with PdfViewer
- Contextual actions on every card

Key data queries:
- Plans: fetch via `/api/plans?participantId=X`
- SAs linked to plan: fetch via plan's budget allocations → SA IDs
- Documents: fetch via `/api/documents?planId=X` and `/api/documents?serviceAgreementId=Y`

```typescript
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, Plus, FileText, Mail, ExternalLink } from 'lucide-react'
import { formatAUD, formatDateAU } from '@/lib/utils/format'
import { ContextActionMenu, emailAction, navigateAction, createAction } from '@/components/shared/ContextActionMenu'
import { useContextEmail, planToParticipantEmail, saToProviderEmail } from '@/hooks/useContextEmail'
import EmailComposeModal from '@/components/email/EmailComposeModal'
import PdfViewer from '@/components/shared/PdfViewer'

interface PlansAgreementsTabProps {
  participantId: string
  participant: { firstName: string; lastName: string; email?: string }
}

// Data types matching API responses
interface Plan { id: string; startDate: string; endDate: string; status: string; budgetLines: BudgetLine[] }
interface BudgetLine { id: string; categoryCode: string; categoryName: string; totalCents: number; spentCents: number; committedCents: number }
interface ServiceAgreement { id: string; agreementRef: string; status: string; startDate: string; endDate: string; provider?: { id: string; name: string; email?: string }; rateLines: any[] }
interface Document { id: string; name: string; category: string; s3Key: string; serviceAgreementId?: string; planId?: string }

export default function PlansAgreementsTab({ participantId, participant }: PlansAgreementsTabProps) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [sasByPlan, setSasByPlan] = useState<Record<string, ServiceAgreement[]>>({})
  const [docsByEntity, setDocsByEntity] = useState<Record<string, Document[]>>({})
  const [loading, setLoading] = useState(true)
  const [viewingDoc, setViewingDoc] = useState<string | null>(null)
  const { emailState, openEmail, closeEmail } = useContextEmail()

  useEffect(() => {
    loadData()
  }, [participantId])

  async function loadData() {
    setLoading(true)
    try {
      // Load plans
      const plansRes = await fetch(`/api/plans?participantId=${participantId}`)
      const plansData = await plansRes.json()
      setPlans(plansData.data ?? [])

      // Load SAs
      const sasRes = await fetch(`/api/service-agreements?participantId=${participantId}`)
      const sasData = await sasRes.json()
      // Group SAs by plan (via budget allocations — simplified: group by first matching plan)
      const grouped: Record<string, ServiceAgreement[]> = {}
      for (const sa of sasData.data ?? []) {
        const planId = sa.budgetAllocations?.[0]?.budgetLine?.planId ?? 'unlinked'
        if (!grouped[planId]) grouped[planId] = []
        grouped[planId].push(sa)
      }
      setSasByPlan(grouped)

      // Load documents
      const docsRes = await fetch(`/api/documents?participantId=${participantId}`)
      const docsData = await docsRes.json()
      const docMap: Record<string, Document[]> = {}
      for (const doc of docsData.data ?? []) {
        if (doc.planId) {
          const key = `plan-${doc.planId}`
          if (!docMap[key]) docMap[key] = []
          docMap[key].push(doc)
        }
        if (doc.serviceAgreementId) {
          const key = `sa-${doc.serviceAgreementId}`
          if (!docMap[key]) docMap[key] = []
          docMap[key].push(doc)
        }
      }
      setDocsByEntity(docMap)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading plans...</div>

  const activePlans = plans.filter((p) => p.status === 'ACTIVE')
  const otherPlans = plans.filter((p) => p.status !== 'ACTIVE')

  return (
    <div className="space-y-6">
      {activePlans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          participant={participant}
          sas={sasByPlan[plan.id] ?? []}
          docs={docsByEntity}
          onEmail={openEmail}
          onViewDoc={setViewingDoc}
        />
      ))}

      {otherPlans.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span>Expired / Draft Plans ({otherPlans.length})</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2 opacity-60">
            {otherPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                participant={participant}
                sas={sasByPlan[plan.id] ?? []}
                docs={docsByEntity}
                onEmail={openEmail}
                onViewDoc={setViewingDoc}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Button variant="outline" asChild>
        <Link href={`/plans/new?participantId=${participantId}`}>
          <Plus className="mr-2 h-4 w-4" /> Create Plan
        </Link>
      </Button>

      {viewingDoc && (
        <PdfViewer documentId={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}

      <EmailComposeModal
        open={emailState.open}
        onClose={closeEmail}
        onSent={closeEmail}
        {...emailState}
      />
    </div>
  )
}

// Internal subcomponents (PlanCard, SACard) omitted for plan brevity —
// follow the tree structure from the design doc exactly.
// Each card has: header with badges, budget bars, nested SAs, docs, and ContextActionMenu.
```

Note: The full component will be ~300 lines. Implement PlanCard and SACard as internal components following the tree structure from the design document.

**Step 2: Verify compilation**

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/(crm)/participants/[id]/plans-agreements-tab.tsx
git commit -m "feat: create Plans & Agreements unified tab component"
```

---

### Task 6.2: Update participant detail tabs

**Files:**
- Modify: `src/app/(crm)/participants/[id]/page.tsx`

**Step 1: Import new tab components**

Add imports:
```typescript
import PlansAgreementsTab from './plans-agreements-tab'
```

**Step 2: Update tab array**

Replace the existing tabs array/structure with the new 7-tab layout:
1. Overview
2. Plans & Agreements (NEW — render `<PlansAgreementsTab>`)
3. Invoices
4. Correspondence
5. Approved Supports (NEW — placeholder, implement in Wave 6.3)
6. Approval Rules (renamed from "Approval")
7. Flags

**Step 3: Verify compilation**

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/(crm)/participants/[id]/page.tsx
git commit -m "feat: restructure participant detail to 7 tabs with Plans & Agreements"
```

---

### Task 6.3: Approved Supports tab UI

**Files:**
- Modify: `src/app/(crm)/participants/[id]/page.tsx` (add tab content)

**Step 1: Create Approved Supports tab content**

Inline in the participant detail page (or extract to separate file if >200 lines):

- Category accordion (15 NDIS categories from price guide)
- Each category: toggle "Default (all allowed)" ↔ "Restricted"
- When restricted: checkboxes for each support item
- Load items from `/api/price-guide/items?categoryCode=XX`
- Save via POST `/api/crm/approved-supports`

**Step 2: Create API routes**

- Create `src/app/api/crm/approved-supports/route.ts` (GET list, POST upsert)

**Step 3: Verify compilation and commit**

```bash
git commit -m "feat: add Approved Supports tab with category toggle and item checkboxes"
```

---

### Task 6.4: Approval Rules tab UI

**Files:**
- Modify: `src/app/(crm)/participants/[id]/page.tsx`

**Step 1: Replace old "Approval" tab with "Approval Rules"**

- List existing `ParticipantApprovalRule` records
- Toggle per-provider: "Require Approval" on/off
- Default rule toggle (applies to all providers without specific rule)
- Create API routes for CRUD on approval rules

**Step 2: Create API routes**

- Create `src/app/api/crm/approval-rules/route.ts`

**Step 3: Commit**

```bash
git commit -m "feat: add Approval Rules tab with per-provider toggles"
```

---

### Task 6.5: Approval timer display

**Files:**
- Modify: `src/app/(invoices)/invoices/review/[id]/page.tsx`
- Modify: `src/app/(invoices)/invoices/page.tsx`

**Step 1: Create ApprovalTimer component**

```typescript
function ApprovalTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('')
  const [color, setColor] = useState('text-green-600')

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const exp = new Date(expiresAt).getTime()
      const diff = exp - now

      if (diff <= 0) {
        setRemaining('Expired — returned to review')
        setColor('text-red-600')
        clearInterval(interval)
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      setRemaining(`Expires in ${hours}h ${mins}m`)

      if (hours < 6) setColor('text-red-600')
      else if (hours < 24) setColor('text-amber-600')
      else setColor('text-green-600')
    }, 60000) // Update every minute

    // Run immediately
    const now = Date.now()
    const exp = new Date(expiresAt).getTime()
    const diff = exp - now
    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      setRemaining(`Expires in ${hours}h ${mins}m`)
      if (hours < 6) setColor('text-red-600')
      else if (hours < 24) setColor('text-amber-600')
    } else {
      setRemaining('Expired — returned to review')
      setColor('text-red-600')
    }

    return () => clearInterval(interval)
  }, [expiresAt])

  return <span className={`text-sm font-medium ${color}`}>{remaining}</span>
}
```

**Step 2: Add to invoice review page when status = PENDING_PARTICIPANT_APPROVAL**

**Step 3: Add timer column to invoice list**

**Step 4: Commit**

```bash
git commit -m "feat: add approval countdown timer to invoice review and list"
```

---

### Task 6.6: Rejection source badges

**Files:**
- Modify: `src/app/(invoices)/invoices/review/[id]/page.tsx`
- Modify: `src/app/(invoices)/invoices/page.tsx`

**Step 1: Create RejectionSourceBadge component**

```typescript
function RejectionSourceBadge({ source }: { source: string }) {
  const config = {
    PM_REJECTED: { label: 'Rejected by PM', variant: 'destructive' as const },
    PARTICIPANT_DECLINED: { label: 'Declined by Participant', variant: 'secondary' as const },
    NDIA_REJECTED: { label: 'NDIA Rejected', variant: 'destructive' as const },
  }
  const c = config[source as keyof typeof config]
  if (!c) return null
  return <Badge variant={c.variant}>{c.label}</Badge>
}
```

**Step 2: Display on invoice review page and list page**

**Step 3: Add rejection source filter to invoice list**

**Step 4: Commit**

```bash
git commit -m "feat: add rejection source badges and filter to invoices"
```

---

### Task 6.7: Invoice version history display

**Files:**
- Modify: `src/app/(invoices)/invoices/review/[id]/page.tsx`

**Step 1: Query version chain**

When loading invoice, also load `supersedes` and `supersededBy` relations.

**Step 2: Display version history**

Show version badge (e.g., "v2") and link to previous version if exists.

**Step 3: Add "Create New Version" button**

Button visible when invoice is in PENDING_REVIEW or REJECTED status. Calls the `createNewVersion` API.

**Step 4: Commit**

```bash
git commit -m "feat: add invoice version history display and Create New Version button"
```

---

### Task 6.8: Re-request approval UI

**Files:**
- Modify: `src/app/(invoices)/invoices/review/[id]/page.tsx`

**Step 1: Add re-request button when status = PENDING_REVIEW and has previous approval**

Show "Re-request Approval" button with a textarea for clarification note.

**Step 2: Wire to reRequestApproval API**

**Step 3: Commit**

```bash
git commit -m "feat: add re-request approval button with clarification note"
```

---

### Task 6.9: Bulk CSV export UI on claims page

**Files:**
- Modify: `src/app/(claims)/claims/batches/page.tsx`
- Create: `src/app/api/claims/batches/[id]/export-csv/route.ts`

**Step 1: Create API route for CSV download**

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // Call generateBulkClaimCSV
  // Return CSV with correct headers
  const csv = await generateBulkClaimCSV(id, registrationNumber)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="claims.csv"`,
    },
  })
}
```

**Step 2: Add "Generate Bulk File" button on batch row**

**Step 3: Commit**

```bash
git commit -m "feat: add bulk CSV export button and API route for claims batches"
```

---

### Task 6.10: PRODA remittance import UI

**Files:**
- Modify: `src/app/(claims)/claims/page.tsx` or `batches/page.tsx`
- Create: `src/app/api/claims/import-remittance/route.ts`

**Step 1: Create API route for CSV upload**

**Step 2: Add "Import PRODA Results" button with file upload**

**Step 3: Show preview of matches before confirming**

**Step 4: Commit**

```bash
git commit -m "feat: add PRODA remittance CSV import UI with preview"
```

---

### Task 6.11: Manual enquiry UI

**Files:**
- Modify: `src/app/(invoices)/invoices/review/[id]/page.tsx`
- Create: `src/app/api/claims/manual-enquiry/route.ts`

**Step 1: Add "Lodge Manual Enquiry" button when INSUFFICIENT_BUDGET validation error**

**Step 2: Dialog with note input, calls createManualEnquiryClaim API**

**Step 3: Claims list shows "Manual Enquiry" badge**

**Step 4: Commit**

```bash
git commit -m "feat: add manual enquiry claim creation from invoice review"
```

---

### Task 6.12: Link Participant to SC

**Files:**
- Modify: `src/app/(crm)/coordinators/[id]/page.tsx`

**Step 1: Add "Link Participant" button in header**

**Step 2: ParticipantCombobox search by name / NDIS number**

**Step 3: Create assignment via API**

**Step 4: Contextual actions on each participant row (email, view, unlink)**

**Step 5: Commit**

```bash
git commit -m "feat: add Link Participant to coordinator detail page"
```

---

### Task 6.13: Provider-participant block UI

**Files:**
- Modify: `src/app/(crm)/participants/[id]/page.tsx`
- Modify: `src/app/(crm)/providers/[id]/page.tsx`
- Create: `src/app/api/crm/provider-participant-blocks/route.ts`

**Step 1: Create API routes for CRUD**

**Step 2: Add "Blocked Providers" section to participant detail**

**Step 3: Add "Blocked Participants" section to provider detail**

**Step 4: Commit**

```bash
git commit -m "feat: add provider-participant block UI on participant and provider pages"
```

---

## Wave 7 — Final: Run All Tests + Type Check (PR merge validation)

### Task 7.1: Full test suite

Run: `cd /Users/Spud/Lotus_PM && npx jest --no-coverage`
Expected: All tests pass

### Task 7.2: Type check

Run: `cd /Users/Spud/Lotus_PM && npx tsc --noEmit`
Expected: No errors

### Task 7.3: Build

Run: `cd /Users/Spud/Lotus_PM && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

---

## PR/Wave Summary

| Wave | PR | Theme | Key Deliverables | Depends On |
|------|-----|-------|------------------|------------|
| 0 | #1 | All | Schema migration: 3 new models, 2 enums, modified models | — |
| 1 | #2 | A | Per-provider approval rules, rejection sources, versioning, re-request | Wave 0 |
| 2 | #3 | B | Provider-participant blocks, approved supports, validation checks 12+13 | Wave 0 |
| 3 | #4 | C | Bulk CSV export, PRODA remittance import, manual enquiry | Wave 0, 1 |
| 4 | #5 | D | Email API entity linking, EmailComposeModal enhancements, useContextEmail | Wave 0 |
| 5 | #6 | D | ContextActionMenu on all 14 pages | Wave 4 |
| 6 | #7 | D | Plans & Agreements tab, Approved Supports UI, Approval Rules UI, all remaining UI | Wave 0–5 |

**Waves 1–4 can run in parallel** (independent backend themes).
**Wave 5 depends on Wave 4** (needs email hook).
**Wave 6 depends on all prior waves** (UI integrates everything).
