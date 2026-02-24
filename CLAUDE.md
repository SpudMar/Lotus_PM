# Lotus PM — Claude Code Persistent Memory

**READ THIS FIRST IN EVERY SESSION.**

Locked decisions, requirements, and current state for Lotus PM.
For coding conventions, patterns, depth control, and what-not-to-do: read `docs/AGENT_BRIEF.md`.

---

## PROJECT OVERVIEW

**Name:** Lotus PM | **Type:** NDIS Plan Management System
**Repository:** `lotus-pm` (private GitHub) | **Branch convention:** `claude/<session-id>`
**Production:** `https://planmanager.lotusassist.com.au` | **Staging:** `https://staging.planmanager.lotusassist.com.au`

---

## LOCKED REQUIREMENTS — DO NOT CHANGE WITHOUT FORMAL REVIEW

| ID | Requirement | Category |
|----|------------|----------|
| REQ-001 | Cloud: AWS Sydney (ap-southeast-2) ONLY | Infrastructure |
| REQ-002 | Single-tenant now, architected for multi-tenant later | Architecture |
| REQ-003 | Phased migration from Entiprius (pilot first, then full cutover) | Transition |
| REQ-004 | Solo/very small dev team — architecture must be simple and maintainable | Constraint |
| REQ-005 | Developer skill level: limited/learning — simplest viable stack | Constraint |
| REQ-006 | Current scale: 500–2,000 active participants | Scale |
| REQ-007 | Invoice volume: 2,000–10,000 per month — AI processing is critical | Scale |
| REQ-008 | Primary bank: CBA (Commonwealth Bank) | Integration |
| REQ-009 | PRODA/PACE B2B OAuth2/JWT auth. App runs fully in **Portal Mode** now. B2B is future automation, not prerequisite. | Integration |
| REQ-010 | Data retention: 7 years incidents, 5 years payments/invoices | Compliance |
| REQ-011 | Australian data sovereignty — ALL data stays in Australia (AWS ap-southeast-2) | Compliance |
| REQ-012 | WCAG 2.1 AA minimum for participant-facing app | Accessibility |
| REQ-013 | Modular architecture — modules deployable/updatable independently | Architecture |
| REQ-014 | NDIS Price Guide 2025–26 compliance (22+ PACE support categories) | Compliance |
| REQ-015 | Must process invoices within 5 business days (NDIS requirement) | Compliance |
| REQ-016 | Encryption at rest and in transit for ALL data | Security |
| REQ-017 | Role-Based Access Control (RBAC) with full audit logging | Security |
| REQ-018 | Separate participant-facing mobile app (simple, accessible) | Product |
| REQ-019 | Xero integration required (primary accounting system) | Integration |
| REQ-020 | Family-owned business — staff must assist in transition and testing | Organisational |
| REQ-021 | Developer works 60+ hrs/wk — development is after-hours | Constraint |
| REQ-022 | Current Entiprius cost: $5,000/month ($60,000/year) | Financial |
| REQ-023 | Xero accounting integration (two-way sync: invoices, payments, reconciliation) | Integration |
| REQ-024 | Invoices arrive via shared email inbox | Workflow |
| REQ-025 | Roles: Global Admin, Plan Manager, Assistant, Support Coordinator, Participant | Security |
| REQ-026 | PRODA/PACE B2B API access — application submitted 20 Feb 2026, awaiting response. Not blocking. | Integration |
| REQ-027 | When B2B is available, use PACE B2B APIs — NOT legacy myNDIS APIs | Integration |
| REQ-028 | ABA files for payments now; keep payment logic provider-agnostic for future API (e.g. Monoova) | Architecture |

---

## TECH STACK — LOCKED

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 14+ (App Router)** | Full-stack. Frontend + API in one codebase. |
| Language | **TypeScript (strict mode)** | `strict: true`, `noUncheckedIndexedAccess: true`. No `any`. |
| Database | **PostgreSQL via AWS RDS** | ACID for financial data. |
| ORM | **Prisma** | Type-safe. Migration management. |
| Auth | **NextAuth.js + AWS Cognito** | Managed auth. RBAC. MFA. |
| Invoice AI | **AWS Textract** | ap-southeast-2. NDIS-specific post-processing. |
| File Storage | **AWS S3** | Server-side encryption mandatory. |
| Email | **AWS SES** | Send + receive invoice emails. |
| App Hosting | **AWS ECS Fargate** | Managed containers. |
| Participant App | **React Native (Expo)** | Cross-platform iOS/Android. |
| Events | **AWS EventBridge** | Custom bus: `lotus-pm-events`. Module decoupling. |
| Accounting | **Xero API** | Two-way sync. OAuth2 built. |
| UI Components | **shadcn/ui + Tailwind CSS** | Accessible, customisable. |
| Validation | **Zod** | Schema validation everywhere. |
| IaC | **AWS CDK (TypeScript)** | All infra as code. Never manual console. |
| CI/CD | **GitHub Actions** | Block merge if any check fails. |

---

## RBAC — ROLE DEFINITIONS

| Role | DB Value | Access |
|------|----------|--------|
| Global Admin | `GLOBAL_ADMIN` | Everything PM can do + `staff:read`/`staff:write`. Only exclusive perms are staff management. |
| Plan Manager | `PLAN_MANAGER` | **Primary daily user.** Full operational access to ALL features. NEVER gate operational tasks behind Global Admin. |
| Assistant | `ASSISTANT` | Data entry. View flagged items + add comments. Cannot approve flagged items. |
| Support Coordinator | `SUPPORT_COORDINATOR` | External. Read-only access to assigned participants only. |
| Participant | `PARTICIPANT` | Own data only, via mobile app. |

---

## MODULE STATUS

| Module | Status | Notes |
|--------|--------|-------|
| Core Platform | ✅ | Auth, RBAC, audit logging |
| CRM | ✅ | Participants, providers, coordinators with detail pages + correspondence |
| Plan Management | ✅ | Plans, budgets, S33 funding periods (with period budget validation), fund quarantining (hard/soft limits), service agreements |
| Invoice Processing | ✅ | Upload, Textract extraction, approval workflow, email ingest |
| Claims & Payments | ✅ | Portal Mode — manual submit + outcome recording. Bulk monthly claim generation, cancel claims with budget reversal |
| Banking | ✅ | ABA file generation, reconciliation, payment hold/release. **PR #37** — batch lifecycle. **PR #48** — ON_HOLD status |
| Reporting | ✅ | Dashboard, financial, NDIS compliance, budget utilisation |
| Notifications | ✅ | In-app + ClickSend SMS live. Bell badge, unread count. |
| Automation Engine | ✅ | Rules, event triggers, cron runner (`POST /api/automation/cron`, CRON_SECRET auth) |
| Xero Integration | ✅ | OAuth2 flow, invoice→bill sync, settings page |
| NDIS Price Guide | ✅ | **PR #34** — `NdisPriceGuideVersion` + `NdisSupportItem`, XLSX importer (`xlsx` pkg), `validateLineItemPrice()`, `PricingRegion` on participant, Settings UI (Price Guide tab) |
| Flag/Hold System | ✅ | **PR #35** — `CrmFlag` (ADVISORY/BLOCKING), `createFlag()`/`resolveFlag()`/`getActiveFlags()`, banners + Flags tab on participant page, invoice approval gate |
| Invoice Validation | ✅ | **PR #36 + #48** — `validateInvoiceForApproval()` (11 checks inc. TOTAL_MISMATCH + PERIOD_BUDGET_EXCEEDED), wired into `approveInvoice()` with `force?` override |
| SA Budget Allocation | ✅ | **WS-F6** — SaBudgetAllocation (partial allocs, internal tracking only — PACE deprecated SBs) |
| Pattern Learning | ✅ | **WS-F4** — InvItemPattern model; suggest support codes from history |
| AI Invoice Automation | ✅ | **PRs #42-46** — 4 waves: processing engine, email ingest, Textract pipeline, per-line payments |
| Provider Notifications | ✅ | **PR #46** — PM-initiated email notifications (auto-reject, needs-codes, custom, remittance) |
| Billing (PM Fees) | ✅ | **PR #48** — PmFeeSchedule, PmFeeOverride, PmFeeCharge; monthly auto-generation + claiming |
| Statements | ✅ | **PR #48** — ParticipantStatement; email + SMS (DOB-gated) + print/mail export; bulk generation |
| Global Search | ✅ | **PR #48** — Command palette; participants, providers, invoices search |
| Onboarding Queue | ✅ | **PR #48** — WordPress webhook DRAFT participant activation page |
| Provider Portal | ✅ | **PRs #49-53** — Onboarding, dashboard, invoices, payments, profile, magic-link auth, premium redesign |
| Analytics Data Infra | ✅ | **PR #51** — InvStatusHistory, phase timing, hold categorisation, disability categories |
| Analytics Dashboard | ✅ | **PR #55** — Recharts dashboard (5th tab on /reports), 4 KPI cards, 5 charts, phase timing, hold categories |
| Data Retention | ✅ | **PR #56** — REQ-010 purge mechanism, audit log (7yr), financial (5yr), data retention settings UI |
| Documents UI | ✅ | **PR #54** — Upload (presigned S3), download, delete, category badges, participant linking, pagination |
| Participant API | ✅ | **PR #57-58** — Expo scaffold, NDIS+DOB auth, JWT scoping, /plans /invoices /profile endpoints |
| EventBridge Wiring | ✅ | **PR #59** — 5 missing event emissions wired (invoices.received, budget-alert, emails.sent), naming fixes |

---

## CURRENT STATE

- **1051/1051 tests** (64 suites) | **36 migrations** | Last merged: PR #61
- All CareSquare Tier 1 + Tier 2 gaps cleared — Lotus PM matches/exceeds CareSquare on all operational workflows
- Provider Portal complete (PRs #49-53) — magic-link auth, premium redesign, full provider self-service
- Analytics data infrastructure complete (PR #51) — status history tracking instrumented across all 9 transitions
- Dev server: `node node_modules/.bin/next dev` (Turbopack — do NOT use `--webpack`)
- Staff SMS test numbers: `+61411941699` (director@ and pm@)
- `CRON_SECRET` needed in `.env.local` + GitHub Actions secrets to activate cron
- RBAC: 50 permissions total (Global Admin: all 50, Plan Manager: 47, Assistant: subset)

**Staging (ap-southeast-2) — LIVE, CD auto-deploys on merge to main:**
- CloudFront: `d2iv01jt8w4gxn.cloudfront.net`
- ALB: `lotus-pm-staging-489597421.ap-southeast-2.elb.amazonaws.com`
- RDS: `lotus-pm-staging.cbsk4oomy587.ap-southeast-2.rds.amazonaws.com`
- ECS running real app — healthy on staging

---

## OPEN DECISION POINTS

| ID | Decision | Trigger | Notes |
|----|----------|---------|-------|
| DEC-001 | ~~Sentry data residency~~ | **CLOSED** — CloudWatch only, Sentry never installed | REQ-011. |
| DEC-002 | ~~Payment provider API~~ | **CLOSED** — ABA files indefinitely | REQ-028. Keep agnostic. |
| DEC-003 | S33/PACE funding periods | **RESOLVED** 22 Feb 2026 — S33/PACE only. Periods irregular (monthly, quarterly, etc). Plans up to 5 years. | Implemented in `funding-periods.ts`. |

---

## KEY FILES — QUICK REFERENCE

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project memory — read first every session |
| `docs/AGENT_BRIEF.md` | Coding conventions, patterns, depth control — cloud agents read this |
| `prisma/schema.prisma` | Full DB schema, all module tables |
| `src/lib/auth/config.ts` | NextAuth config with RBAC |
| `src/middleware.ts` | Route protection |
| `src/lib/db/client.ts` | Prisma client singleton |
| `src/lib/shared/currency.ts` | Financial amount utilities (cents, never floats) |
| `src/lib/events/types.ts` | EventBridge event type definitions |
| `src/lib/modules/automation/engine.ts` | Automation rule evaluator and executor |
| `src/app/api/automation/cron/route.ts` | Cron runner — CRON_SECRET auth |
| `src/lib/modules/billing/fee-generation.ts` | PM fee auto-billing — monthly charge generation |
| `src/lib/modules/statements/statement-generation.ts` | Participant financial statement generation |
| `src/lib/modules/invoices/invoice-validation.ts` | 11-check invoice validation engine |
| `src/lib/modules/plans/funding-periods.ts` | S33/PACE funding period management + budget queries |
| `.github/workflows/cron.yml` | GH Actions schedule — POSTs to staging every 5 min |
| `.github/workflows/ci.yml` | CI pipeline (lint, type-check, test, build) |
| `infrastructure/lib/config.ts` | CDK environment configs |

---

## AGENT GOTCHAS (learned from Wave 1)

- **Schema not persisted**: Agents run `prisma migrate dev` (generates SQL) but often don't save
  the changes back to `schema.prisma`. Always verify `schema.prisma` has the new models before merging — if missing, add from the migration SQL and run `prisma generate`.
- **Shared local repo**: Two parallel agents in the same repo dir cross-contaminate working trees. One agent's uncommitted files leak into the other's commit. At merge time: check each PR's schema diff carefully, resolve conflicts manually, re-run `prisma generate` to validate.
- **Enum sync**: Agents add enum values in migration SQL but not in `schema.prisma` enum definitions. Prisma generate succeeds but TypeScript rejects the string literals. Always verify both migration AND schema enum match.
- **Linter interference**: ESLint auto-fix causes Write tool "File modified since read". Write to `/tmp/` then `cp` in.
- **Prisma Json fields**: Cast with `as unknown as Prisma.InputJsonValue`.
- **Model field names**: `CrmProvider.name` (not `businessName`), `PlanStatus.ACTIVE`, `BnkPaymentStatus.CLEARED` (not COMPLETED), `ParticipantOnboardingStatus.COMPLETE` (not ACTIVE). Always check schema before field access.

---

## CDK GOTCHAS (learned from staging deploy)

- Description/roleName strings must be **ASCII only** — em-dashes cause IAM/CloudFormation errors
- RDS instance class in config.ts must be `'t3'` not `'db.t3'` (CDK adds `db.` prefix internally)
- AWS free tier blocks RDS entirely — account must exit free tier first
- RDS secret keys from CDK: `host`, `port`, `username`, `password`, `dbname` (not `dbUrl`)
- Scaffold: use nginx on port 80; disable circuit breaker; no secrets for placeholder container

---

## USEFUL COMMANDS

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"  # ALWAYS first — nvm default (24) sets omit=dev

# Dev
docker compose up -d && node node_modules/.bin/next dev

# DB
npx prisma migrate deploy && npx prisma generate
DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate  # no live DB

# Test + type-check
npm test
npx tsc --noEmit

# gh CLI (use /opt/homebrew/bin/gh)
export PATH="/opt/homebrew/bin:$PATH"
gh pr list && gh pr merge <N> --repo SpudMar/Lotus_PM --merge --delete-branch
gh run view <id> --log-failed
```

---

*Last updated: 25 February 2026 — 1051/1051 tests, 36 migrations, 64 suites. PRs #34–61 merged. All major features + comprehensive seed data complete. Next: PACE B2B when PRODA approved.*
*All decisions in this file were made deliberately. Update with care.*
