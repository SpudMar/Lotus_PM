# Lotus PM — Phase 0 Execution Plan
## AI Development Infrastructure Setup

**Purpose:** This document is the step-by-step execution blueprint for Phase 0. Every task is numbered, ordered by dependency, and has a clear "done" definition. Complete these in order.

**Goal:** By the end of Phase 0, multiple AI agents can build, test, and deploy modules in parallel — with you approving decisions, not writing code.

**External Dependency Running in Parallel:** Nicole is applying for PRODA/PACE B2B API access. This does NOT block Phase 0 or Phase 1. It blocks Phase 2. Track separately.

---

## PREREQUISITES (Before You Start)

### P1 — AWS Account
- [ ] Create AWS account (if not already done): [aws.amazon.com](https://aws.amazon.com)
- [ ] Set up billing alerts: AWS Console → Billing → Budgets → Create alert at $200, $300, $400
- [ ] Create IAM admin user (do not use root account for daily use)
- [ ] Enable MFA on root account and IAM admin user
- **Done when:** You can log into AWS Console as an IAM user (not root) and billing alerts are configured

### P2 — GitHub Account
- [ ] GitHub account exists (personal or organisation)
- [ ] GitHub CLI installed locally: [cli.github.com](https://cli.github.com)
- [ ] Run `gh auth login` to authenticate CLI
- **Done when:** `gh auth status` shows authenticated

### P3 — Node.js
- [ ] Install Node.js 20 LTS: [nodejs.org](https://nodejs.org) (choose LTS version)
- [ ] Verify: `node --version` (should show v20.x)
- [ ] Verify: `npm --version` (should show 10.x)
- **Done when:** Both version commands return numbers

### P4 — Docker Desktop
- [ ] Install Docker Desktop: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- [ ] Start Docker Desktop
- [ ] Verify: `docker --version`
- **Done when:** `docker ps` runs without error

### P5 — AWS CLI
- [ ] Install AWS CLI v2: [docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [ ] Run `aws configure` with your IAM user's access key and secret
- [ ] Set region to `ap-southeast-2` (Sydney)
- **Done when:** `aws sts get-caller-identity` returns your account ID

---

## STEP 1 — GitHub Repository

### 1.1 Create Repository
```bash
# Create the private repository
gh repo create lotus-pm --private --description "Lotus PM - NDIS Plan Management System"

# Clone it locally
gh repo clone lotus-pm
cd lotus-pm
```

### 1.2 Create Initial Directory Structure
```bash
# Create all top-level directories
mkdir -p docs src prisma scripts tests .github/workflows .github/ISSUE_TEMPLATE
```

### 1.3 Set Up Branch Protection
In GitHub web interface:
- Settings → Branches → Add branch protection rule
- Branch name pattern: `main`
- Check: "Require a pull request before merging"
- Check: "Require status checks to pass before merging"
- Check: "Require branches to be up to date before merging"
- Save

### 1.4 Create GitHub Labels
```bash
# Run this to create all module labels
gh label create "module:core" --color "0075ca" --description "Core platform module"
gh label create "module:crm" --color "e4e669" --description "CRM module"
gh label create "module:plans" --color "d73a4a" --description "Plan management module"
gh label create "module:invoices" --color "008672" --description "Invoice processing module"
gh label create "module:claims" --color "e99695" --description "Claims & payments module"
gh label create "module:banking" --color "f9d0c4" --description "Banking module"
gh label create "module:automation" --color "c2e0c6" --description "Automation engine module"
gh label create "module:reports" --color "bfd4f2" --description "Reporting module"
gh label create "module:notifications" --color "d4c5f9" --description "Notifications module"
gh label create "module:participant-app" --color "0e8a16" --description "Participant mobile app"
gh label create "priority:p1" --color "b60205" --description "Must have - MVP"
gh label create "priority:p2" --color "e4e669" --description "Should have"
gh label create "priority:p3" --color "c2e0c6" --description "Nice to have"
gh label create "status:blocked" --color "e11d48" --description "Blocked by dependency"
gh label create "status:in-review" --color "7c3aed" --description "Awaiting human review"
```

### 1.5 Create Issue Templates

Create `.github/ISSUE_TEMPLATE/feature.md`:
```markdown
---
name: Feature / Module Task
about: A development task for a specific module
labels: ''
assignees: ''
---

## Module
<!-- Which module does this belong to? -->

## Requirement Reference
<!-- Which REQ-XXX requirement(s) does this implement? -->

## Description
<!-- What needs to be built? Be specific. -->

## Acceptance Criteria
- [ ]
- [ ]
- [ ]

## Technical Notes
<!-- Any specific implementation details or constraints -->

## Dependencies
<!-- Other issues or external things this depends on -->
```

### 1.6 Set Up GitHub Project Board
- GitHub web → Projects → New project → Board template
- Columns: **Backlog → Ready → In Progress → Review → Done**
- Name it: "Lotus PM Development"

**Step 1 Done When:**
- `git remote -v` shows the lotus-pm repository
- Branch protection is active on `main`
- Labels are created (verify in GitHub → Labels)
- Project board exists

---

## STEP 2 — CLAUDE.md (Persistent Memory)

This is the most important file in the entire project. Every Claude Code session starts by reading it. It prevents context loss between sessions.

Create `CLAUDE.md` in the project root with the full content from the requirements specification (see `docs/REQUIREMENTS_SPEC.md` or use the Claude Code agent to generate it from the locked requirements list).

**Minimum required sections:**
1. Project name, purpose, one-line description
2. All LOCKED requirements (REQ-001 through REQ-027+) — complete list
3. Tech stack decisions with justifications
4. RBAC roles (Director, Plan Manager, Assistant, Participant)
5. Module list with priority order (P1, P2, P3)
6. Coding conventions (TypeScript strict mode, no `any` types, etc.)
7. What NOT to do (no microservices, no raw SQL bypassing Prisma, no secrets in code)
8. Current phase and progress tracker
9. Open external dependencies (PRODA API — Nicole)
10. Key contacts / business context

**Step 2 Done When:**
- `CLAUDE.md` exists in project root
- It contains all 27 locked requirements
- Starting a new Claude Code session and asking "what are our locked requirements?" produces the correct list

---

## STEP 3 — Claude Code Configuration

### 3.1 Create Settings File

Create `.claude/settings.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(docker *)",
      "Bash(aws *)",
      "Bash(gh *)",
      "Bash(node *)",
      "Bash(jest *)",
      "Bash(playwright *)",
      "Bash(prisma *)"
    ]
  }
}
```

### 3.2 Configure MCP Servers

Create `.claude/mcp_settings.json` (check current Claude Code docs for exact format):
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-github-token>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://localhost:5432/lotus_pm_dev"
      }
    }
  }
}
```

**Note:** Add `.claude/mcp_settings.json` to `.gitignore` — it contains a GitHub token.

### 3.3 Generate GitHub Personal Access Token
- GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
- Repository access: `lotus-pm` only
- Permissions: Issues (read/write), Pull requests (read/write), Contents (read/write), Metadata (read)
- Copy token → add to `.claude/mcp_settings.json`

### 3.4 Set Up Session Start Hook
Use the `session-start-hook` skill in Claude Code to configure the startup hook for this project. This ensures tests and linters are available at the start of every session.

**Step 3 Done When:**
- `.claude/settings.json` exists
- MCP GitHub server is configured
- Starting a Claude Code session and asking "list open GitHub issues" retrieves them directly

---

## STEP 4 — Project Scaffolding

### 4.1 Create Next.js App
```bash
cd /path/to/lotus-pm

# Scaffold Next.js with TypeScript, Tailwind, App Router
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git  # git is already initialised
```

### 4.2 Install Core Dependencies
```bash
# Database
npm install prisma @prisma/client

# Auth
npm install next-auth @auth/prisma-adapter

# UI Components
npx shadcn@latest init
# Choose: Default style, Slate base colour, CSS variables: yes

# Validation
npm install zod

# AWS SDK
npm install @aws-sdk/client-s3 @aws-sdk/client-textract @aws-sdk/client-ses \
  @aws-sdk/client-sqs @aws-sdk/client-eventbridge

# Utilities
npm install date-fns class-variance-authority clsx tailwind-merge
npm install axios

# Dev dependencies
npm install -D jest @jest/globals ts-jest \
  @testing-library/react @testing-library/jest-dom \
  @types/jest playwright @playwright/test \
  eslint-plugin-jsx-a11y
```

### 4.3 Initialise Prisma
```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` — edit the `DATABASE_URL` line in `.env` to point to local Docker PostgreSQL.

### 4.4 Create Full Module Directory Structure
```bash
# Create all module directories
for module in core crm plans invoices claims banking automation reports notifications documents; do
  mkdir -p src/lib/modules/$module
  touch src/lib/modules/$module/index.ts
  touch src/lib/modules/$module/types.ts
  touch src/lib/modules/$module/service.ts
  touch src/lib/modules/$module/validation.ts
done

# Create shared directories
mkdir -p src/lib/events src/lib/db src/lib/auth src/lib/shared
mkdir -p src/components/ui src/components/layout src/components/accessibility
mkdir -p src/types

# Create app route groups (Next.js App Router)
mkdir -p "src/app/(auth)"
mkdir -p "src/app/(dashboard)"
mkdir -p "src/app/(crm)"
mkdir -p "src/app/(plans)"
mkdir -p "src/app/(invoices)"
mkdir -p "src/app/(claims)"
mkdir -p "src/app/(banking)"
mkdir -p "src/app/(reports)"
mkdir -p "src/app/(settings)"

# Create API routes
for route in core crm plans invoices claims banking automation reports notifications; do
  mkdir -p src/app/api/$route
done
```

### 4.5 Create Environment Template
Create `.env.example` (this goes in git — no real values):
```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/lotus_pm_dev"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"

# AWS
AWS_REGION="ap-southeast-2"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""

# AWS Services
S3_BUCKET_INVOICES=""
S3_BUCKET_DOCUMENTS=""
SES_FROM_EMAIL=""
SQS_INVOICE_QUEUE_URL=""
EVENTBRIDGE_BUS_NAME="lotus-pm-events"

# Cognito
COGNITO_USER_POOL_ID=""
COGNITO_CLIENT_ID=""
COGNITO_CLIENT_SECRET=""

# Xero
XERO_CLIENT_ID=""
XERO_CLIENT_SECRET=""

# PRODA (populated once Nicole gets API access)
PRODA_CLIENT_ID=""
PRODA_PRIVATE_KEY_PATH=""
PRODA_API_BASE_URL=""

# Monitoring
SENTRY_DSN=""
```

Copy to `.env.local` and fill in real values. **Never commit `.env.local`.**

Add to `.gitignore`:
```
.env.local
.env.*.local
.claude/mcp_settings.json
```

### 4.6 Configure TypeScript (Strict Mode)
Update `tsconfig.json` to add:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Step 4 Done When:**
- `npm run dev` starts the Next.js app on localhost:3000
- All module directories exist
- TypeScript strict mode is enabled
- `npm run build` completes without errors

---

## STEP 5 — Local Development Environment (Docker)

### 5.1 Create docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: lotus_pm_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: lotus_pm_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: lotus_pm_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  mailhog:
    image: mailhog/mailhog:latest
    container_name: lotus_pm_mail
    ports:
      - "1025:1025"   # SMTP (app sends to this)
      - "8025:8025"   # Web UI (view test emails at localhost:8025)

volumes:
  postgres_data:
  redis_data:
```

### 5.2 Start and Verify
```bash
docker-compose up -d

# Check all services are running
docker-compose ps

# Run initial database migration
npx prisma migrate dev --name init

# Verify database connection
npx prisma db push
```

**Step 5 Done When:**
- `docker-compose up -d` starts all three services
- `npx prisma studio` opens the database UI at localhost:5555
- MailHog web UI is accessible at localhost:8025

---

## STEP 6 — CI/CD Pipeline (GitHub Actions)

### 6.1 Create Test Workflow
Create `.github/workflows/test.yml`:
```yaml
name: Test

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: lotus_pm_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run TypeScript check
        run: npm run type-check

      - name: Run unit tests
        run: npm run test
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/lotus_pm_test

      - name: Run build check
        run: npm run build
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/lotus_pm_test
          NEXTAUTH_SECRET: test-secret-not-real
          NEXTAUTH_URL: http://localhost:3000
```

### 6.2 Add Scripts to package.json
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio",
    "db:seed": "ts-node scripts/seed.ts"
  }
}
```

### 6.3 Create Jest Config
Create `jest.config.ts`:
```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

export default createJestConfig(config)
```

Create `jest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

**Step 6 Done When:**
- Push a test branch with a small change → GitHub Actions runs automatically
- All checks show green in the PR
- A deliberate TypeScript error fails the check as expected

---

## STEP 7 — AWS Infrastructure (CDK)

### 7.1 Install AWS CDK
```bash
npm install -g aws-cdk
cdk --version
```

### 7.2 Create Infrastructure Directory
```bash
mkdir -p infrastructure
cd infrastructure
npx cdk init app --language typescript
npm install @aws-cdk/aws-ec2 @aws-cdk/aws-rds @aws-cdk/aws-s3 \
  @aws-cdk/aws-ecs @aws-cdk/aws-elasticache @aws-cdk/aws-cognito \
  @aws-cdk/aws-ses @aws-cdk/aws-sqs @aws-cdk/aws-events
```

### 7.3 Bootstrap CDK in AWS
```bash
# This sets up CDK in your AWS account (one-time)
cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-southeast-2
```

### 7.4 Define Core Infrastructure Stack
The CDK stack should define (in this order, as each depends on the previous):
1. **VPC** — isolated network in Sydney region
2. **Security Groups** — firewall rules for each service
3. **RDS PostgreSQL** — `db.t3.medium`, Multi-AZ off (save cost for now), encrypted storage
4. **ElastiCache Redis** — `cache.t3.micro`, single node
5. **S3 Buckets** — `lotus-pm-invoices`, `lotus-pm-documents`, both with server-side encryption
6. **Cognito User Pool** — with MFA enabled, email verification
7. **SES** — verify sending domain, set up receiving email address for invoices
8. **SQS Queues** — `lotus-pm-invoice-processing`, `lotus-pm-notifications`
9. **EventBridge** — custom event bus `lotus-pm-events`
10. **ECS Cluster + Fargate Service** — runs the Next.js app container
11. **Application Load Balancer** — routes traffic to Fargate
12. **CloudWatch Dashboards** — CPU, memory, error rates
13. **Budget Alerts** — SNS notifications at $200, $300, $400

### 7.5 Deploy Staging Environment
```bash
cd infrastructure
cdk deploy --context environment=staging
```

### 7.6 Configure Sentry
- Create account at sentry.io (free tier is sufficient initially)
- Create new project: Next.js
- Copy the DSN → add to environment variables
- Install: `npm install @sentry/nextjs`
- Run: `npx @sentry/wizard@latest -i nextjs`

**Step 7 Done When:**
- `cdk deploy` completes without errors
- AWS Console shows: RDS database, S3 buckets, ECS cluster, Cognito pool all exist in ap-southeast-2
- A test Next.js build can be deployed to ECS Fargate and accessed via browser
- Sentry receives a test event

---

## STEP 8 — First Module Smoke Test (Validates Everything Works)

Before declaring Phase 0 complete, run one end-to-end test using a Claude agent to validate the pipeline works.

### 8.1 Create a Test Issue in GitHub
Title: `[MODULE:CORE] Implement health check endpoint`
Labels: `module:core`, `priority:p1`
Description: Create a `/api/health` endpoint that returns `{ status: 'ok', timestamp: <ISO date> }`. Must include a passing Jest unit test.

### 8.2 Have Claude Agent Build It
Open a new Claude Code session. The agent should:
1. Read `CLAUDE.md` automatically
2. Pick up the issue
3. Create a branch `feat/core-health-check`
4. Build the endpoint and test
5. Commit and push
6. Create a PR

### 8.3 Validate the Pipeline
- [ ] GitHub Actions runs on the PR
- [ ] All checks pass (lint, types, tests, build)
- [ ] PR can be merged
- [ ] After merge to `develop`, staging deploys
- [ ] `curl https://staging.lotus-pm.com.au/api/health` returns `{ "status": "ok" }`

**Phase 0 Done When:**
- All 8 steps above are complete
- The health check endpoint is live on staging
- The full pipeline (code → PR → tests → merge → deploy) works end-to-end
- A fresh Claude Code session reads CLAUDE.md and demonstrates awareness of all locked requirements

---

## TRACKING

Use this checklist to track Phase 0 progress:

```
PREREQUISITES
  [ ] P1 — AWS Account + billing alerts + IAM user
  [ ] P2 — GitHub account + CLI authenticated
  [ ] P3 — Node.js 20 LTS installed
  [ ] P4 — Docker Desktop installed and running
  [ ] P5 — AWS CLI configured for ap-southeast-2

STEP 1 — GitHub Repository
  [ ] Repository created (private)
  [ ] Branch protection on main
  [ ] Labels created
  [ ] Issue templates created
  [ ] Project Kanban board created

STEP 2 — CLAUDE.md
  [ ] CLAUDE.md created with all 27 locked requirements
  [ ] Verified works in new session

STEP 3 — Claude Code Configuration
  [ ] .claude/settings.json created
  [ ] GitHub MCP configured and working
  [ ] GitHub token generated (fine-grained, lotus-pm only)

STEP 4 — Project Scaffolding
  [ ] Next.js scaffolded (npm run dev works)
  [ ] All dependencies installed
  [ ] All module directories created
  [ ] .env.example committed, .env.local populated
  [ ] TypeScript strict mode enabled

STEP 5 — Local Docker Environment
  [ ] docker-compose.yml created
  [ ] PostgreSQL running (port 5432)
  [ ] Redis running (port 6379)
  [ ] MailHog running (port 8025)
  [ ] Prisma connected to local DB

STEP 6 — CI/CD Pipeline
  [ ] test.yml GitHub Action created
  [ ] All npm scripts added to package.json
  [ ] Jest configured
  [ ] Test PR shows green checks

STEP 7 — AWS Infrastructure
  [ ] CDK bootstrapped
  [ ] Staging stack deployed
  [ ] All AWS services created in ap-southeast-2
  [ ] Sentry configured

STEP 8 — Smoke Test
  [ ] Health check issue created
  [ ] Agent built and tested it
  [ ] Full pipeline ran green
  [ ] Staging URL accessible

PHASE 0 COMPLETE ✓
```

---

## WHAT COMES NEXT (Phase 1 Preview)

Once Phase 0 is complete, Phase 1 begins immediately using the pipeline just built:

**GitHub Issues to Create (Claude agents will pick these up):**

1. `[MODULE:CORE] Database schema — core tables (users, roles, audit_log, sessions)`
2. `[MODULE:CORE] Authentication — NextAuth with Cognito provider, RBAC middleware`
3. `[MODULE:CORE] User management UI — create/edit/deactivate staff accounts`
4. `[MODULE:CRM] Database schema — participants, providers, contacts, communication_log`
5. `[MODULE:CRM] Participant profile — create, view, edit participant records`
6. `[MODULE:CRM] Provider registry — create, view, edit provider records with ABN validation`
7. `[MODULE:PLANS] Database schema — plans, plan_categories, budget_lines, spending`
8. `[MODULE:PLANS] Plan management — create plan, set budgets by NDIS category`
9. `[MODULE:PLANS] Budget tracking — real-time spend tracking against plan budgets`
10. `[MODULE:INVOICES] Invoice upload — manual upload, basic data entry form`
11. `[MODULE:INVOICES] Invoice validation — check against NDIS Price Guide 2025-26`
12. `[DASHBOARD] Main dashboard — invoice queue, budget alerts, recent activity`

**Each issue becomes a PR. Each PR is auto-tested. Each merge auto-deploys to staging.**

---

*Phase 0 Execution Plan v1.0 — February 2026*
*See also: docs/BUSINESS_CASE.md, CLAUDE.md*
