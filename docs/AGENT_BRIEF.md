# AGENT_BRIEF — How to Work on Lotus PM

**Read CLAUDE.md first** for project decisions and architecture.
**Read this file** for how to write code that passes review.

---

## Your Workflow

1. Read CLAUDE.md (decisions, requirements, RBAC, tech stack)
2. Read this file (coding patterns, conventions, depth control)
3. Understand your task — ask if unclear
4. Read ONLY the files relevant to your task
5. Write code following the patterns below
6. Run full test suite — all existing tests must still pass
7. Commit, push, and create a PR to main

---

## Depth Control — CRITICAL

You will be tempted to read the whole codebase "for context". Don't.

- **Read before you write.** Always read a file before modifying it.
- **Read only what you need.** Don't explore unrelated modules.
- **One module at a time.** Your task is scoped — stay in scope.
- **Ask, don't assume.** If unsure about a pattern, check ONE existing similar module.
- **Prefer search over browsing.** Find the specific file, don't `ls` through directories.

---

## Coding Conventions

### TypeScript
- `strict: true` — no exceptions
- No `any` types — use `unknown` + type guards
- Explicit return types on all exported functions
- Zod schemas for all external data (API inputs, email payloads, extraction results)

### Database (Prisma)
- All queries via Prisma — never raw SQL unless documented why
- Table names module-prefixed: `crm_participants`, `inv_invoices`, `plan_budgets`
- Financial amounts as **integers (cents)** — never floats. Use `src/lib/shared/currency.ts`
- **Soft deletes only** on participant, plan, and financial records
- Sensitive data encrypted at application level before storage

### API Routes
Every `/api` route follows this exact pattern:
```
1. Zod validate input
2. Authentication check
3. RBAC check
4. Business logic (call module function)
5. Audit log mutation
6. Return response — errors as { error: string, code: string }
```

### Module Isolation
- Business logic lives in `src/lib/modules/<module>/`
- Modules **never import from each other** directly
- Inter-module communication via EventBridge: `lotus-pm.<module>.<action>`
- Event schemas defined in `src/lib/events/`
- Shared utilities go in `src/lib/shared/` — not copy-pasted between modules

### Testing
- Unit tests in `src/lib/modules/<module>/*.test.ts`
- Every API route must have at least one test
- Business logic (validation, calculations) needs 100% coverage
- Run `npm test` before every commit — all existing tests must pass

### Security
- Never log PII (NDIS numbers, names, addresses)
- Never store credentials in code or committed files
- Rate limiting on all public-facing API routes

---

## RBAC — Get This Right

| Role | DB Value | Key Rule |
|------|----------|----------|
| Global Admin | `GLOBAL_ADMIN` | Everything PM can do + `staff:read`, `staff:write`. Only exclusive perms are staff management. |
| Plan Manager | `PLAN_MANAGER` | **Primary daily user.** Full operational access to ALL features. NEVER gate operational tasks behind Global Admin. |
| Assistant | `ASSISTANT` | Data entry. Can view flagged items + add comments. CANNOT approve flagged items. |
| Support Coordinator | `SUPPORT_COORDINATOR` | External person. Scoped **read-only** access to assigned participants only. Sees funding, budgets, allocations. Cannot edit. |

---

## Architecture Extensibility — Don't Break These

These abstractions exist for future needs. Preserve them even if they seem over-engineered:

| Abstraction | Future Need | What to Preserve |
|---|---|---|
| Payment provider interface | REQ-028: ABA now → Monoova/API later | Keep payment logic provider-agnostic in `src/lib/modules/banking/` |
| Optional `proda*` fields on claims/plans | PACE B2B API automation | Don't make these required. Don't remove them. |
| EventBridge module decoupling | Independent module deployment | No cross-module imports. Events only. |
| Multi-tenant hooks | REQ-002: single-tenant now → multi-tenant later | Don't hardcode tenant assumptions |
| Service agreement → fund quarantine link | REQ-030: auto-create quarantine from SA | SA model must expose provider + category + rates for downstream use |
| S33 funding period schema | REQ-035: non-standard funding periods | PlanFundingPeriod model supports split periods — don't assume 1 period = 1 plan year |
| Support coordinator scoping | REQ-031: external role with limited access | Use `getParticipantScope()` pattern, not RBAC matrix expansion |

---

## Project Structure (key paths)

```
src/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── (auth|dashboard|crm|plans|invoices|claims|banking|reports|settings)/
│   └── api/                # One directory per module
├── lib/
│   ├── modules/            # Business logic (isolated per module)
│   ├── events/             # EventBridge event definitions
│   ├── db/client.ts        # Prisma client singleton
│   ├── auth/               # Auth utilities, RBAC helpers
│   └── shared/             # Date formatting, currency, NDIS utilities
├── components/
│   ├── ui/                 # shadcn/ui components
│   └── layout/             # Navigation, sidebar, page layouts
└── types/                  # TypeScript type definitions
```

When adding a new module, follow the pattern in any existing module under `src/lib/modules/`.

---

## What NOT to Do

- No microservices — this is a modular monolith
- No raw SQL — use Prisma
- No floats for money — cents (integers) only
- No `any` types
- No hardcoded credentials
- No pushing directly to `main` — PR with passing CI only
- No skipping tests
- No data outside AWS ap-southeast-2
- No legacy myNDIS APIs — use PACE B2B APIs only (REQ-027)
- No cross-module imports — use EventBridge events
- No copy-pasting logic between modules — extract to `src/lib/shared/`
