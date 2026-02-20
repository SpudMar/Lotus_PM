# Lotus PM — Claude Code Persistent Memory

**READ THIS FIRST IN EVERY SESSION.**

This file contains all locked decisions, requirements, and conventions for the Lotus PM project. Do not make decisions that contradict anything here without explicit user confirmation and updating this file.

---

## PROJECT OVERVIEW

**Name:** Lotus PM
**Type:** NDIS Plan Management System
**Business:** Family-owned Plan Management business (Australia)
**Status:** Phase 0 — AI Development Infrastructure Setup
**Repository:** `lotus-pm` (private GitHub)
**Branch Convention:** `claude/<session-id>` for agent branches, `feat/<module>` for feature branches
**Production URL:** `https://planmanager.lotusassist.com.au`
**Staging URL:** `https://staging.planmanager.lotusassist.com.au`

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
| REQ-009 | Must integrate with PRODA (B2B OAuth2/JWT auth) | Integration |
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
| REQ-025 | Roles: Director (full + occasional PM), Plan Managers, Assistants (multi-role) | Security |
| REQ-026 | PRODA/PACE B2B API access — application in progress (Nicole, 20 Feb 2026) | Integration |
| REQ-027 | Target PACE B2B APIs (current system) — NOT legacy myNDIS APIs | Integration |

---

## TECH STACK — LOCKED

Every decision below is locked. Do not suggest alternatives without a clear reason.

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 14+ (App Router)** | Full-stack. Frontend + API in one codebase. |
| Language | **TypeScript (strict mode)** | `strict: true`, `noUncheckedIndexedAccess: true`. No `any` types. |
| Database | **PostgreSQL via AWS RDS** | ACID compliance for financial data. Managed. |
| ORM | **Prisma** | Type-safe. Auto-generates types. Migration management. |
| Auth | **NextAuth.js + AWS Cognito** | Managed auth. RBAC. MFA. |
| Invoice AI | **AWS Textract + custom extraction logic** | In ap-southeast-2. NDIS-specific post-processing. |
| File Storage | **AWS S3** | Invoices, documents. Server-side encryption mandatory. |
| Email | **AWS SES** | Send notifications. Receive invoice emails. |
| App Hosting | **AWS ECS Fargate** | Managed containers. No servers to maintain. |
| Participant App | **React Native (Expo)** | Cross-platform iOS/Android. Shares React knowledge. |
| Events | **AWS EventBridge** | Custom bus: `lotus-pm-events`. Module decoupling. |
| Queues | **AWS SQS** | Invoice processing queue, notification queue. |
| Cache | **Redis (AWS ElastiCache)** | Sessions, rate limiting, frequently accessed data. |
| Accounting | **Xero API** | Two-way sync. Invoices, payments, reconciliation. |
| CDN | **AWS CloudFront** | Fast page loads. SSL termination. |
| Monitoring | **AWS CloudWatch + Sentry** | CloudWatch for AWS metrics. Sentry for app errors. Sentry US region OK for dev/staging (no real client data). See OPEN DECISION POINTS for production/sandpit action. |
| IaC | **AWS CDK (TypeScript)** | All infrastructure defined as code. Never manual console changes. |
| CI/CD | **GitHub Actions** | Run on every PR. Block merge if any check fails. |
| UI Components | **shadcn/ui + Tailwind CSS** | Accessible, customisable components. |
| Validation | **Zod** | Schema validation everywhere. No raw input processing. |

---

## RBAC — ROLE DEFINITIONS

| Role | Access Level | Notes |
|------|-------------|-------|
| **Director** | Full system access | Can act as PM. Sees all financials. Manages staff. System config. |
| **Plan Manager** | Full PM access | Manage participants, invoices, claims, plans, comms. Cannot manage staff or system settings. |
| **Assistant** | Limited access | View participants, log comms, basic data entry, upload invoices. Cannot approve claims or modify plans. |
| **Participant** | Own data only | Via mobile app. Budget, invoice status, messages, documents. |

---

## MODULE PRIORITY ORDER

### Priority 1 (MVP — Phase 1)
1. **Core Platform** — auth, users, RBAC, audit logging
2. **CRM** — participants, providers, communication log
3. **Plan Management** — plans, budgets, categories, spending tracking
4. **Invoice Processing** — upload, extraction, validation, approval workflow

### Priority 2 (Phase 2)
5. **Claims & Payments** — PRODA integration, bulk claiming, status tracking
6. **Banking** — ABA file generation (CBA format), bank reconciliation
7. **Reporting** — dashboards, financial reports, NDIS compliance reports
8. **Notifications** — email (SES), in-app, SMS (SNS)

### Priority 3 (Phase 3–4)
9. **Automation Engine** — rules, triggers, scheduled tasks
10. **Documents** — templates, forms, file management
11. **Participant App** — React Native, WCAG 2.1 AA, accessible design

---

## PROJECT STRUCTURE

```
lotus-pm/
├── CLAUDE.md                    ← YOU ARE HERE
├── prisma/
│   └── schema.prisma            # All tables, module-prefixed
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Login, register, MFA
│   │   ├── (dashboard)/         # Main PM dashboard
│   │   ├── (crm)/               # CRM pages
│   │   ├── (plans)/             # Plan management
│   │   ├── (invoices)/          # Invoice processing
│   │   ├── (claims)/            # Claims & payments
│   │   ├── (banking)/           # Banking & reconciliation
│   │   ├── (reports)/           # Reporting & analytics
│   │   ├── (settings)/          # System settings
│   │   └── api/                 # API routes (one dir per module)
│   ├── lib/
│   │   ├── modules/             # Business logic (isolated per module)
│   │   │   ├── core/
│   │   │   ├── crm/
│   │   │   ├── plans/
│   │   │   ├── invoices/
│   │   │   ├── claims/
│   │   │   ├── banking/
│   │   │   ├── automation/
│   │   │   ├── reports/
│   │   │   ├── notifications/
│   │   │   └── documents/
│   │   ├── events/              # EventBridge event definitions
│   │   ├── db/                  # Prisma client singleton
│   │   ├── auth/                # Auth utilities, RBAC helpers
│   │   └── shared/              # Date formatting, currency, NDIS utilities
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── layout/              # Navigation, sidebar, page layouts
│   │   └── accessibility/       # WCAG-specific components
│   └── types/                   # TypeScript type definitions
├── participant-app/             # React Native (Expo) — separate codebase
├── infrastructure/              # AWS CDK stacks
├── docs/                        # Documentation
│   ├── BUSINESS_CASE.md
│   └── PHASE_0_EXECUTION_PLAN.md
├── tests/                       # E2E and integration tests
├── scripts/                     # seed.ts, migrate.ts, etc.
├── docker-compose.yml
├── .github/workflows/           # GitHub Actions CI/CD
└── .env.example                 # Template — never commit .env.local
```

---

## CODING CONVENTIONS

### TypeScript
- `strict: true` always
- No `any` types — use `unknown` and type guards if needed
- Explicit return types on all exported functions
- Zod schemas for all external data (API inputs, email payloads, AI extraction results)

### Database
- All queries via Prisma — never raw SQL unless absolutely necessary and documented
- Table names are module-prefixed: `crm_participants`, `inv_invoices`, `plan_budgets`
- All financial amounts stored as integers (cents) — never floats
- Soft deletes only — never hard delete participant, plan, or financial records
- All sensitive data encrypted at application level before storage

### API Routes
- All `/api` routes must validate input with Zod before any processing
- Authentication check at the start of every protected route
- RBAC check after authentication
- Return consistent error format: `{ error: string, code: string }`
- Log all mutations to audit_log table

### Events (EventBridge)
- Modules communicate via events on `lotus-pm-events` bus — never by importing each other's internals
- Event naming: `lotus-pm.<module>.<action>` (e.g., `lotus-pm.invoices.approved`)
- All events must have a schema defined in `src/lib/events/`

### Security
- Never log PII (NDIS numbers, names, addresses) to CloudWatch
- Never store credentials in code or environment files committed to Git
- Use AWS Secrets Manager for all API keys and credentials in production
- Rate limiting on all public-facing API routes

### Testing
- Every module must have unit tests in `src/lib/modules/<module>/*.test.ts`
- Every API route must have at least one passing test
- Business logic (validation, calculations) must have 100% test coverage
- E2E tests for critical workflows: invoice approval, claim submission

---

## ENVIRONMENT VARIABLES

See `.env.example` for the full list. Required for development:
- `DATABASE_URL` — local PostgreSQL
- `NEXTAUTH_URL` — `http://localhost:3000`
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=ap-southeast-2`)

---

## EXTERNAL DEPENDENCIES & THEIR STATUS

| Dependency | Owner | Status | Blocks |
|-----------|-------|--------|--------|
| AWS Account | Done | ✅ Account created 20 Feb 2026 | Nothing — unblocked |
| Sentry Account | Done | ✅ Account created 20 Feb 2026 (US region — see DEC-001) | Nothing — unblocked |
| GitHub setup | Done | ✅ Complete 21 Feb 2026 — main branch, protection rules, 6 labels | Phase 0 CI/CD |
| PRODA/PACE B2B API access | Nicole (business) | Application emailed 20 Feb 2026 — awaiting response | Phase 2 claims module only |
| CBA CommBiz API | TBD | Not started | Phase 2 banking module |
| Xero API credentials | TBD | Existing developer account — retrieve Client ID/Secret from desktop | Phase 2 banking/accounting module |
| Domain name | Done | ✅ `planmanager.lotusassist.com.au` — subdomain on existing domain | Staging deployment |
| Entiprius data export | TBD | Not started | Phase 3 migration |

---

## OPEN DECISION POINTS

Decisions deferred until a specific trigger event. Do not resolve these unilaterally — review with the team at the trigger point.

| ID | Decision | Trigger | Options | Notes |
|----|----------|---------|---------|-------|
| DEC-001 | Sentry data residency for production | Before first real participant data enters staging OR before compliance sandpit testing | (A) Keep Sentry US + implement strict PII scrubbing via `beforeSend` hook — grey area under Privacy Act; (B) Self-host Sentry on ECS Fargate in ap-southeast-2 — fully compliant, higher ops overhead; (C) Drop Sentry, use CloudWatch only — simplest, fully compliant | Dev/coding uses Sentry US freely (no client data). Decision only needed when real data is in play. REQ-011. |

---

## CURRENT PHASE STATUS

**Active Phase:** Phase 0 — AI Development Infrastructure

**Phase 0 Checklist:**
- [x] Prerequisites (AWS, GitHub, Node, Docker, AWS CLI)
- [x] Step 1: GitHub repository setup (branch protection, labels, main branch)
- [ ] Step 2: CLAUDE.md (this file — in progress)
- [ ] Step 3: Claude Code configuration + MCP servers
- [ ] Step 4: Next.js project scaffolding
- [x] Step 5: Local Docker environment (Postgres 16, Redis 7, MailHog — docker compose up -d)
- [ ] Step 6: CI/CD pipeline (GitHub Actions)
- [ ] Step 7: AWS CDK infrastructure (staging)
- [ ] Step 8: Smoke test — health check endpoint end-to-end

See `docs/PHASE_0_EXECUTION_PLAN.md` for full step-by-step instructions.

---

## WHAT NOT TO DO

- **No microservices** — this is a modular monolith. Modules are code-separated, not service-separated.
- **No raw SQL** — use Prisma. If Prisma can't do it, document why before using `$queryRaw`.
- **No floats for money** — always integers (cents). Use utility in `src/lib/shared/currency.ts`.
- **No `any` types** — TypeScript strict mode is non-negotiable.
- **No hardcoded credentials** — not in code, not in commits, not in comments.
- **No manual AWS console changes** — everything goes through CDK. Console is read-only.
- **No pushing directly to `main`** — all changes via PR with passing CI checks.
- **No skipping tests** — if you can't test it, that's a design problem, not a testing problem.
- **No storing data outside AWS ap-southeast-2** — REQ-011, Australian data sovereignty.
- **No legacy myNDIS APIs** — use PACE B2B APIs. REQ-027.

---

## USEFUL COMMANDS

```bash
# Node.js (keg-only — must use full path or source ~/.zshrc first)
# Binary: /opt/homebrew/opt/node@20/bin/node
# PATH fix: export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# If `npm ls typescript` shows (empty), wipe and reinstall:
# rm -rf node_modules package-lock.json && npm install

# Start local development
docker-compose up -d && npm run dev

# Database operations
npm run db:migrate      # Run new migrations
npm run db:studio       # Open Prisma Studio (visual DB editor)
npm run db:seed         # Seed with test data

# Testing
npm run test            # Unit tests
npm run test:watch      # Watch mode
npm run test:e2e        # End-to-end tests (Playwright)

# Type checking
npm run type-check      # TypeScript check without building

# Infrastructure
cd infrastructure && cdk deploy --context environment=staging
cd infrastructure && cdk diff --context environment=staging

# GitHub
gh issue list           # See open issues
gh pr list              # See open PRs
gh pr create            # Create a PR
```

---

*Last updated: 20 February 2026*
*All decisions in this file were made deliberately. Update with care.*
